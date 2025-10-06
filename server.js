const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const bodyParser = require('body-parser');
const session = require('express-session');
const FileStore = require('session-file-store')(session);
const { db, chatDb, removeFriend } = require('./database.js');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: 'http://localhost:3000',
    credentials: true,
  },
});

app.use(cors({
  origin: 'http://localhost:3000',
  credentials: true,
}));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

const sessionMiddleware = session({
  store: new FileStore({ path: './sessions' }),
  secret: 'your-secret-key',
  resave: false,
  saveUninitialized: true,
  cookie: {
    secure: false, // set to true if you're using https
  },
});

app.use(sessionMiddleware);

// Make express-session available in socket.request
io.use((socket, next) => {
  sessionMiddleware(socket.request, {}, next);
});

// API endpoints
app.post('/signup', async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const sql = 'INSERT INTO users (name, email, password) VALUES (?, ?, ?)';
    db.run(sql, [name, email, hashedPassword], function (err) {
      if (err) {
        return res.status(400).json({ error: 'Email already exists' });
      }
      req.session.userId = this.lastID;
      res.redirect('/chatpage');
    });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const sql = 'SELECT * FROM users WHERE email = ?';
  db.get(sql, [email], async (err, user) => {
    if (err) {
      return res.status(500).json({ error: 'Server error' });
    }
    if (!user) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    req.session.userId = user.id;
    res.redirect('/chatpage');
  });
});

app.get('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: 'Logout failed' });
    }
    res.redirect('/login');
  });
});

app.get('/api/session', (req, res) => {
  if (req.session.userId) {
    const sql = 'SELECT id, name, email FROM users WHERE id = ?';
    db.get(sql, [req.session.userId], (err, user) => {
      if (err) {
        return res.status(500).json({ error: 'Server error' });
      }
      if (!user) {
        return res.status(404).json({ loggedIn: false });
      }
      res.json({ loggedIn: true, user });
    });
  } else {
    res.json({ loggedIn: false });
  }
});


app.get('/api/friends', (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const userId = req.session.userId;
  const getFriendsIdsSql = 'SELECT friend_id FROM friends WHERE user_id = ?';

  chatDb.all(getFriendsIdsSql, [userId], (err, friendRows) => {
    if (err) {
      return res.status(500).json({ error: 'Server error getting friend IDs' });
    }

    if (!friendRows || friendRows.length === 0) {
      return res.json([]);
    }

    const friendIds = friendRows.map(row => row.friend_id);
    const placeholders = friendIds.map(() => '?').join(',');
    const getUsersSql = `SELECT id, name, email FROM users WHERE id IN (${placeholders})`;

    db.all(getUsersSql, friendIds, (err, userRows) => {
      if (err) {
        return res.status(500).json({ error: 'Server error getting friend details' });
      }
      res.json(userRows);
    });
  });
});

app.get('/api/friend-requests', (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const userId = req.session.userId;
  const getRequestsSql = "SELECT id, sender_id FROM friend_requests WHERE receiver_id = ? AND status = 'pending'";

  chatDb.all(getRequestsSql, [userId], (err, requests) => {
    if (err) {
      return res.status(500).json({ error: 'Server error getting friend requests' });
    }

    if (!requests || requests.length === 0) {
      return res.json([]);
    }

    const senderIds = requests.map(r => r.sender_id);
    const placeholders = senderIds.map(() => '?').join(',');
    const getUsersSql = `SELECT id, name, email FROM users WHERE id IN (${placeholders})`;

    db.all(getUsersSql, senderIds, (err, users) => {
      if (err) {
        return res.status(500).json({ error: 'Server error getting user details' });
      }

      const friendRequests = requests.map(req => {
        const sender = users.find(user => user.id === req.sender_id);
        return {
          id: req.id,
          sender_id: req.sender_id,
          name: sender ? sender.name : 'Unknown',
          email: sender ? sender.email : 'Unknown'
        };
      });

      res.json(friendRequests);
    });
  });
});

