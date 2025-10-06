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

/**
 * removeFriend: deletes the friendship rows (both directions) inside a transaction
 * and returns the number of rows deleted via callback (null, deletedCount) or (err).
 */
const removeFriend = (userId, friendId, callback) => {
  chatDb.serialize(() => {
    chatDb.run("BEGIN TRANSACTION", (err) => {
      if (err) return callback(err);

      const deleteFriendSql = 'DELETE FROM friends WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)';
      chatDb.run(deleteFriendSql, [userId, friendId, friendId, userId], function(err) {
        if (err) {
          // rollback and report error
          return chatDb.run("ROLLBACK", () => callback(err));
        }

        // this.changes is the number of rows deleted by this run
        const deleted = this.changes;

        chatDb.run("COMMIT", (err) => {
          if (err) {
            // try rollback and return error
            return chatDb.run("ROLLBACK", () => callback(err));
          }
          // success: return number of rows deleted
          callback(null, deleted);
        });
      });
    });
  });
};

module.exports = { db, chatDb, removeFriend };
