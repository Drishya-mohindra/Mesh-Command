import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function initDB() {
  const db = new Database(path.join(__dirname, "command-post.sqlite"));
  db.pragma("journal_mode = WAL");

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      nickname TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'civilian',
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS broadcasts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      author TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'civilian',
      message TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      author TEXT NOT NULL,
      category TEXT NOT NULL,
      note TEXT,
      urgency TEXT NOT NULL DEFAULT 'medium',
      status TEXT NOT NULL DEFAULT 'new',
      created_at INTEGER NOT NULL,
      resolved_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS map_pins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      author TEXT NOT NULL,
      label TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'person',
      lat REAL NOT NULL,
      lng REAL NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS activity_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_type TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
  `);

  return db;
}

// Seed some demo data so the board never looks empty at t=0 during a demo
export function seedDemoData(db) {
  const count = db.prepare("SELECT COUNT(*) as c FROM broadcasts").get().c;
  if (count > 0) return; // already seeded

  const now = Date.now();

  const insertBroadcast = db.prepare(
    `INSERT INTO broadcasts (author, role, message, created_at) VALUES (?, ?, ?, ?)`
  );
  insertBroadcast.run("Coordinator", "coordinator", "Command post is live. Nearest medical tent is at Gate 2.", now - 1000 * 60 * 12);
  insertBroadcast.run("Responder-Anita", "responder", "Water distribution restarting at 5 PM near the east fence.", now - 1000 * 60 * 6);

  const insertRequest = db.prepare(
    `INSERT INTO requests (author, category, note, urgency, status, created_at) VALUES (?, ?, ?, ?, ?, ?)`
  );
  insertRequest.run("Civilian-Ravi", "medical", "Elderly person needs insulin, block C.", "high", "new", now - 1000 * 60 * 4);
  insertRequest.run("Civilian-Meena", "water", "Family of 4 out of drinking water.", "medium", "acknowledged", now - 1000 * 60 * 9);
  insertRequest.run("Civilian-Farid", "shelter", "Tent damaged in last night's wind.", "low", "resolved", now - 1000 * 60 * 40);

  const insertPin = db.prepare(
    `INSERT INTO map_pins (author, label, type, lat, lng, created_at) VALUES (?, ?, ?, ?, ?, ?)`
  );
  insertPin.run("Coordinator", "Medical Tent", "resource", 23.2599, 77.4126, now - 1000 * 60 * 15);
  insertPin.run("Coordinator", "Water Point", "resource", 23.2605, 77.4140, now - 1000 * 60 * 15);

  // Seed the activity log too, so the dashboard's "activity over the last hour"
  // sparkline shows a plausible curve at t=0 instead of a flat line — same reason
  // the rest of the board is pre-seeded: it should never look empty on stage.
  const insertActivity = db.prepare(
    `INSERT INTO activity_log (event_type, created_at) VALUES (?, ?)`
  );
  const seedActivity = db.transaction(() => {
    // A gentle ramp over the last ~50 minutes, busiest in the recent buckets.
    const pattern = [
      { minsAgo: 50, events: ["connect"] },
      { minsAgo: 44, events: ["connect", "broadcast"] },
      { minsAgo: 40, events: ["connect", "request"] },
      { minsAgo: 33, events: ["connect", "connect", "request"] },
      { minsAgo: 25, events: ["broadcast", "request", "connect"] },
      { minsAgo: 18, events: ["connect", "connect", "request", "broadcast"] },
      { minsAgo: 12, events: ["broadcast", "connect", "request", "request"] },
      { minsAgo: 6, events: ["connect", "request", "broadcast", "connect"] },
      { minsAgo: 3, events: ["request", "connect"] },
    ];
    for (const { minsAgo, events } of pattern) {
      events.forEach((type, i) => {
        insertActivity.run(type, now - 1000 * 60 * minsAgo + i * 1000);
      });
    }
  });
  seedActivity();
}
