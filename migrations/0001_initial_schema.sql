-- Users table to track players and their daily battle limits
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  nickname TEXT NOT NULL,
  country_code TEXT NOT NULL,
  country_name TEXT NOT NULL,
  last_world_battle_date TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Match results table
CREATE TABLE IF NOT EXISTS match_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  nickname TEXT NOT NULL,
  country_code TEXT NOT NULL,
  country_name TEXT NOT NULL,
  match_type TEXT NOT NULL, -- 'world' or 'friend'
  difficulty TEXT NOT NULL, -- 'easy', 'normal', 'hard'
  opponent_type TEXT NOT NULL, -- 'player' or 'ai'
  opponent_nickname TEXT,
  result TEXT NOT NULL, -- 'win' or 'loss'
  score INTEGER DEFAULT 0,
  completed_rounds INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Country leaderboard (aggregated stats)
CREATE TABLE IF NOT EXISTS country_stats (
  country_code TEXT PRIMARY KEY,
  country_name TEXT NOT NULL,
  total_matches INTEGER DEFAULT 0,
  total_wins INTEGER DEFAULT 0,
  total_losses INTEGER DEFAULT 0,
  matches_last_7_days INTEGER DEFAULT 0,
  wins_last_7_days INTEGER DEFAULT 0,
  losses_last_7_days INTEGER DEFAULT 0,
  matches_today INTEGER DEFAULT 0,
  wins_today INTEGER DEFAULT 0,
  losses_today INTEGER DEFAULT 0,
  last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_country ON users(country_code);
CREATE INDEX IF NOT EXISTS idx_match_results_user ON match_results(user_id);
CREATE INDEX IF NOT EXISTS idx_match_results_country ON match_results(country_code);
CREATE INDEX IF NOT EXISTS idx_match_results_type ON match_results(match_type);
CREATE INDEX IF NOT EXISTS idx_match_results_date ON match_results(created_at);
