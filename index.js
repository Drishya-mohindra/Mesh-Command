import express from "express";
import cors from "cors";
import { createServer } from "http";
import { Server } from "socket.io";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { nanoid } from "nanoid";
import QRCode from "qrcode";

import { initDB, seedDemoData } from "./db.js";
import { Presence } from "./presence.js";
import { requiredString, enumValue, errorHandler } from "./validate.js";
import { rateLimit } from "./rateLimit.js";
import tilesRouter from "./tiles.js";
import broadcastsRouter from "./routes/broadcasts.js";
import requestsRouter from "./routes/requests.js";
import mapRouter from "./routes/map.js";
import activityRouter from "./routes/activity.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000; // use 3000 for local dev; run on :80 on the Pi via setup script
const AP_IP = process.env.AP_IP || "192.168.4.1"; // the Pi's own IP once hostapd is running

// ---- Last-resort crash guards ----
// If an unexpected error escapes a request handler or a socket callback, the
// default Node behavior is to print a stack and exit — taking the whole command
// post dark and dropping every connected phone at once. During a live demo that
// is the worst possible failure. So we log loudly and stay up on a best-effort
// basis; the systemd unit (setup/mesh-command-post.service, Restart=always) is
// the real safety net if the process is ever genuinely unrecoverable and does die.
process.on("uncaughtException", (err) => {
  console.error(`[${new Date().toISOString()}] UNCAUGHT EXCEPTION — staying up:`, err);
});
process.on("unhandledRejection", (reason) => {
  console.error(`[${new Date().toISOString()}] UNHANDLED REJECTION — staying up:`, reason);
});

const db = initDB();
seedDemoData(db);

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: "*" } });

app.use(cors());
app.use(express.json());

// ---- Simple nickname-based "auth" (no internet, so no OAuth) ----
const ROLES = ["civilian", "responder", "coordinator"];

// Two people both joining as "Anita" is actively dangerous in a coordination
// scenario (a responder acting on the wrong Anita's request). We resolve this by
// auto-suffixing a colliding name (Anita -> Anita-2) rather than hard-blocking:
// the demo keeps moving with zero extra taps, two identical *active* names never
// coexist, and the client surfaces the rename to the user. "Active" = joined
// within ACTIVE_WINDOW_MS, so a name freed up long ago becomes reusable.
//
// No race: better-sqlite3 is synchronous and Node is single-threaded, so this
// handler's collision check and insert run atomically relative to other requests.
const ACTIVE_WINDOW_MS = Number(process.env.ACTIVE_WINDOW_MS) || 30 * 60 * 1000;

function resolveNickname(requested) {
  const cutoff = Date.now() - ACTIVE_WINDOW_MS;
  const rows = db.prepare("SELECT nickname FROM users WHERE created_at >= ?").all(cutoff);
  const activeNorm = new Set(rows.map((r) => r.nickname.trim().toLowerCase()));
  const norm = requested.trim().toLowerCase();
  if (!activeNorm.has(norm)) return { nickname: requested, renamedFrom: null };
  for (let n = 2; n < 1000; n++) {
    const candidate = `${requested}-${n}`;
    if (!activeNorm.has(candidate.toLowerCase())) {
      return { nickname: candidate, renamedFrom: requested };
    }
  }
  // Absurd fallback (1000+ same name active): random suffix so we never loop forever.
  return { nickname: `${requested}-${Math.floor(Math.random() * 9000 + 1000)}`, renamedFrom: requested };
}

app.post("/api/auth/join", (req, res, next) => {
  try {
    const body = req.body || {};
    const requested = requiredString(body.nickname, "Nickname", 40);
    const role = enumValue(body.role, "role", ROLES, "civilian");
    const { nickname, renamedFrom } = resolveNickname(requested);
    const id = nanoid(10);
    const created_at = Date.now();
    db.prepare(`INSERT INTO users (id, nickname, role, created_at) VALUES (?, ?, ?, ?)`).run(
      id,
      nickname,
      role,
      created_at
    );
    // Return the stored (possibly suffixed) nickname so the client's session
    // matches the DB; renamedFrom is set when we disambiguated a collision.
    res.status(201).json({ id, nickname, role, renamedFrom });
  } catch (e) {
    next(e);
  }
});

// ---- Health / pre-demo sanity check ----
// Hit this before going on stage: one call tells you the server is up, how many
// devices are really connected (from the presence Map, not a trusted integer),
// and that the DB has rows in it.
app.get("/api/health", (req, res) => {
  const count = (table) => db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get().c;
  res.json({
    status: "ok",
    uptimeSeconds: Math.round(process.uptime()),
    devicesOnline: presence.count,
    devices: presence.snapshot(),
    rows: {
      users: count("users"),
      broadcasts: count("broadcasts"),
      requests: count("requests"),
      map_pins: count("map_pins"),
      activity_log: count("activity_log"),
    },
    tilePack: fs.existsSync(process.env.MBTILES_PATH || path.join(__dirname, "tiles.mbtiles")),
  });
});