app.post('/api/friend-request', (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const senderId = req.session.userId;
  const { email } = req.body;

  db.get('SELECT id FROM users WHERE email = ?', [email], (err, user) => {
    if (err) {
      return res.status(500).json({ error: 'Server error' });
    }
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    const receiverId = user.id;

    // Check if they are already friends
    chatDb.get('SELECT * FROM friends WHERE user_id = ? AND friend_id = ?', [senderId, receiverId], (err, friendship) => {
      if (err) {
        return res.status(500).json({ error: 'Server error while checking friendship' });
      }
      if (friendship) {
        return res.status(400).json({ error: 'You are already friends with this user' });
      }

      const sql = 'INSERT INTO friend_requests (sender_id, receiver_id, status) VALUES (?, ?, ?)';
      chatDb.run(sql, [senderId, receiverId, 'pending'], function(err) {
        if (err) {
          return res.status(500).json({ error: 'Failed to send friend request' });
        }
        const receiverSocketId = userSockets[receiverId];
        if (receiverSocketId) {
          db.get('SELECT name, email FROM users WHERE id = ?', [senderId], (err, sender) => {
            if (!err && sender) {
              io.to(receiverSocketId).emit('new_friend_request', { id: this.lastID, name: sender.name, email: sender.email, sender_id: senderId });
            }
          });
        }
        res.status(201).json({ message: 'Friend request sent' });
      });
    });
  });
});

app.post('/api/friend-request/accept', (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const userId = req.session.userId; // the one who accepted
  const { requestId } = req.body;

  chatDb.get('SELECT * FROM friend_requests WHERE id = ? AND receiver_id = ?', [requestId, userId], (err, request) => {
    if (err || !request) {
      return res.status(404).json({ error: 'Friend request not found' });
    }

    const senderId = request.sender_id;

    // Check if they are already friends
    chatDb.get('SELECT * FROM friends WHERE user_id = ? AND friend_id = ?', [userId, senderId], (err, friendship) => {
      if (err) {
        return res.status(500).json({ error: 'Server error while checking friendship' });
      }
      if (friendship) {
        // They are already friends, so just update the request status
        chatDb.run('UPDATE friend_requests SET status = "accepted" WHERE id = ?', [requestId], (err) => {
          if (err) {
            return res.status(500).json({ error: 'Failed to accept friend request' });
          }
          return res.status(200).json({ message: 'Friend request accepted, already friends' });
        });
        return;
      }

      // If not already friends, proceed to add
      chatDb.run('UPDATE friend_requests SET status = "accepted" WHERE id = ?', [requestId], (err) => {
        if (err) {
          return res.status(500).json({ error: 'Failed to accept friend request' });
        }

        // Insert friendship both directions
        chatDb.run('INSERT INTO friends (user_id, friend_id) VALUES (?, ?), (?, ?)', [userId, senderId, senderId, userId], (err) => {
          if (err) {
            return res.status(500).json({ error: 'Failed to add friend' });
          }

          // Notify the original sender (who sent the request)
          const senderSocketId = userSockets[senderId];
          if (senderSocketId) {
            db.get('SELECT id, name, email FROM users WHERE id = ?', [userId], (err, user) => {
              if (!err && user) {
                // send a compact friend object so client can add it
                io.to(senderSocketId).emit('friend_request_accepted', { id: user.id, name: user.name, email: user.email });
              }
            });
          }

          // Optionally, you might notify the acceptor via socket too (not necessary if the HTTP response updates UI)
          res.status(200).json({ message: 'Friend request accepted' });
        });
      });
    });
  });
});

