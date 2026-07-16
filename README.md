# 🛰️ Mesh Command Post

A self-hosted WiFi "town square" that needs **zero internet**. A laptop or
Raspberry Pi broadcasts its own WiFi network; anyone nearby joins and gets a
live coordination board — broadcast alerts, request resources, and see
everyone's location on a shared map.

Built for disaster response, blackout zones, remote events, or anywhere the
internet is unavailable or untrusted.

---

## Why this architecture

Everything here runs on the same LAN with **no cloud dependency**:

| Piece | Choice | Why |
|---|---|---|
| WiFi network | `hostapd` + `dnsmasq` | Turns the host into its own access point, no router/uplink needed |
| Auto-launch | Captive portal redirect | Joining the WiFi auto-opens the app, like hotel WiFi login |
| Backend | Node.js + Express + Socket.io | Real-time sync over the local network |
| Database | SQLite (file-based) | Zero-config, no external DB server |
| Frontend | React + Vite + Tailwind + Framer Motion | Fast, mobile-first, smooth demo animations |
| Map | Leaflet.js | Works with cached/offline tiles |
| "Auth" | Nickname + role, no OAuth | OAuth requires internet; this doesn't |

---

## Quick start (local dev, no Pi needed)

You can develop and demo this on a single laptop before deploying to a Pi.

**Terminal 1 — backend:**
```bash
cd server
npm install
npm run dev
# runs on http://localhost:3000
```

**Terminal 2 — frontend:**
```bash
cd client
npm install
npm run dev
# runs on http://localhost:5173, proxies /api and /socket.io to :3000
```

