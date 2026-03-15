const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// Setup SQLite Database
const dbPath = path.join(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database', err.message);
  } else {
    console.log('Connected to the SQLite database.');
    initDb();
  }
});

// Initialize Database Tables
function initDb() {
  db.serialize(() => {
    // Users Table
    db.run(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Leaderboard/Scores Table
    db.run(`CREATE TABLE IF NOT EXISTS scores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      username TEXT NOT NULL,
      score INTEGER NOT NULL,
      difficulty TEXT NOT NULL,
      accuracy INTEGER NOT NULL,
      max_combo INTEGER NOT NULL,
      played_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id)
    )`);

    // User Statistics Table
    db.run(`CREATE TABLE IF NOT EXISTS user_stats (
      user_id INTEGER PRIMARY KEY,
      games_played INTEGER DEFAULT 0,
      highest_score INTEGER DEFAULT 0,
      total_accuracy INTEGER DEFAULT 0,
      total_words INTEGER DEFAULT 0,
      success_words INTEGER DEFAULT 0,
      FOREIGN KEY(user_id) REFERENCES users(id)
    )`);

    // Word Lists Table (for custom themes)
    db.run(`CREATE TABLE IF NOT EXISTS word_lists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      creator_id INTEGER,
      is_public BOOLEAN DEFAULT 1,
      words TEXT NOT NULL, -- Stored as JSON string
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(creator_id) REFERENCES users(id)
    )`);
    
    // Insert some default word lists if empty
    db.get("SELECT count(*) as count FROM word_lists", (err, row) => {
        if (!err && row.count === 0) {
            const techWords = JSON.stringify({
                short: ["API", "CSS", "DOM", "SQL", "RAM", "CPU", "GUI", "LAN"],
                medium4: ["HTML", "NODE", "JSON", "JAVA", "PORT", "BASH", "UNIX", "HTTP"],
                medium6: ["PYTHON", "REACT", "DOCKER", "SERVER", "CLIENT", "ROUTER", "GITHUB"],
                long: ["JAVASCRIPT", "TYPESCRIPT", "PROGRAMMING", "DATABASE", "ALGORITHM", "FRAMEWORK"]
            });
            db.run("INSERT INTO word_lists (name, words) VALUES (?, ?)", ['Tech Basics', techWords]);
        }
    });
  });
}

// ==========================================
// API ENDPOINTS
// ==========================================

// 1. Get Top Scores (Global Leaderboard)
app.get('/api/leaderboard', (req, res) => {
  const diff = req.query.difficulty || 'easy';
  const limit = req.query.limit || 10;
  
  db.all(
    `SELECT username, score, max_combo, accuracy, played_at 
     FROM scores 
     WHERE difficulty = ? 
     ORDER BY score DESC 
     LIMIT ?`,
    [diff, limit],
    (err, rows) => {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      res.json(rows);
    }
  );
});

// 2. Submit a Score
app.post('/api/scores', (req, res) => {
  const { username, score, difficulty, accuracy, max_combo, user_id } = req.body;
  
  if (!username || score === undefined || !difficulty) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  // Insert score
  db.run(
    `INSERT INTO scores (user_id, username, score, difficulty, accuracy, max_combo) 
     VALUES (?, ?, ?, ?, ?, ?)`,
    [user_id || null, username, score, difficulty, accuracy || 0, max_combo || 1],
    function(err) {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      res.json({ id: this.lastID, message: "Score submitted successfully" });
    }
  );
});

// 3. User Register (Simple)
app.post('/api/register', (req, res) => {
    const { username, password } = req.body;
    if(!username || !password) return res.status(400).json({error: "Username and password required"});
    
    db.run("INSERT INTO users (username, password) VALUES (?, ?)", [username, password], function(err) {
        if(err) {
            if(err.message.includes('UNIQUE constraint failed')) {
                return res.status(400).json({error: "Username already exists"});
            }
            return res.status(500).json({error: err.message});
        }
        
        const userId = this.lastID;
        // Initialize stats
        db.run("INSERT INTO user_stats (user_id) VALUES (?)", [userId]);
        
        res.json({ id: userId, username, message: "Registration successful" });
    });
});

// 4. User Login (Simple)
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    
    db.get("SELECT id, username FROM users WHERE username = ? AND password = ?", [username, password], (err, row) => {
        if(err) return res.status(500).json({error: err.message});
        if(!row) return res.status(401).json({error: "Invalid credentials"});
        
        res.json(row);
    });
});

// 5. Get User Stats
app.get('/api/users/:id/stats', (req, res) => {
    db.get("SELECT * FROM user_stats WHERE user_id = ?", [req.params.id], (err, row) => {
        if(err) return res.status(500).json({error: err.message});
        if(!row) return res.status(404).json({error: "Stats not found"});
        
        res.json(row);
    });
});

// 6. Update User Stats (Called after a game if logged in)
app.post('/api/users/:id/stats/update', (req, res) => {
    const userId = req.params.id;
    const { score, accuracy, total_words, success_words } = req.body;
    
    db.run(`
        UPDATE user_stats 
        SET games_played = games_played + 1,
            highest_score = MAX(highest_score, ?),
            total_accuracy = total_accuracy + ?,
            total_words = total_words + ?,
            success_words = success_words + ?
        WHERE user_id = ?
    `, [score, accuracy, total_words, success_words, userId], function(err) {
        if(err) return res.status(500).json({error: err.message});
        res.json({message: "Stats updated"});
    });
});

// 7. Get Word Lists
app.get('/api/wordlists', (req, res) => {
    db.all("SELECT id, name FROM word_lists WHERE is_public = 1", [], (err, rows) => {
        if(err) return res.status(500).json({error: err.message});
        res.json(rows);
    });
});

// 8. Get Specific Word List
app.get('/api/wordlists/:id', (req, res) => {
    db.get("SELECT title, words FROM word_lists WHERE id = ?", [req.params.id], (err, row) => {
        if(err) return res.status(500).json({error: err.message});
        if(!row) return res.status(404).json({error: "List not found"});
        
        try {
            row.words = JSON.parse(row.words);
            res.json(row);
        } catch(e) {
            res.status(500).json({error: "Invalid word list format"});
        }
    });
});

// Catch-all to serve frontend
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dark-metal-typing-game-v2.html'));
});

app.listen(PORT, () => {
  console.log(\`Server is running on http://localhost:\${PORT}\`);
});

// Handle graceful shutdown
process.on('SIGINT', () => {
    db.close((err) => {
        if (err) console.error(err.message);
        console.log('Database connection closed.');
        process.exit(0);
    });
});
