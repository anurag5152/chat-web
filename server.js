// server.js — full file (SQLite session store using connect-sqlite3, no Redis)
require('dotenv').config();

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const bodyParser = require('body-parser');
const session = require('express-session');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');

// your database module (file-backed SQLite)
const { db, chatDb, removeFriend } = require('./database.js');

const app = express();
const server = http.createServer(app);

/* -------------------- Config / env -------------------- */
/**
 * NODE_ENV - 'production' in prod
 * FRONTEND_URL - deployed frontend origin (e.g. https://your-frontend.onrender.com)
 * ADDITIONAL_ORIGINS - comma-separated additional allowed origins
 * COOKIE_DOMAIN - optional cookie domain if you need cross-subdomain cookies
 */
const { NODE_ENV, FRONTEND_URL, ADDITIONAL_ORIGINS, COOKIE_DOMAIN } = process.env;
const IS_PROD = NODE_ENV === 'production';

/* If in prod behind a proxy, trust it so secure cookies and IPs work */
if (IS_PROD) app.set('trust proxy', 1);

/* -------------------- Data directory (ensure exists) -------------------- */
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

/* -------------------- CORS / allowed origins -------------------- */
const allowedOriginsSet = new Set(
  [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:3001',
    FRONTEND_URL,
    ...(ADDITIONAL_ORIGINS ? ADDITIONAL_ORIGINS.split(',') : []),
  ].filter(Boolean)
);
const allowedOrigins = Array.from(allowedOriginsSet);

function isOriginAllowed(origin) {
  if (!origin) return true; // server-to-server or same-origin
  if (origin === 'null' && !IS_PROD) return true;
  if (allowedOriginsSet.has(origin)) return true;
  try {
    const parsed = new URL(origin);
    const host = parsed.hostname;
    if (host === 'localhost' || host === '127.0.0.1') return true;
    if (FRONTEND_URL) {
      try {
        const frontendHost = new URL(FRONTEND_URL).hostname;
        if (frontendHost === host) return true;
      } catch (e) { /* ignore */ }
    }
  } catch (e) { /* invalid origin */ }
  return false;
}