Open `http://localhost:5173` in two different browser windows (or your
phone on the same WiFi, pointed at your laptop's LAN IP) to see real-time
sync between "devices."

---

## Real offline deployment (Raspberry Pi)

1. Flash Raspberry Pi OS Lite onto a Pi (3B+ or newer recommended).
2. Copy this whole repo onto the Pi.
3. Build the frontend once, so the server can serve static files:
   ```bash
   cd client && npm install && npm run build
   ```
4. Run the setup script — this configures the Pi as a standalone access
   point and starts the server on port 80:
   ```bash
   cd ..
   sudo bash setup/setup-ap.sh
   ```
5. On any phone, join the WiFi network **"MeshCommandPost"**. The captive
   portal should auto-launch the app. If it doesn't, open a browser and go
   to `http://192.168.4.1`.
6. **Print the QR fallback.** Open `http://192.168.4.1/qr` on any connected
   device and print it (it's a clean, print-styled page). Tape it next to the
   Pi. This is the reliable join path — see below.

No SIM card, no router, no internet uplink required at any point.

---

## Joining: captive portal + QR fallback

Two ways a device gets onto the board, in order of how much you should trust them:

**1. Captive portal auto-launch (convenience, not guaranteed).**
When a phone joins WiFi it probes a known URL to check for internet. The server
answers each OS's probe (`/generate_204` for Android, `/hotspot-detect.html` for
iOS/macOS, `/connecttest.txt` + `/ncsi.txt` for Windows) with a redirect to the
app, which is what makes the "Sign in to network" sheet pop open automatically.

This is **inherently unreliable across a mixed room** and cannot be made 100%:

- Devices that probe over **HTTPS** can't be intercepted without a cert every
  phone would have to trust — that probe fails closed and no portal appears.
- The iOS/macOS captive browser is a stripped-down WKWebView (no service
  workers, restricted JS), so even when it opens, complex apps can misbehave.
- Some devices skip the check entirely or cache a past result.

**2. Printed QR code (the dependable path).**
The server generates a QR of its own AP IP entirely offline (`qrcode`, no CDN):

| Route | Returns |
|---|---|
| `GET /qr` | Printable HTML page: QR + the `http://192.168.4.1` URL + instructions |
| `GET /qr.svg` | Raw scalable SVG (crisp at any print size) |
| `GET /qr.png` | Raw PNG (for embedding elsewhere) |

Print `/qr`, tape it to the Pi, and anyone can scan to open the board regardless
of whether their captive portal fired. Treat this as the primary join method and
the captive portal as a nicety on top.

> For a **password-protected** deployment, the same mechanism can encode a WiFi
> join QR (`WIFI:S:<ssid>;T:WPA;P:<password>;;`) so one scan both joins the
> network and opens the board — see the security note at the bottom of this file.

---

## Folder structure

```
mesh-command-post/
├── server/                 # Express + Socket.io + SQLite backend
│   ├── index.js             # entrypoint, captive portal, device counter
│   ├── db.js                # schema + demo data seeding
│   └── routes/
│       ├── broadcasts.js
│       ├── requests.js
│       └── map.js
├── client/                 # React + Vite + Tailwind frontend
│   └── src/
│       ├── pages/            # Onboarding, Feed, Requests, MapView, Dashboard
│       ├── components/       # BroadcastCard, RequestTicket, NavBar, Toast, LiveCounter
│       ├── hooks/useSocket.ts
│       └── lib/               # api.ts, session.ts
└── setup/                  # Raspberry Pi access point configuration
    ├── hostapd.conf
    ├── dnsmasq.conf
    └── setup-ap.sh
```

---

## Must-complete-before-demo checklist

**Core:**
- [ ] Device broadcasts its own WiFi, no router/internet in the path
- [ ] Joining the WiFi auto-opens the app (or a QR code fallback to the AP IP)
- [ ] Nickname + role onboarding completes in under 10 seconds
- [ ] A broadcast posted on one phone appears instantly on a second phone
- [ ] A resource request appears live on the ticket board with correct urgency color
- [ ] Map shows at least 2 pinned locations, dropping a new pin works live
- [ ] Dashboard's device counter changes in real time as phones join/leave

**Polish:**
- [ ] Dark mode, smooth transitions on card add/remove
- [ ] Toasts on every user action
- [ ] Empty states designed, not blank screens
- [ ] Demo data pre-seeded (already handled by `seedDemoData` in `db.js`)

**Safety net:**
- [ ] Test the real offline scenario at least 3 times (airplane mode on all
      phones, only the AP WiFi enabled) before the actual demo
- [ ] Have a second phone pre-connected as backup in case live WiFi join
      glitches on stage
- [ ] Delete `server/command-post.sqlite` before the final demo run so the
      device counter and stats start clean (seeded demo data will repopulate)

---

## Demo script (90 seconds)

1. **Hook (10s):** "When the internet goes down in a disaster zone, so does
   coordination. This runs with zero infrastructure." *(hold up the Pi)*
2. **Live moment (20s):** Power on the Pi. Everyone's phones see
   "MeshCommandPost" in their WiFi list. Judge connects — captive portal
   auto-opens the app.
3. **Core flow (30s):** Post a broadcast from your phone → it appears
   instantly on the judge's phone. Submit a "medical — high urgency"
   request → watch it animate onto the ticket board in real time.
4. **Dashboard payoff (20s):** Switch to the big screen — live device
   counter ticking up, requests-by-category chart, average response time.
5. **Close (10s):** "No SIM card, no router, no internet — a disaster zone
   gets a coordination layer in under 60 seconds."

---

## Security: the network is open on purpose

**The AP ships unencrypted.** Anyone in radio range can join, read the board, and
post to it, and traffic is unencrypted over the air.

That is a **deliberate demo-speed tradeoff, not an oversight**. In a crisis — and
on a demo floor — the cost of handing every person a passphrase before they can
ask for help is higher than the cost of an open network in a room you can see.

**For any real-world deployment, turn it on.** Uncomment the WPA2 block in
`setup/hostapd.conf` and set a real passphrase:

```conf
wpa=2
wpa_passphrase=your-real-passphrase
wpa_key_mgmt=WPA-PSK
rsn_pairwise=CCMP
```

(Note `wpa_pairwise=TKIP` is deliberately absent — TKIP is deprecated and
insecure. `rsn_pairwise=CCMP` alone gives you WPA2-AES.)

The reason it's safe to do this without wrecking join times: **distribute the
passphrase by QR**, the same mechanism as the join code. The server generates a
standard WiFi QR so one scan both joins the network and hands over the
passphrase — the passphrase stops being a barrier, which was the only reason to
leave it open:

```bash
AP_SSID="MeshCommandPost-742" AP_PASSPHRASE="your-real-passphrase" npm start
# then print:  http://192.168.4.1/qr-wifi.svg
```

It encodes the conventional `WIFI:S:<ssid>;T:WPA;P:<password>;;` format. Print it
next to the `/qr` board code: **scan one to join the WiFi, scan the other to open
the board.** `/qr-wifi.svg` returns 404 while the network is open, since there'd
be nothing to hand out.

| Deployment | Network | Join path |
|---|---|---|
| Hackathon demo (default) | Open | `/qr` board code only |
| Real-world / sensitive | WPA2 + passphrase | `/qr-wifi.svg` to join, then `/qr` |

---

## Offline map tiles

The map never silently fails. On mount, `MapView.tsx` probes for a real tile
(the exact tile at the venue center, not a generic one) and picks a source in
this order:

| Order | Source | When it's used |
|---|---|---|
| 1 | `/tiles/{z}/{x}/{y}.png` (local `.mbtiles` pack) | A pack is present on the Pi — **the true offline path** |
| 2 | `https://{s}.tile.openstreetmap.org/...` | No pack, but internet is reachable (convenience for laptop demos) |
| 3 | Demo grid (canvas gridlines, no basemap) | Neither — shows a **"DEMO MODE — offline map"** badge |

The grid fallback keeps Leaflet's coordinate system live, so dropping and
viewing pins works perfectly with no basemap at all. You get a labeled,
obviously-intentional demo map instead of a blank grey square.

### Pre-generating a tile pack for your venue

`.mbtiles` is just a SQLite file, so the server reads it with the
`better-sqlite3` it already depends on — no extra package, nothing that phones
home.

1. Pick your venue's bounding box (e.g. from [bboxfinder.com](http://bboxfinder.com)).
2. Download a pack for just that area and zoom range. Keep the zoom range tight
   (z14–z18 is plenty for a venue) or the file gets huge:
   ```bash
   # Option A: tilemaker / mbutil / any XYZ->mbtiles tool you like.
   # Option B: the simplest, using the `tl` (tilelive) CLI:
   npm install -g @mapbox/tilelive @mapbox/mbtiles tl
   tl copy -z 14 -Z 18 \
     -b "77.38 23.24 77.44 23.28" \
     "https://a.tile.openstreetmap.org/{z}/{x}/{y}.png" \
     "mbtiles:///tmp/venue.mbtiles"
   ```
   Do this **once, while you still have internet** — obviously.
3. Copy the pack onto the Pi as `server/tiles.mbtiles` (or point `MBTILES_PATH`
   at it):
   ```bash
   cp /tmp/venue.mbtiles server/tiles.mbtiles
   ```
4. Restart the server. It logs which path it took:
   ```
   🗺️  Offline tile pack loaded: /home/pi/mesh-command-post/server/tiles.mbtiles
   ```
   (or `No offline tile pack at … — map will use online tiles or the demo grid.`)

Verify with `curl -o /dev/null -w "%{http_code}" http://192.168.4.1/tiles/16/46280/28399.png`
— `200` means tiles are being served locally; `404` means no pack and the client
will fall back.

> Respect the tile provider's usage policy when bulk-downloading. Keep the area
> and zoom range to what your venue actually needs.

Set your venue's coordinates in `DEFAULT_CENTER` / `DEFAULT_ZOOM` at the top of
`client/src/pages/MapView.tsx`.
