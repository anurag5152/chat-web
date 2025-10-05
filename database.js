const sqlite3 = require('sqlite3').verbose();

const db = new sqlite3.Database('./users.db', (err) => {
  if (err) {
    console.error(err.message);
  }
  console.log('Connected to the users database.');
});

const chatDb = new sqlite3.Database('./chat.db', (err) => {
    if (err) {
      console.error(err.message);
    }
    console.log('Connected to the chat database.');
});

module.exports = { db, chatDb };
