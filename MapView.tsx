import { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMapEvents, useMap } from "react-leaflet";
import L from "leaflet";
import { api } from "../lib/api";
import { getSession } from "../lib/session";
import { useSocket } from "../hooks/useSocket";
import { useToast } from "../components/Toast";
import OfflineBanner from "../components/OfflineBanner";

interface Pin {
  id: number;
  author: string;
  label: string;
  type: string;
  lat: number;
  lng: number;
  created_at: number;
}

// Default venue center — replace with your actual event coordinates.
const DEFAULT_CENTER: [number, number] = [23.2599, 77.4126];
const DEFAULT_ZOOM = 16;

// Tile sources, tried in order of "most offline-correct" first:
//   local  = an .mbtiles pack served by our own server at /tiles/... (true offline)
//   online = the public OpenStreetMap tile server (needs internet — demo convenience)
//   grid   = no basemap at all; a labeled demo-mode grid so pins still work offline
const LOCAL_TILE_URL = "/tiles/{z}/{x}/{y}.png";
const ONLINE_TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";

type TileMode = "checking" | "local" | "online" | "grid";

// Web-mercator lng/lat -> XYZ tile index, so we can probe the exact tile that
// will actually be displayed (not a generic 0/0/0 that a venue pack may not include).
function tileForCenter([lat, lng]: [number, number], z: number) {
  const n = 2 ** z;
  const x = Math.floor(((lng + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n);
  return { x, y };
}

// Try to load one real tile from a template URL, with a short timeout. Loading an
// <img> needs no CORS and works cross-origin, so it's a reliable availability probe.
function probeTile(templateUrl: string, z: number, x: number, y: number, timeoutMs = 2500): Promise<boolean> {
  return new Promise((resolve) => {
    const url = templateUrl
      .replace("{s}", "a")
      .replace("{z}", String(z))
      .replace("{x}", String(x))
      .replace("{y}", String(y));
    const img = new Image();
    let done = false;
    const finish = (ok: boolean) => { if (!done) { done = true; resolve(ok); } };
    const timer = setTimeout(() => finish(false), timeoutMs);
    img.onload = () => { clearTimeout(timer); finish(true); };
    img.onerror = () => { clearTimeout(timer); finish(false); };
    img.src = url;
  });
}

// A no-basemap fallback: draws graph-paper gridlines on canvas tiles. This keeps
// Leaflet's coordinate system live (so dropping/rendering pins by lat/lng still
// works) without loading a single byte from the internet.
function OfflineGrid() {
  const map = useMap();
  useEffect(() => {
    const GridLayer = L.GridLayer.extend({
      createTile(this: L.GridLayer, _coords: L.Coords, done: L.DoneCallback) {
        const tile = document.createElement("canvas");
        const size = this.getTileSize();
        tile.width = size.x;
        tile.height = size.y;
        const ctx = tile.getContext("2d");
        if (ctx) {
          ctx.fillStyle = "#0f1420";
          ctx.fillRect(0, 0, size.x, size.y);
          ctx.strokeStyle = "rgba(148,163,184,0.15)";
          ctx.lineWidth = 1;
          const step = 32;
          for (let i = step; i < size.x; i += step) {
            ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, size.y); ctx.stroke();
          }
          for (let j = step; j < size.y; j += step) {
            ctx.beginPath(); ctx.moveTo(0, j); ctx.lineTo(size.x, j); ctx.stroke();
          }
          ctx.strokeStyle = "rgba(148,163,184,0.35)";
          ctx.strokeRect(0.5, 0.5, size.x - 1, size.y - 1);
        }
        // Leaflet renders tiles at opacity 0 until they're marked loaded, and it
        // only marks them loaded when done() fires. Drawing synchronously and
        // returning the canvas is NOT enough — without this the grid is invisible
        // and the container's default grey shows through instead.
        setTimeout(() => done(undefined, tile), 0);
        return tile;
      },
    });
    const layer = new GridLayer();
    layer.addTo(map);
    return () => { map.removeLayer(layer); };
  }, [map]);
  return null;
}

const TYPE_COLOR: Record<string, string> = {
  resource: "#22d3ee",
  person: "#f59e0b",
  hazard: "#ef4444",
};

function pinIcon(type: string) {
  const color = TYPE_COLOR[type] || TYPE_COLOR.person;
  return L.divIcon({
    className: "",
    html: `<div style="width:16px;height:16px;border-radius:50%;background:${color};border:2px solid white;box-shadow:0 0 0 2px rgba(0,0,0,0.3)"></div>`,
    iconSize: [16, 16],
  });
}

function ClickToPlace({ onPlace }: { onPlace: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onPlace(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

export default function MapView() {
  const [pins, setPins] = useState<Pin[]>([]);
  const [placing, setPlacing] = useState(false);
  const [pendingCoords, setPendingCoords] = useState<[number, number] | null>(null);
  const [label, setLabel] = useState("");
  const [type, setType] = useState("person");
  const [tileMode, setTileMode] = useState<TileMode>("checking");
  const { socket, connected } = useSocket();
  const toast = useToast();
  const session = getSession();

  useEffect(() => {
    api.getPins().then(setPins).catch(() => toast("Couldn't load map pins.", "error"));
  }, []);

  // Pre-flight tile availability check so an offline deployment shows a labeled
  // demo grid instead of a silent blank-grey map. Prefer a locally served
  // .mbtiles pack, then online OSM, then the grid.
  useEffect(() => {
    let cancelled = false;
    const { x, y } = tileForCenter(DEFAULT_CENTER, DEFAULT_ZOOM);
    (async () => {
      if (await probeTile(LOCAL_TILE_URL, DEFAULT_ZOOM, x, y)) {
        if (!cancelled) setTileMode("local");
        return;
      }
      if (await probeTile(ONLINE_TILE_URL, DEFAULT_ZOOM, x, y)) {
        if (!cancelled) setTileMode("online");
        return;
      }
      if (!cancelled) setTileMode("grid");
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    function onNewPin(p: Pin) {
      setPins((prev) => [p, ...prev]);
    }
    socket.on("pin:new", onNewPin);
    return () => {
      socket.off("pin:new", onNewPin);
    };
  }, [socket]);

  async function confirmPin() {
    if (!pendingCoords || !label.trim() || !session) return;
    if (!connected) {
      toast("Not connected — move closer to the access point.", "error");
      return;
    }
    try {
      await api.postPin(session.nickname, label.trim(), type, pendingCoords[0], pendingCoords[1]);
      toast("Pin dropped on the shared map.", "success");
      setPendingCoords(null);
      setLabel("");
      setPlacing(false);
    } catch (e: any) {
      toast(e.message || "Couldn't drop pin.", "error");
    }
  }

  return (
    <div className="relative min-h-screen bg-base pb-24">
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-white/5 bg-base/95 px-4 py-4 backdrop-blur">
        <h1 className="text-lg font-semibold">Shared Map</h1>
        <button
          onClick={() => setPlacing((p) => !p)}
          className={`rounded-full px-4 py-2 text-sm font-semibold ${
            placing ? "bg-red-500/20 text-red-400" : "bg-accent text-base"
          }`}
        >
          {placing ? "Cancel" : "+ Drop pin"}
        </button>
      </header>

      <OfflineBanner connected={connected} />

      {placing && !pendingCoords && (
        <div className="bg-accent/10 px-4 py-2 text-center text-xs text-accent">
          Tap anywhere on the map to place a pin
        </div>
      )}

      <div className="relative h-[calc(100vh-140px)] w-full">
        {/* Demo-mode badge: make the no-basemap fallback obviously intentional. */}
        {tileMode === "grid" && (
          <div className="pointer-events-none absolute left-1/2 top-3 z-[500] -translate-x-1/2 rounded-full bg-amber-500/90 px-3 py-1 text-[11px] font-semibold text-black shadow-lg">
            DEMO MODE — offline map (no basemap tiles)
          </div>
        )}
        <MapContainer center={DEFAULT_CENTER} zoom={DEFAULT_ZOOM} className="h-full w-full" zoomControl={false}>
          {/*
            Tile source is chosen by the pre-flight probe above:
            - local  .mbtiles pack served at /tiles/{z}/{x}/{y}.png (true offline)
            - online public OpenStreetMap (needs internet)
            - grid   labeled demo fallback, no basemap
            See README "Offline map tiles" for generating a local pack.
          */}
          {tileMode === "local" && (
            <TileLayer url={LOCAL_TILE_URL} attribution="Offline tile pack" />
          )}
          {tileMode === "online" && (
            <TileLayer url={ONLINE_TILE_URL} attribution="&copy; OpenStreetMap contributors" />
          )}
          {(tileMode === "grid" || tileMode === "checking") && <OfflineGrid />}
          {placing && <ClickToPlace onPlace={(lat, lng) => setPendingCoords([lat, lng])} />}
          {pins.map((pin) => (
            <Marker key={pin.id} position={[pin.lat, pin.lng]} icon={pinIcon(pin.type)}>
              {/*
                XSS-SAFE: pin.label / pin.author / pin.type are rendered as React
                children, which React auto-escapes — a <script> in a label shows as
                inert text. Do NOT rewrite this as L.popup().setContent(`...${pin.label}...`)
                or dangerouslySetInnerHTML: Leaflet's setContent injects a raw HTML
                string and would turn stored pin text into a live injection point.
                (Server also stores this text verbatim via parameterized queries.)
              */}
              <Popup>
                <strong>{pin.label}</strong>
                <br />
                <span className="capitalize">{pin.type}</span> · by {pin.author}
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>

      {pendingCoords && (
        <div className="fixed inset-x-0 bottom-16 z-40 mx-auto max-w-md rounded-t-3xl bg-surface p-5 shadow-2xl">
          <h3 className="mb-3 text-sm font-semibold">Name this pin</h3>
          <input
            autoFocus
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Water Point, Medical Tent"
            className="mb-3 w-full rounded-xl border border-white/10 bg-surface2 px-4 py-2.5 text-sm outline-none focus:border-accent"
          />
          <div className="mb-3 flex gap-2">
            {["person", "resource", "hazard"].map((t) => (
              <button
                key={t}
                onClick={() => setType(t)}
                className={`flex-1 rounded-xl py-2 text-xs font-medium capitalize ${
                  type === t ? "bg-accent text-base" : "bg-surface2 text-zinc-300"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
          <button
            onClick={confirmPin}
            disabled={!label.trim() || !connected}
            className="w-full rounded-xl bg-accent py-3 font-semibold text-base disabled:opacity-40"
          >
            {connected ? "Drop pin" : "Not connected"}
          </button>
        </div>
      )}
    </div>
  );
}