// ---- Feature routes ----
// Throttle the two endpoints a double-tap can flood. Applied only to POST so
// reading the board and advancing ticket status stay unthrottled.
const writeLimiter = rateLimit({ windowMs: Number(process.env.RATE_LIMIT_MS) || 3000 });
app.post("/api/broadcasts", writeLimiter);
app.post("/api/requests", writeLimiter);

app.use("/api/broadcasts", broadcastsRouter(db, io));
app.use("/api/requests", requestsRouter(db, io));
app.use("/api/map", mapRouter(db, io));
app.use("/api/activity", activityRouter(db));

// ---- Offline map tiles (served from an .mbtiles pack if present, else 404) ----
app.get("/tiles/:z/:x/:y.png", tilesRouter());

// ---- Captive portal detection ----
// Phones/laptops probe these URLs right after joining WiFi to check for internet.
// Each OS has a specific "internet is fine" response it looks for; when it gets
// anything else it concludes "there's a captive portal" and opens a browser at
// the redirect target — which is exactly what we want, since we have no uplink.
//
//   Android  -> GET /generate_204 : expects "204 No Content". A 302 instead makes
//               it show the "Sign in to network" notification and open the portal.
//   iOS/macOS-> GET /hotspot-detect.html : expects a 200 whose body is literally
//               "Success". A 302 makes the Captive Network Assistant open the app.
//   Windows  -> GET /connecttest.txt : expects body "Microsoft Connect Test", and
//               /ncsi.txt -> "Microsoft NCSI". A 302 triggers "Action needed".
//
// So a 302 redirect to the app is the single most broadly-compatible way to TRIGGER
// the portal across all three. The critical detail is the no-store headers: OS
// connectivity checks cache aggressively, and a cached probe result will stop the
// portal from re-firing on the next join — a silent, hard-to-debug demo failure.
//
// NOTE: this is inherently unreliable across a mixed room (HTTPS probes fail closed,
// some devices skip the check entirely), which is why the /qr fallback below and the
// printed QR in setup/ exist. Captive portal auto-launch is a convenience, not the
// contract.
const captivePortalPaths = [
  "/generate_204",          // Android
  "/gen_204",
  "/hotspot-detect.html",   // iOS / macOS
  "/library/test/success.html",
  "/connecttest.txt",       // Windows
  "/ncsi.txt",
  "/redirect",              // Windows (older) / generic
  "/canonical.html",        // Firefox / some Linux NetworkManager checks
];
app.get(captivePortalPaths, (req, res) => {
  // Never let a connectivity probe be cached, or the portal won't re-trigger.
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");
  res.redirect(302, `http://${AP_IP}/`);
});

// ---- QR fallback ----
// Captive portal auto-launch cannot be made 100% reliable across a mixed room of
// devices (HTTPS probes fail closed, some OSes skip the check). The dependable path
// is a QR code printed on paper next to the Pi that points at the AP's own IP.
// Generated server-side with `qrcode` (pure JS, no internet needed).
const JOIN_URL = `http://${AP_IP}/`;

// Raw scalable SVG — crisp at any print size.
app.get("/qr.svg", async (req, res) => {
  try {
    const svg = await QRCode.toString(JOIN_URL, { type: "svg", margin: 2, width: 512 });
    res.set("Content-Type", "image/svg+xml");
    res.set("Cache-Control", "no-store");
    res.send(svg);
  } catch (e) {
    res.status(500).json({ error: "Could not generate QR code." });
  }
});

// Raw PNG — for embedding in other docs.
app.get("/qr.png", async (req, res) => {
  try {
    const buf = await QRCode.toBuffer(JOIN_URL, { margin: 2, width: 512 });
    res.set("Content-Type", "image/png");
    res.set("Cache-Control", "no-store");
    res.send(buf);
  } catch (e) {
    res.status(500).json({ error: "Could not generate QR code." });
  }
});

// WiFi join QR — only meaningful when the AP is password-protected (see the
// security note in setup/hostapd.conf). Scanning this joins the WiFi *and* hands
// over the passphrase, which is what makes WPA2 practical without destroying the
// "join in seconds" demo speed. Uses the standard WIFI: QR convention.
// Configure with: AP_SSID="MeshCommandPost-742" AP_PASSPHRASE="secret123"
const AP_SSID = process.env.AP_SSID || "";
const AP_PASSPHRASE = process.env.AP_PASSPHRASE || "";