/* CORS middleware — allow credentials */
app.use(
  cors({
    origin: (origin, callback) => {
      if (isOriginAllowed(origin)) return callback(null, true);
      console.warn('[CORS] Blocked origin:', origin);
      return callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
  })
);

// preflight for all routes
app.options(
  /.*/,
  cors({
    origin: (origin, callback) => {
      if (isOriginAllowed(origin)) return callback(null, true);
      console.warn('[CORS:OPTIONS] Blocked origin:', origin);
      return callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
  })
);

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

/* -------------------- Global in-memory mapping -------------------- */
// userId -> socketId map (single-instance)
const userSockets = {};

/* -------------------- Socket.io instance -------------------- */
const io = socketIo(server, {
  cors: {
    origin: (origin, callback) => {
      if (isOriginAllowed(origin)) return callback(null, true);
      console.warn('[socket.io CORS] Blocked origin:', origin);
      return callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
  },
});

/* -------------------- Session configuration (SQLite store) -------------------- */
/* Use connect-sqlite3 to persist sessions to a SQLite table.
   Sessions will be stored in data/app.sqlite (same folder as app DB files).
*/
let SQLiteStore;
try {
  // connect-sqlite3 exports a factory that needs the session module
  SQLiteStore = require('connect-sqlite3')(session);
} catch (e) {
  console.error('Missing dependency connect-sqlite3. Run: npm install connect-sqlite3 sqlite3');
  process.exit(1);
}

const sessionOptions = {
  name: process.env.SESSION_NAME || 'sid',
  secret: process.env.SESSION_SECRET || 'your-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: IS_PROD, // true only in production (HTTPS)
    sameSite: IS_PROD ? 'none' : 'lax', // allow cross-site cookie in prod if frontend on different origin
    httpOnly: true,
    maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
  },
  store: new SQLiteStore({
    // store options:
    db: 'app.sqlite',              // file name for session DB (we put it in ./data)
    dir: dataDir,                 // directory where db file is created
    table: 'sessions',            // table name
    // optionally: concurrentDB: true  (varies with versions). Keep defaults.
  }),
};

// optional domain for cookie if you want cross-subdomain cookies
if (COOKIE_DOMAIN) {
  sessionOptions.cookie.domain = COOKIE_DOMAIN;
}

const finalSessionMiddleware = session(sessionOptions);

// mount session middleware (must be before routes)
app.use(finalSessionMiddleware);

// attach same session middleware to socket.io (so socket.request.session is available)
io.use((socket, next) => {
  // express-session expects req/res; socket.request doesn't have res -> provide fake
  const fakeRes = {
    getHeader() {},
    setHeader() {},
    end() {},
  };
  finalSessionMiddleware(socket.request, fakeRes, next);
});

/* -------------------- Routes & socket handlers -------------------- */
function mountRoutesAndSockets() {
  app.get('/health', (req, res) => res.send('OK'));

  /* -------------------- Auth endpoints -------------------- */
  app.post('/signup', async (req, res) => {
    const { name, email, password } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: 'All fields are required' });

    try {
      const hashedPassword = await bcrypt.hash(password, 10);
      const sql = 'INSERT INTO users (name, email, password) VALUES (?, ?, ?)';
      db.run(sql, [name, email, hashedPassword], function (err) {
        if (err) {
          console.error('Signup DB error:', err);
          return res.status(400).json({ error: 'Email already exists or DB error' });
        }
        req.session.userId = this.lastID;
        return res.redirect('/chatpage');
      });
    } catch (error) {
      console.error('Signup error:', error);
      return res.status(500).json({ error: 'Server error' });
    }
  });

  app.post('/login', (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });

    const sql = 'SELECT * FROM users WHERE email = ?';
    db.get(sql, [email], async (err, user) => {
      if (err) {
        console.error('Login DB error:', err);
        return res.status(500).json({ error: 'Server error' });
      }
      if (!user) return res.status(400).json({ error: 'Invalid credentials' });

      try {
        const match = await bcrypt.compare(password, user.password);
        if (!match) return res.status(400).json({ error: 'Invalid credentials' });

        req.session.userId = user.id;
        return res.redirect('/chatpage');
      } catch (e) {
        console.error('Login compare error:', e);
        return res.status(500).json({ error: 'Server error' });
      }
    });
  });

  app.get('/logout', (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        console.error('Logout destroy error:', err);
        return res.status(500).json({ error: 'Logout failed' });
      }
      res.clearCookie(sessionOptions.name);
      return res.redirect('/login');
    });
  });

  /* -------------------- Session API -------------------- */
  app.get('/api/session', (req, res) => {
    if (req.session.userId) {
      const sql = 'SELECT id, name, email FROM users WHERE id = ?';
      db.get(sql, [req.session.userId], (err, user) => {
        if (err) {
          console.error('/api/session db error:', err);
          return res.status(500).json({ error: 'Server error' });
        }
        if (!user) return res.status(404).json({ loggedIn: false });
        return res.json({ loggedIn: true, user });
      });
    } else {
      return res.json({ loggedIn: false });
    }
  });

  /* -------------------- Friends / Requests / Users endpoints -------------------- */
  app.get('/api/friends', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
    const userId = req.session.userId;
    const getFriendsIdsSql = 'SELECT friend_id FROM friends WHERE user_id = ?';

    chatDb.all(getFriendsIdsSql, [userId], (err, friendRows) => {
      if (err) {
        console.error('/api/friends db error:', err);
        return res.status(500).json({ error: 'Server error getting friend IDs' });
      }

      if (!friendRows || friendRows.length === 0) return res.json([]);

      const friendIds = friendRows.map(row => row.friend_id);
      const placeholders = friendIds.map(() => '?').join(',');
      const getUsersSql = `SELECT id, name, email FROM users WHERE id IN (${placeholders})`;

      db.all(getUsersSql, friendIds, (err, userRows) => {
        if (err) {
          console.error('/api/friends userRows error:', err);
          return res.status(500).json({ error: 'Server error getting friend details' });
        }
        return res.json(userRows);
      });
    });
  });

  app.get('/api/friend-requests', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
    const userId = req.session.userId;
    const getRequestsSql = "SELECT id, sender_id FROM friend_requests WHERE receiver_id = ? AND status = 'pending'";

    chatDb.all(getRequestsSql, [userId], (err, requests) => {
      if (err) {
        console.error('/api/friend-requests db error:', err);
        return res.status(500).json({ error: 'Server error getting friend requests' });
      }

      if (!requests || requests.length === 0) return res.json([]);

      const senderIds = requests.map(r => r.sender_id);
      const placeholders = senderIds.map(() => '?').join(',');
      const getUsersSql = `SELECT id, name, email FROM users WHERE id IN (${placeholders})`;

      db.all(getUsersSql, senderIds, (err, users) => {
        if (err) {
          console.error('/api/friend-requests users error:', err);
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

        return res.json(friendRequests);
      });
    });
  });

  app.post('/api/friend-request', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
    const senderId = req.session.userId;
    const { email } = req.body;

    db.get('SELECT id FROM users WHERE email = ?', [email], (err, user) => {
      if (err) {
        console.error('/api/friend-request db error:', err);
        return res.status(500).json({ error: 'Server error' });
      }
      if (!user) return res.status(404).json({ error: 'User not found' });
      const receiverId = user.id;

      chatDb.get('SELECT * FROM friends WHERE user_id = ? AND friend_id = ?', [senderId, receiverId], (err, friendship) => {
        if (err) {
          console.error('/api/friend-request friendship check error:', err);
          return res.status(500).json({ error: 'Server error while checking friendship' });
        }
        if (friendship) return res.status(400).json({ error: 'You are already friends with this user' });

        const sql = 'INSERT INTO friend_requests (sender_id, receiver_id, status) VALUES (?, ?, ?)';
        chatDb.run(sql, [senderId, receiverId, 'pending'], function (err) {
          if (err) {
            console.error('/api/friend-request insert error:', err);
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
          return res.status(201).json({ message: 'Friend request sent' });
        });
      });
    });
  });

  app.post('/api/friend-request/accept', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
    const userId = req.session.userId;
    const { requestId } = req.body;

    chatDb.get('SELECT * FROM friend_requests WHERE id = ? AND receiver_id = ?', [requestId, userId], (err, request) => {
      if (err || !request) {
        return res.status(404).json({ error: 'Friend request not found' });
      }

      const senderId = request.sender_id;

      chatDb.get('SELECT * FROM friends WHERE user_id = ? AND friend_id = ?', [userId, senderId], (err, friendship) => {
        if (err) {
          console.error('/api/friend-request accept friendship check error:', err);
          return res.status(500).json({ error: 'Server error while checking friendship' });
        }
        if (friendship) {
          chatDb.run('UPDATE friend_requests SET status = "accepted" WHERE id = ?', [requestId], (err) => {
            if (err) {
              console.error('/api/friend-request accept update error:', err);
              return res.status(500).json({ error: 'Failed to accept friend request' });
            }
            return res.status(200).json({ message: 'Friend request accepted, already friends' });
          });
          return;
        }

        chatDb.run('UPDATE friend_requests SET status = "accepted" WHERE id = ?', [requestId], (err) => {
          if (err) {
            console.error('/api/friend-request accept update error:', err);
            return res.status(500).json({ error: 'Failed to accept friend request' });
          }

          chatDb.run('INSERT INTO friends (user_id, friend_id) VALUES (?, ?), (?, ?)', [userId, senderId, senderId, userId], (err) => {
            if (err) {
              console.error('/api/friend-request insert friends error:', err);
              return res.status(500).json({ error: 'Failed to add friend' });
            }

            const senderSocketId = userSockets[senderId];
            if (senderSocketId) {
              db.get('SELECT id, name, email FROM users WHERE id = ?', [userId], (err, user) => {
                if (!err && user) {
                  io.to(senderSocketId).emit('friend_request_accepted', { id: user.id, name: user.name, email: user.email });
                }
              });
            }

            return res.status(200).json({ message: 'Friend request accepted' });
          });
        });
      });
    });
  });

  app.post('/api/friends/remove', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
    const userId = req.session.userId;
    const { friendId } = req.body;

    if (!friendId) return res.status(400).json({ error: 'Friend ID is required' });

    removeFriend(userId, friendId, (err, deletedCount) => {
      if (err) {
        console.error('/api/friends/remove error:', err);
        return res.status(500).json({ error: 'Failed to remove friend' });
      }
      if (!deletedCount || deletedCount === 0) return res.status(404).json({ error: 'Friendship not found' });

      const deleteMessagesSql = 'DELETE FROM messages WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)';
      chatDb.run(deleteMessagesSql, [userId, friendId, friendId, userId], (err) => {
        if (err) console.error('Error deleting chat history:', err);

        const removedUserSocketId = userSockets[friendId];
        if (removedUserSocketId) {
          io.to(removedUserSocketId).emit('friend_removed', { friendId: userId });
        }

        return res.status(200).json({ message: 'Friend removed successfully' });
      });
    });
  });

  app.post('/api/friend-request/reject', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
    const userId = req.session.userId;
    const { requestId } = req.body;

    chatDb.run('UPDATE friend_requests SET status = "rejected" WHERE id = ? AND receiver_id = ?', [requestId, userId], function (err) {
      if (err) {
        console.error('/api/friend-request/reject error:', err);
        return res.status(500).json({ error: 'Failed to reject friend request' });
      }
      if (this.changes === 0) return res.status(404).json({ error: 'Friend request not found' });
      return res.status(200).json({ message: 'Friend request rejected' });
    });
  });

  app.get('/api/users/search', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
    const { email } = req.query;
    if (!email) return res.status(400).json({ error: 'Email query parameter is required' });

    const sql = 'SELECT id, name, email FROM users WHERE email LIKE ?';
    db.all(sql, [`%${email}%`], (err, rows) => {
      if (err) {
        console.error('/api/users/search error:', err);
        return res.status(500).json({ error: 'Server error' });
      }
      return res.json(rows);
    });
  });

  app.get('/api/messages/:friendId', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
    const userId = req.session.userId;
    const friendId = req.params.friendId;

    const sql = `
      SELECT * FROM messages
      WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)
      ORDER BY timestamp ASC
    `;
    chatDb.all(sql, [userId, friendId, friendId, userId], (err, rows) => {
      if (err) {
        console.error('/api/messages error:', err);
        return res.status(500).json({ error: 'Server error' });
      }
      return res.json(rows);
    });
  });

  /* -------------------- Socket.io realtime -------------------- */
  io.on('connection', (socket) => {
    // session attached earlier by io.use
    const userId = socket.request && socket.request.session && socket.request.session.userId;
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
      chatDb.run(sql, [message.id, message.sender_id, message.receiver_id, message.content, message.timestamp], function (err) {
        if (err) {
          console.error('Error saving message:', err);
          if (callback) callback({ error: 'Failed to save message' });
          return;
        }

        console.log('Message saved to database (id=', message.id, ')');

        const receiverSocketId = userSockets[to];
        if (receiverSocketId) {
          console.log(`Sending message to receiver ${to} at socket ${receiverSocketId}`);
          io.to(receiverSocketId).emit('private_message', message);
        } else {
          console.log(`Receiver ${to} not connected to this instance`);
        }

        if (callback) {
          callback({ message });
        }
      });
    });
  });

  /* -------------------- Serve React build (static files) -------------------- */
  app.use(express.static(path.join(__dirname, 'build')));

  // fallback — use regexp and exclude /api and socket.io
  app.get(/^\/(?!api|socket\.io).*/, (req, res) => {
    res.sendFile(path.join(__dirname, 'build', 'index.html'));
  });
}

/* -------------------- Start server -------------------- */
function start() {
  try {
    mountRoutesAndSockets();

    const PORT = process.env.PORT || 5000;
    server.listen(PORT, () => {
      console.log(`Server listening on port ${PORT} (NODE_ENV=${NODE_ENV || 'development'})`);
      console.log('Allowed CORS origins:', allowedOrigins);
      console.log(`Session cookie: secure=${sessionOptions.cookie.secure}, sameSite=${sessionOptions.cookie.sameSite}`);
      console.log(`Sessions stored in: ${path.join(dataDir, 'app.sqlite')} (sessions table)`);
      console.log('SQLite session store active (sessions persist across restarts).');
    });

    const shutdown = async () => {
      console.log('Shutting down server...');
      try {
        server.close(() => {
          console.log('HTTP server closed.');
          process.exit(0);
        });
      } catch (e) {
        console.warn('Error during shutdown', e);
        process.exit(1);
      }
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  } catch (err) {
    console.error('Startup error:', err);
    process.exit(1);
  }
}

start();

/* -------------------- Global error logging -------------------- */
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
});
process.on('unhandledRejection', (reason, p) => {
  console.error('Unhandled Rejection at: Promise', p, 'reason:', reason);
});
