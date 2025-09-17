const fs = require("fs");
const path = require("path");

// Path to JSON file where users are stored
const filePath = path.join(__dirname, "../data/users.json");

// Helper: read users from JSON
const readUsers = () => {
  if (!fs.existsSync(filePath)) return [];
  const data = fs.readFileSync(filePath);
  return JSON.parse(data);
};

// Helper: write users to JSON
const writeUsers = (users) => {
  fs.writeFileSync(filePath, JSON.stringify(users, null, 2));
};

// -------------------- Signup --------------------
const signupUser = (req, res) => {
  const { username, email, password } = req.body;

  if (!username || !email || !password) {
    return res.status(400).json({ message: "All fields are required" });
  }

  let users = readUsers();

  // Check if user already exists
  const existingUser = users.find((u) => u.email === email);
  if (existingUser) {
    return res.status(400).json({ message: "User already exists" });
  }

  // Create new user
  const newUser = {
    id: Date.now(),
    username,
    email,
    password, // For now, store plaintext; can hash later
  };

  users.push(newUser);
  writeUsers(users);

  res.status(201).json({ message: "Signup successful", user: newUser });
};

// -------------------- Login --------------------
// const loginUser = (req, res) => {
//   const { email, password } = req.body;

//   if (!email || !password) {
//     return res.status(400).json({ message: "All fields are required" });
//   }

//   const users = readUsers();

//   const user = users.find((u) => u.email === email && u.password === password);

//   if (!user) {
//     return res.status(400).json({ message: "Invalid email or password" });
//   }

//   res.status(200).json({ message: "Login successful", user });
// };

module.exports = { signupUser, loginUser };
