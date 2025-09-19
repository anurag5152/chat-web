// server.js (root)
const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");
const fs = require("fs");
const path = require("path");

const app = express();
const server = http.createServer(app);

app.use(cors());
app.use(express.json());

const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

// Single data file at project root /data/users.json
const DATA_DIR = path.join(process.cwd(), "src", "data");
const DATA_FILE = path.join(DATA_DIR, "users.json");
const ensureDataFile = () => {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify({ users: [], messages: {} }, null, 2));
  }
};
ensureDataFile();

const readData = () => {
  ensureDataFile();
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE));
  } catch (e) {
    return { users: [], messages: {} };
  }
};
const writeData = (d) => fs.writeFileSync(DATA_FILE, JSON.stringify(d, null, 2));

const normEmail = (email) => (typeof email === "string" ? email.trim().toLowerCase() : email);

// ---------------- AUTH ----------------
app.post("/api/auth/signup", (req, res) => {
  try {
    const { username, email, password } = req.body;
    if (!username || !email || !password) return res.status(400).json({ message: "All fields required" });

    const data = readData();
    const nemail = normEmail(email);

    if (data.users.find((u) => u.email === nemail)) return res.status(400).json({ message: "User already exists" });

    const newUser = {
      id: Date.now().toString(),
      username,
      email: nemail,
      password,
      friends: [],
      requests: [],
    };

    data.users.push(newUser);
    writeData(data);

    const safe = { ...newUser };
    delete safe.password;
    return res.status(201).json(safe);
  } catch (err) {
    console.error("signup error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

app.post("/api/auth/login", (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: "All fields required" });

    const data = readData();
    const nemail = normEmail(email);
    const user = data.users.find((u) => u.email === nemail && u.password === password);
    if (!user) return res.status(400).json({ message: "Invalid credentials" });

    const safe = { ...user };
    delete safe.password;
    return res.json(safe);
  } catch (err) {
    console.error("login error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

app.get("/api/users/:userId", (req, res) => {
  const data = readData();
  const user = data.users.find((u) => u.id === String(req.params.userId));
  if (!user) return res.status(404).json({ message: "User not found" });
  const safe = { ...user };
  delete safe.password;
  res.json(safe);
});

// ---------------- FRIENDS ----------------
app.post("/api/friends/search", (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: "Email required" });
    const nemail = normEmail(email);
    const data = readData();
    const user = data.users.find((u) => u.email === nemail);
    if (!user) return res.status(404).json({ message: "User not found" });
    return res.json({ id: user.id, username: user.username, email: user.email });
  } catch (err) {
    console.error("search error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

app.post("/api/friends/request", (req, res) => {
  try {
    const { fromId, toId } = req.body;
    if (!fromId || !toId) return res.status(400).json({ message: "fromId and toId required" });

    const data = readData();
    const fromUser = data.users.find((u) => u.id === String(fromId));
    const toUser = data.users.find((u) => u.id === String(toId));
    if (!fromUser || !toUser) return res.status(404).json({ message: "User not found" });

    toUser.requests = toUser.requests || [];
    if (!toUser.requests.includes(String(fromId))) {
      toUser.requests.push(String(fromId));
      writeData(data);

      // real-time notify recipient (room = toId)
      io.to(String(toId)).emit("friendRequest", {
        fromId: String(fromId),
        fromUser: { id: fromUser.id, username: fromUser.username, email: fromUser.email },
      });
    }

    return res.json({ message: "Request sent" });
  } catch (err) {
    console.error("request error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

app.post("/api/friends/accept", (req, res) => {
  try {
    const { userId, friendId } = req.body;
    if (!userId || !friendId) return res.status(400).json({ message: "userId and friendId required" });

    const data = readData();
    const user = data.users.find((u) => u.id === String(userId));
    const friend = data.users.find((u) => u.id === String(friendId));
    if (!user || !friend) return res.status(404).json({ message: "User not found" });

    user.friends = user.friends || [];
    friend.friends = friend.friends || [];

    if (!user.friends.includes(String(friendId))) user.friends.push(String(friendId));
    if (!friend.friends.includes(String(userId))) friend.friends.push(String(userId));

    user.requests = (user.requests || []).filter((id) => id !== String(friendId));

    writeData(data);

    // notify both
    io.to(String(userId)).emit("friendAccepted", {
      userId: String(userId),
      friend: { id: friend.id, username: friend.username, email: friend.email },
    });
    io.to(String(friendId)).emit("friendAccepted", {
      userId: String(friendId),
      friend: { id: user.id, username: user.username, email: user.email },
    });

    return res.json({ message: "Friend request accepted" });
  } catch (err) {
    console.error("accept error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

app.get("/api/friends/:userId", (req, res) => {
  try {
    const { userId } = req.params;
    const data = readData();
    const user = data.users.find((u) => u.id === String(userId));
    if (!user) return res.status(404).json({ message: "User not found" });

    const friends = data.users
      .filter((u) => (user.friends || []).includes(u.id))
      .map((u) => ({ id: u.id, username: u.username, email: u.email }));
    return res.json(friends);
  } catch (err) {
    console.error("get friends error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

app.get("/api/requests/:userId", (req, res) => {
  try {
    const { userId } = req.params;
    const data = readData();
    const user = data.users.find((u) => u.id === String(userId));
    if (!user) return res.status(404).json({ message: "User not found" });

    const reqs = (user.requests || [])
      .map((rid) => data.users.find((u) => u.id === rid))
      .filter(Boolean)
      .map((u) => ({ id: u.id, username: u.username, email: u.email }));

    return res.json(reqs);
  } catch (err) {
    console.error("get requests error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

// ---------------- CHAT ----------------
app.get("/api/chat/:userId/:friendId", (req, res) => {
  try {
    const { userId, friendId } = req.params;
    const data = readData();
    const convo = data.messages || {};
    const chatId = [String(userId), String(friendId)].sort().join("-");
    return res.json(convo[chatId] || []);
  } catch (err) {
    console.error("get chat error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

// ---------------- SOCKET.IO ----------------
io.on("connection", (socket) => {
  // join room by user id when client emits join
  socket.on("join", (userId) => {
    if (!userId) return;
    socket.join(String(userId));
  });

  socket.on("sendMessage", (msg) => {
    try {
      if (!msg || !msg.senderId || !msg.receiverId) return;

      const senderId = String(msg.senderId);
      const receiverId = String(msg.receiverId);

      // persist message
      const data = readData();
      const convo = data.messages || {};
      const chatId = [senderId, receiverId].sort().join("-");
      convo[chatId] = convo[chatId] || [];
      convo[chatId].push(msg);
      data.messages = convo;
      writeData(data);

      // deliver to receiver room
       
      io.to(receiverId).emit("receiveMessage", msg);

      // deliver to sender's other sockets (exclude the sending socket)
      socket.broadcast.to(senderId).emit("receiveMessage", msg);
    } catch (err) {
      console.error("socket sendMessage error:", err);
    }
  });
});

// ---------- DEBUG helpers (dev only) ----------
app.get("/api/debug/users", (req, res) => {
  const data = readData();
  return res.json(data.users);
});
app.post("/api/debug/reset", (req, res) => {
  writeData({ users: [], messages: {} });
  return res.json({ message: "reset ok" });
});

app.use(express.static(path.join(__dirname, "build")));

app.get("/*", (req, res) => {
  res.sendFile(path.join(__dirname, "build", "index.html"));
});

// start server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));