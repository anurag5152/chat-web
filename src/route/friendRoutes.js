const express = require("express");
const fs = require("fs");
const path = require("path");

const router = express.Router();
const filePath = path.join(__dirname, "../data/users.json");

const readUsers = () => {
  if (!fs.existsSync(filePath)) return [];
  const data = fs.readFileSync(filePath);
  return JSON.parse(data);
};

const writeUsers = (users) => {
  fs.writeFileSync(filePath, JSON.stringify(users, null, 2));
};

// Search user by email
router.post("/search", (req, res) => {
  const { email } = req.body;
  const users = readUsers();
  const user = users.find((u) => u.email === email);
  if (!user) return res.status(404).json({ message: "User not found" });
  res.json(user);
});

// Send friend request
router.post("/request", (req, res) => {
  const { fromId, toId } = req.body;
  const users = readUsers();

  const fromUser = users.find((u) => u.id === fromId);
  const toUser = users.find((u) => u.id === toId);

  if (!fromUser || !toUser)
    return res.status(404).json({ message: "User not found" });

  toUser.requests = toUser.requests || [];
  if (!toUser.requests.includes(fromId)) {
    toUser.requests.push(fromId);
  }

  writeUsers(users);
  res.json({ message: "Request sent" });
});

// Accept request
router.post("/accept", (req, res) => {
  const { userId, friendId } = req.body;
  const users = readUsers();

  const user = users.find((u) => u.id === userId);
  const friend = users.find((u) => u.id === friendId);

  if (!user || !friend)
    return res.status(404).json({ message: "User not found" });

  user.requests = user.requests || [];
  user.friends = user.friends || [];
  friend.friends = friend.friends || [];

  // Remove request
  user.requests = user.requests.filter((id) => id !== friendId);

  // Add to friends list
  if (!user.friends.includes(friendId)) user.friends.push(friendId);
  if (!friend.friends.includes(userId)) friend.friends.push(userId);

  writeUsers(users);
  res.json({ message: "Friend added" });
});

// Get friends
router.get("/:userId", (req, res) => {
  const users = readUsers();
  const user = users.find((u) => u.id == req.params.userId);
  if (!user) return res.status(404).json({ message: "User not found" });

  const friends = users.filter((u) => user.friends?.includes(u.id));
  res.json(friends);
});

module.exports = router;
