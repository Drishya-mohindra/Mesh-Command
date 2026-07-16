import { Router } from "express";
import { requiredString, enumValue } from "../validate.js";

const ROLES = ["civilian", "responder", "coordinator"];

export default function broadcastsRouter(db, io) {
  const router = Router();

  router.get("/", (req, res) => {
    const rows = db.prepare("SELECT * FROM broadcasts ORDER BY created_at DESC LIMIT 50").all();
    res.json(rows);
  });

  router.post("/", (req, res, next) => {
    try {
      const body = req.body || {};
      const author = requiredString(body.author, "Name", 40);
      const role = enumValue(body.role, "role", ROLES, "civilian");
      const message = requiredString(body.message, "Message", 500);
      const created_at = Date.now();

      const stmt = db.prepare(
        `INSERT INTO broadcasts (author, role, message, created_at) VALUES (?, ?, ?, ?)`
      );
      const info = stmt.run(author, role, message, created_at);
      // Emit exactly what we stored (trimmed/truncated), so REST response, socket
      // payload, and DB row are byte-identical — no "one client shows the raw text,
      // another shows the truncated text" drift.
      const broadcast = { id: info.lastInsertRowid, author, role, message, created_at };

      db.prepare(`INSERT INTO activity_log (event_type, created_at) VALUES (?, ?)`).run("broadcast", created_at);

      io.emit("broadcast:new", broadcast);
      res.status(201).json(broadcast);
    } catch (e) {
      next(e);
    }
  });

  return router;
}
