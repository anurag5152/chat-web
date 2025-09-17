// server.js (root)
const express = require("express");
const cors = require("cors");
const authRoutes = require("./src/route/authRoutes");

const app = express();

app.use(express.json());
app.use(cors());

app.use("/api/auth", authRoutes);

app.get("/", (req, res) => res.send("/signup"));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
