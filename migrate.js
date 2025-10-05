const { db, chatDb } = require('./database.js');

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      email TEXT UNIQUE,
      password TEXT
    )
  `, (err) => {
    if (err) {
      console.error('Error creating users table:', err.message);
    } else {
      console.log('Users table created or already exists.');
    }
  });
});

chatDb.serialize(() => {
  chatDb.run(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      sender_id INTEGER,
      receiver_id INTEGER,
      content TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `, (err) => {
    if (err) {
      console.error('Error creating messages table:', err.message);
    } else {
      console.log('Messages table created or already exists.');
    }
  });

  chatDb.run(`
    CREATE TABLE IF NOT EXISTS friends (
      user_id INTEGER,
      friend_id INTEGER,
      PRIMARY KEY (user_id, friend_id)
    )
  `, (err) => {
    if (err) {
      console.error('Error creating friends table:', err.message);
    } else {
      console.log('Friends table created or already exists.');
    }
  });

  chatDb.run(`
    CREATE TABLE IF NOT EXISTS friend_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sender_id INTEGER,
      receiver_id INTEGER,
      status TEXT
    )
  `, (err) => {
    if (err) {
      console.error('Error creating friend_requests table:', err.message);
    } else {
      console.log('Friend requests table created or already exists.');
    }
  });
});

db.close((err) => {
  if (err) {
    console.error(err.message);
  }
  console.log('Closed the users database connection.');
});

chatDb.close((err) => {
  if (err) {
    console.error(err.message);
  }
  console.log('Closed the chat database connection.');
});
