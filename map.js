import { Router } from "express";
import { requiredString, enumValue, numberInRange } from "../validate.js";

const PIN_TYPES = ["person", "resource", "hazard"];

export default function mapRouter(db, io) {
  const router = Router();

  router.get("/", (req, res) => {
    const rows = db.prepare("SELECT * FROM map_pins ORDER BY created_at DESC LIMIT 200").all();
    res.json(rows);
  });

  router.post("/", (req, res, next) => {
    try {
      const body = req.body || {};
      const author = requiredString(body.author, "Name", 40);
      const label = requiredString(body.label, "Label", 60);
      const type = enumValue(body.type, "Pin type", PIN_TYPES, "person");
      // Reject non-numbers and out-of-range coords (see validate.js): a clamped
      // pin lands somewhere it isn't, which is dangerous on a coordination map.
      const lat = numberInRange(body.lat, "Latitude", -90, 90);
      const lng = numberInRange(body.lng, "Longitude", -180, 180);
      const created_at = Date.now();

      const stmt = db.prepare(
        `INSERT INTO map_pins (author, label, type, lat, lng, created_at) VALUES (?, ?, ?, ?, ?, ?)`
      );
      const info = stmt.run(author, label, type, lat, lng, created_at);
      // NOTE (XSS): `label`, `author`, `type` are rendered in the Leaflet Popup in
      // client/src/pages/MapView.tsx as React children, which React escapes. Do NOT
      // switch that Popup to L.popup().setContent(htmlString) — that path injects raw
      // HTML and would make this stored text an XSS vector. Text is stored verbatim
      // here (parameterized query, so no SQL injection) and must stay inert on render.
      const pin = { id: info.lastInsertRowid, author, label, type, lat, lng, created_at };

      io.emit("pin:new", pin);
      res.status(201).json(pin);
    } catch (e) {
      next(e);
    }
  });

  return router;
}
