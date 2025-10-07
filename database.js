// database.js
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}
const dbFile = path.join(dataDir, 'app.sqlite');

// open SQLite DB (file-backed)
const db = new sqlite3.Database(dbFile, (err) => {
  if (err) {
    console.error('Failed to open SQLite DB', err);
    process.exit(1);
  } else {
    console.log('Opened SQLite DB at', dbFile);
  }
});

// We'll use a single DB handle for both "db" and "chatDb" to avoid divergence
const chatDb = db;

// initialize schema (safe to call on every start)
function initSchema() {
  // users table (for auth)
  db.run(
    `CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL
    );`
  );

  // messages table
  db.run(
    `CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      sender_id INTEGER NOT NULL,
      receiver_id INTEGER NOT NULL,
      content TEXT,
      timestamp TEXT,
      FOREIGN KEY(sender_id) REFERENCES users(id),
      FOREIGN KEY(receiver_id) REFERENCES users(id)
    );`
  );

  // friends table
  db.run(
    `CREATE TABLE IF NOT EXISTS friends (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      friend_id INTEGER NOT NULL,
      UNIQUE(user_id, friend_id)
    );`
  );

  // friend_requests table
  db.run(
    `CREATE TABLE IF NOT EXISTS friend_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sender_id INTEGER NOT NULL,
      receiver_id INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending'
    );`
  );
}

initSchema();

// helper to remove friendship (two-way)
function removeFriend(userId, friendId, callback) {
  const sql = `DELETE FROM friends
               WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)`;
  db.run(sql, [userId, friendId, friendId, userId], function (err) {
    if (err) return callback(err);
    return callback(null, this.changes);
  });
}

module.exports = {
  db,
  chatDb,
  removeFriend
};