// Escape the WIFI: payload's delimiters, or an SSID/passphrase containing ; : , \
// would silently corrupt the QR into an unscannable/incorrect network.
function escapeWifiField(value) {
  return String(value).replace(/([\\;:,"])/g, "\\$1");
}

app.get("/qr-wifi.svg", async (req, res) => {
  if (!AP_SSID || !AP_PASSPHRASE) {
    return res.status(404).json({
      error: "No WiFi passphrase configured — the AP is open, so a WiFi QR isn't needed. Set AP_SSID and AP_PASSPHRASE to enable this.",
    });
  }
  try {
    const payload = `WIFI:S:${escapeWifiField(AP_SSID)};T:WPA;P:${escapeWifiField(AP_PASSPHRASE)};;`;
    const svg = await QRCode.toString(payload, { type: "svg", margin: 2, width: 512 });
    res.set("Content-Type", "image/svg+xml");
    res.set("Cache-Control", "no-store");
    res.send(svg);
  } catch (e) {
    res.status(500).json({ error: "Could not generate WiFi QR code." });
  }
});

// Printable landing page: QR + the plain URL, so an operator can print one sheet
// and tape it to the Pi. JOIN_URL is server-controlled (AP_IP), so there's no
// user input reflected into this HTML.
app.get("/qr", async (req, res) => {
  try {
    const svg = await QRCode.toString(JOIN_URL, { type: "svg", margin: 2, width: 320 });
    res.set("Content-Type", "text/html; charset=utf-8");
    res.set("Cache-Control", "no-store");
    res.send(`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Join Mesh Command Post</title>
<style>
  :root { color-scheme: light; }
  body { font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
         margin: 0; padding: 40px 20px; text-align: center; color: #111; background: #fff; }
  h1 { font-size: 24px; margin: 0 0 4px; }
  p  { font-size: 16px; color: #444; margin: 6px 0; }
  .qr { width: 320px; max-width: 80vw; margin: 20px auto; }
  .url { font-size: 20px; font-weight: 700; letter-spacing: 0.5px; margin-top: 12px; }
  .hint { font-size: 13px; color: #777; margin-top: 24px; }
  @media print { .hint { display: none; } body { padding: 20px; } }
</style>
</head>
<body>
  <h1>🛰️ Mesh Command Post</h1>
  <p>Scan to join the coordination board</p>
  <div class="qr">${svg}</div>
  <p class="url">${JOIN_URL}</p>
  <p>Already on the WiFi? Just open that address in any browser.</p>
  <p class="hint">Print this page and tape it next to the access point.</p>
</body>
</html>`);
  } catch (e) {
    res.status(500).send("Could not generate QR code.");
  }
});

// ---- Serve the built React app ----
app.use(express.static(path.join(__dirname, "../client/dist")));
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../client/dist/index.html"));
});

// ---- Error handler (must be last) ----
// Turns ValidationErrors into clean 400 JSON and malformed-JSON bodies into a
// readable 400, so the client's Toast always has an `error` string to show and
// no validation gap leaks through as a raw 500 HTML page.
app.use(errorHandler);

// ---- Live connected-device counter via Socket.io ----
// Counts distinct devices (by a stable per-tab clientId), debounced against
// WiFi flap, not raw socket connects. See server/presence.js for the why.
const presence = new Presence({ graceMs: Number(process.env.PRESENCE_GRACE_MS) || 4000 });

function clientIdOf(socket) {
  // Client sends a stable per-tab id in the handshake (see client useSocket.ts).
  // Fall back to socket.id only if a client somehow connects without one, so an
  // old/edge client still counts as *a* device rather than crashing.
  const fromAuth = socket.handshake.auth && socket.handshake.auth.clientId;
  const fromQuery = socket.handshake.query && socket.handshake.query.clientId;
  return String(fromAuth || fromQuery || socket.id);
}

io.on("connection", (socket) => {
  const clientId = clientIdOf(socket);
  const isNewDevice = presence.connect(clientId, socket.id);
  io.emit("stats:devices", presence.count);
  // Only log a connect event when a genuinely new device appears, so the
  // activity_log isn't polluted by reconnection churn.
  if (isNewDevice) {
    db.prepare(`INSERT INTO activity_log (event_type, created_at) VALUES ('connect', ?)`).run(Date.now());
  }

  socket.on("disconnect", () => {
    presence.disconnect(clientId, socket.id, () => {
      // Fired only after the grace window with no reconnect — a real departure.
      io.emit("stats:devices", presence.count);
      db.prepare(`INSERT INTO activity_log (event_type, created_at) VALUES ('disconnect', ?)`).run(Date.now());
    });
  });
});

httpServer.listen(PORT, () => {
  console.log(`\n🛰️  Mesh Command Post running on http://localhost:${PORT}`);
  console.log(`   On the Pi (after setup-ap.sh), reachable at http://${AP_IP}\n`);
});
