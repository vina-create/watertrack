// server.js
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Serve static frontend files from /public
app.use(express.static(path.join(__dirname, "public")));

// Open (or create) SQLite DB file
const dbPath = path.join(__dirname, "water_tracker.db");
const db = new sqlite3.Database(dbPath, err => {
  if (err) return console.error("SQLite open error:", err);
  console.log("✅ SQLite DB opened:", dbPath);
});

// Create tables
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    email TEXT UNIQUE,
    phone TEXT,
    password TEXT
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS water_usage (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    usage_date TEXT,
    usage_amount REAL,
    FOREIGN KEY(user_id) REFERENCES users(id)
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS goals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    monthly_goal REAL,
    FOREIGN KEY(user_id) REFERENCES users(id)
  )`);
});

// Signup
app.post("/signup", (req, res) => {
  const { name, email, phone, password } = req.body;
  const sql = `INSERT INTO users (name,email,phone,password) VALUES (?,?,?,?)`;
  db.run(sql, [name, email, phone, password], function(err) {
    if (err) {
      if (err.message.includes("UNIQUE")) return res.status(400).json({ message: "Email already used" });
      return res.status(500).json({ message: "Error saving user" });
    }
    res.json({ message: "Signup successful", userId: this.lastID });
  });
});

// Login
app.post("/login", (req, res) => {
  const { email, password } = req.body;
  db.get(`SELECT id,name FROM users WHERE email=? AND password=?`, [email, password], (err, row) => {
    if (err) return res.status(500).json({ message: "DB error" });
    if (!row) return res.status(401).json({ message: "Invalid credentials" });
    res.json({ message: "Login successful", user: { id: row.id, name: row.name }});
  });
});

// Add water usage
app.post("/add_water_usage", (req, res) => {
  const { user_id, usage_date, usage_amount } = req.body;
  const sql = `INSERT INTO water_usage (user_id, usage_date, usage_amount) VALUES (?,?,?)`;
  db.run(sql, [user_id || null, usage_date, usage_amount], function(err) {
    if (err) return res.status(500).json({ message: "Error adding usage" });
    res.json({ message: "Usage added", id: this.lastID });
  });
});

// Set monthly goal (creates or updates)
app.post("/set_goal", (req, res) => {
  const { user_id, monthly_goal } = req.body;
  if (!user_id) return res.status(400).json({ message: "user_id required" });
  db.get(`SELECT id FROM goals WHERE user_id=?`, [user_id], (err, row) => {
    if (err) return res.status(500).json({ message: "DB error" });
    if (row) {
      db.run(`UPDATE goals SET monthly_goal=? WHERE user_id=?`, [monthly_goal, user_id], function(err) {
        if (err) return res.status(500).json({ message: "Update error" });
        res.json({ message: "Goal updated" });
      });
    } else {
      db.run(`INSERT INTO goals (user_id, monthly_goal) VALUES (?,?)`, [user_id, monthly_goal], function(err) {
        if (err) return res.status(500).json({ message: "Insert error" });
        res.json({ message: "Goal created" });
      });
    }
  });
});

// Get progress (sum usage and goal) for a user
app.get("/progress/:user_id", (req, res) => {
  const user_id = req.params.user_id;
  db.get(`SELECT IFNULL(SUM(usage_amount),0) AS total FROM water_usage WHERE user_id=?`, [user_id], (err, row) => {
    if (err) return res.status(500).json({ message: "DB error" });
    const total = row.total || 0;
    db.get(`SELECT monthly_goal FROM goals WHERE user_id=?`, [user_id], (err2, gRow) => {
      if (err2) return res.status(500).json({ message: "DB error" });
      const goal = gRow ? gRow.monthly_goal : 0;
      res.json({ total, goal });
    });
  });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'web.html'));
});

const port = process.env.PORT || 5000;
app.listen(port, () => console.log(`Server running on port ${port}`));