app.post('/api/friends/remove', (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const userId = req.session.userId;
  const { friendId } = req.body;

  if (!friendId) {
    return res.status(400).json({ error: 'Friend ID is required' });
  }

  removeFriend(userId, friendId, (err, deletedCount) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to remove friend' });
    }
    if (!deletedCount || deletedCount === 0) {
      return res.status(404).json({ error: 'Friendship not found' });
    }

    // Delete the chat history (best-effort)
    const deleteMessagesSql = 'DELETE FROM messages WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)';
    chatDb.run(deleteMessagesSql, [userId, friendId, friendId, userId], (err) => {
      if (err) {
        console.error("Error deleting chat history:", err);
      }

      // Notify the removed friend (so their UI updates without refresh)
      const removedUserSocketId = userSockets[friendId];
      if (removedUserSocketId) {
        io.to(removedUserSocketId).emit('friend_removed', { friendId: userId });
      }

      // Also optionally notify the remover — not necessary because the HTTP response already updates the remover's UI
      res.status(200).json({ message: 'Friend removed successfully' });
    });
  });
});

app.post('/api/friend-request/reject', (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const userId = req.session.userId;
  const { requestId } = req.body;

  chatDb.run('UPDATE friend_requests SET status = "rejected" WHERE id = ? AND receiver_id = ?', [requestId, userId], function(err) {
    if (err) {
      return res.status(500).json({ error: 'Failed to reject friend request' });
    }
    if (this.changes === 0) {
      return res.status(404).json({ error: 'Friend request not found' });
    }
    res.status(200).json({ message: 'Friend request rejected' });
  });
});

app.get('/api/users/search', (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const { email } = req.query;
  console.log(`Searching for email: ${email}`);
  if (!email) {
    return res.status(400).json({ error: 'Email query parameter is required' });
  }

  const sql = 'SELECT id, name, email FROM users WHERE email LIKE ?';
  db.all(sql, [`%${email}%`], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: 'Server error' });
    }
    console.log(`Found users: ${JSON.stringify(rows)}`);
    res.json(rows);
  });
});

app.get('/api/messages/:friendId', (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const userId = req.session.userId;
  const friendId = req.params.friendId;

  const sql = `
    SELECT * FROM messages
    WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)
    ORDER BY timestamp ASC
  `;
  chatDb.all(sql, [userId, friendId, friendId, userId], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: 'Server error' });
    }
    res.json(rows);
  });
});

// simple map userId -> socketId; kept in memory
const userSockets = {};

io.on('connection', (socket) => {
  const userId = socket.request.session && socket.request.session.userId;
  if (userId) {
    userSockets[userId] = socket.id;
    console.log(`User ${userId} connected with socket id ${socket.id}`);
  } else {
    console.log('Socket connected without a session userId');
  }

  socket.on('disconnect', () => {
    for (const id in userSockets) {
      if (userSockets[id] === socket.id) {
        delete userSockets[id];
        break;
      }
    }
    console.log('user disconnected');
  });

  socket.on('private_message', (messageData, callback) => {
    console.log('Received private message:', messageData);
    const { content, to } = messageData;
    const from = userId;

    if (!from) {
      if (callback) callback({ error: 'Not authenticated' });
      return;
    }

    const message = {
      id: uuidv4(),
      sender_id: from,
      receiver_id: to,
      content: content,
      timestamp: new Date().toISOString(),
    };

    const sql = 'INSERT INTO messages (id, sender_id, receiver_id, content, timestamp) VALUES (?, ?, ?, ?, ?)';
    chatDb.run(sql, [message.id, message.sender_id, message.receiver_id, message.content, message.timestamp], (err) => {
      if (err) {
        console.error('Error saving message:', err);
        if (callback) callback({ error: 'Failed to save message' });
        return;
      }
      console.log('Message saved to database');

      const receiverSocketId = userSockets[to];
      if (receiverSocketId) {
        console.log(`Sending message to receiver ${to} at socket ${receiverSocketId}`);
        io.to(receiverSocketId).emit('private_message', message);
      } else {
        console.log(`Receiver ${to} not connected`);
      }

      if (callback) {
        // send the saved message back to sender (so client can replace optimistic message)
        callback({ message });
      }
    });
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
