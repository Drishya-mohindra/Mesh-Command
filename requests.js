import { Router } from "express";
import { requiredString, optionalString, enumValue, ValidationError } from "../validate.js";

const CATEGORIES = ["medical", "water", "food", "shelter", "other"];
const URGENCIES = ["low", "medium", "high"];
const STATUSES = ["new", "acknowledged", "resolved"];

export default function requestsRouter(db, io) {
  const router = Router();

  router.get("/", (req, res) => {
    const rows = db.prepare("SELECT * FROM requests ORDER BY created_at DESC LIMIT 100").all();
    res.json(rows);
  });

  router.post("/", (req, res, next) => {
    try {
      const body = req.body || {};
      const author = requiredString(body.author, "Name", 40);
      const category = enumValue(body.category, "Category", CATEGORIES, undefined);
      if (category === undefined) {
        // category has no sensible default — it must be chosen.
        throw new ValidationError(`Category must be one of: ${CATEGORIES.join(", ")}.`);
      }
      const note = optionalString(body.note, "Details", 300);
      const urgency = enumValue(body.urgency, "Urgency", URGENCIES, "medium");
      const created_at = Date.now();

      const stmt = db.prepare(
        `INSERT INTO requests (author, category, note, urgency, status, created_at) VALUES (?, ?, ?, ?, 'new', ?)`
      );
      const info = stmt.run(author, category, note, urgency, created_at);
      const request = {
        id: info.lastInsertRowid,
        author,
        category,
        note,
        urgency,
        status: "new",
        created_at,
        resolved_at: null,
      };

      db.prepare(`INSERT INTO activity_log (event_type, created_at) VALUES (?, ?)`).run("request", created_at);

      io.emit("request:new", request);
      res.status(201).json(request);
    } catch (e) {
      next(e);
    }
  });

  // Move a request through New -> Acknowledged -> Resolved
  router.patch("/:id/status", (req, res, next) => {
    try {
      const body = req.body || {};
      const status = enumValue(body.status, "Status", STATUSES, undefined);
      if (status === undefined) {
        return res.status(400).json({ error: `Status must be one of: ${STATUSES.join(", ")}.` });
      }
      const id = Number(req.params.id);
      if (!Number.isInteger(id)) {
        return res.status(400).json({ error: "Invalid request id." });
      }
      // 404 if the id doesn't exist, rather than emitting an `undefined` update
      // that leaves every client's board in a confused state.
      const existing = db.prepare("SELECT id FROM requests WHERE id = ?").get(id);
      if (!existing) {
        return res.status(404).json({ error: "That request no longer exists." });
      }
      const resolved_at = status === "resolved" ? Date.now() : null;
      db.prepare(`UPDATE requests SET status = ?, resolved_at = ? WHERE id = ?`).run(status, resolved_at, id);
      const updated = db.prepare("SELECT * FROM requests WHERE id = ?").get(id);
      io.emit("request:update", updated);
      res.json(updated);
    } catch (e) {
      next(e);
    }
  });

  // Aggregate stats for the dashboard
  router.get("/stats/summary", (req, res) => {
    const byCategory = db
      .prepare("SELECT category, COUNT(*) as count FROM requests GROUP BY category")
      .all();
    const byStatus = db
      .prepare("SELECT status, COUNT(*) as count FROM requests GROUP BY status")
      .all();
    const resolvedRows = db
      .prepare("SELECT created_at, resolved_at FROM requests WHERE resolved_at IS NOT NULL")
      .all();
    const avgResponseMs =
      resolvedRows.length > 0
        ? resolvedRows.reduce((sum, r) => sum + (r.resolved_at - r.created_at), 0) / resolvedRows.length
        : 0;

    res.json({
      byCategory,
      byStatus,
      avgResponseMinutes: Math.round((avgResponseMs / 60000) * 10) / 10,
      totalRequests: db.prepare("SELECT COUNT(*) as c FROM requests").get().c,
    });
  });

  return router;
}
