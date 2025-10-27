import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serveStatic } from 'hono/cloudflare-workers'

type Bindings = {
  DB: D1Database;
}

const app = new Hono<{ Bindings: Bindings }>()

// Enable CORS
app.use('/api/*', cors())

// Serve static files
app.use('/static/*', serveStatic({ root: './public' }))

// Helper function to generate user ID
function generateUserId(nickname: string, countryCode: string): string {
  return `${countryCode}_${nickname}_${Date.now()}`.replace(/\s+/g, '_').toLowerCase();
}

// Helper function to check if user can play world battle today
async function canPlayWorldBattle(db: D1Database, userId: string): Promise<boolean> {
  const today = new Date().toISOString().split('T')[0];
  
  const user = await db.prepare(`
    SELECT last_world_battle_date FROM users WHERE id = ?
  `).bind(userId).first();
  
  if (!user) return true;
  
  return user.last_world_battle_date !== today;
}

// Helper function to update country stats
async function updateCountryStats(
  db: D1Database,
  countryCode: string,
  countryName: string,
  isWin: boolean
) {
  const today = new Date().toISOString().split('T')[0];
  
  // Check if country exists
  const country = await db.prepare(`
    SELECT * FROM country_stats WHERE country_code = ?
  `).bind(countryCode).first();
  
  if (!country) {
    // Create new country entry
    await db.prepare(`
      INSERT INTO country_stats (
        country_code, country_name,
        total_matches, total_wins, total_losses,
        matches_today, wins_today, losses_today,
        matches_last_7_days, wins_last_7_days, losses_last_7_days
      ) VALUES (?, ?, 1, ?, ?, 1, ?, ?, 1, ?, ?)
    `).bind(
      countryCode, countryName,
      isWin ? 1 : 0, isWin ? 0 : 1,
      isWin ? 1 : 0, isWin ? 0 : 1,
      isWin ? 1 : 0, isWin ? 0 : 1
    ).run();
  } else {
    // Update existing country
    await db.prepare(`
      UPDATE country_stats SET
        total_matches = total_matches + 1,
        total_wins = total_wins + ?,
        total_losses = total_losses + ?,
        matches_today = matches_today + 1,
        wins_today = wins_today + ?,
        losses_today = losses_today + ?,
        matches_last_7_days = matches_last_7_days + 1,
        wins_last_7_days = wins_last_7_days + ?,
        losses_last_7_days = losses_last_7_days + ?,
        last_updated = CURRENT_TIMESTAMP
      WHERE country_code = ?
    `).bind(
      isWin ? 1 : 0,
      isWin ? 0 : 1,
      isWin ? 1 : 0,
      isWin ? 0 : 1,
      isWin ? 1 : 0,
      isWin ? 0 : 1,
      countryCode
    ).run();
  }
}

// API: Start world battle match
app.post('/api/match/world', async (c) => {
  const { DB } = c.env;
  const { nickname, countryCode, countryName, difficulty } = await c.req.json();
  
  if (!nickname || !countryCode || !countryName || !difficulty) {
    return c.json({ error: 'Missing required fields' }, 400);
  }
  
  // Generate user ID
  const userId = generateUserId(nickname, countryCode);
  
  // Check if user can play today
  const canPlay = await canPlayWorldBattle(DB, userId);
  if (!canPlay) {
    return c.json({ error: 'You have already played World Battle today. Try again tomorrow!' }, 403);
  }
  
  // Create or update user
  const today = new Date().toISOString().split('T')[0];
  await DB.prepare(`
    INSERT INTO users (id, nickname, country_code, country_name, last_world_battle_date)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      last_world_battle_date = ?
  `).bind(userId, nickname, countryCode, countryName, today, today).run();
  
  // Match with AI opponent (simplified - in real app would match with other players)
  const opponent = {
    type: 'ai',
    nickname: 'AI_Bot'
  };
  
  return c.json({
    userId,
    opponent,
    difficulty,
    message: 'Match started! No other players available, matched with AI.'
  });
});

// API: Save match result
app.post('/api/match/result', async (c) => {
  const { DB } = c.env;
  const {
    userId,
    nickname,
    countryCode,
    countryName,
    matchType,
    difficulty,
    opponentType,
    opponentNickname,
    result,
    score,
    completedRounds
  } = await c.req.json();
  
  if (!userId || !matchType || !result) {
    return c.json({ error: 'Missing required fields' }, 400);
  }
  
  // Save match result
  await DB.prepare(`
    INSERT INTO match_results (
      user_id, nickname, country_code, country_name,
      match_type, difficulty, opponent_type, opponent_nickname,
      result, score, completed_rounds
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    userId, nickname, countryCode, countryName,
    matchType, difficulty, opponentType, opponentNickname,
    result, score, completedRounds
  ).run();
  
  // Update country stats only for world battles
  if (matchType === 'world') {
    await updateCountryStats(DB, countryCode, countryName, result === 'win');
  }
  
  return c.json({ success: true, message: 'Result saved' });
});

// API: Get leaderboard
app.get('/api/leaderboard', async (c) => {
  const { DB } = c.env;
  
  const today = new Date().toISOString().split('T')[0];
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  
  // Get today's stats
  const todayStats = await DB.prepare(`
    SELECT
      country_code,
      country_name,
      COUNT(*) as matches,
      SUM(CASE WHEN result = 'win' THEN 1 ELSE 0 END) as wins,
      SUM(CASE WHEN result = 'loss' THEN 1 ELSE 0 END) as losses,
      ROUND(CAST(SUM(CASE WHEN result = 'win' THEN 1 ELSE 0 END) AS FLOAT) / COUNT(*) * 100, 1) as win_rate
    FROM match_results
    WHERE match_type = 'world'
      AND DATE(created_at) = ?
    GROUP BY country_code, country_name
    ORDER BY win_rate DESC, wins DESC
    LIMIT 50
  `).bind(today).all();
  
  // Get last 7 days stats
  const weekStats = await DB.prepare(`
    SELECT
      country_code,
      country_name,
      COUNT(*) as matches,
      SUM(CASE WHEN result = 'win' THEN 1 ELSE 0 END) as wins,
      SUM(CASE WHEN result = 'loss' THEN 1 ELSE 0 END) as losses,
      ROUND(CAST(SUM(CASE WHEN result = 'win' THEN 1 ELSE 0 END) AS FLOAT) / COUNT(*) * 100, 1) as win_rate
    FROM match_results
    WHERE match_type = 'world'
      AND DATE(created_at) >= ?
    GROUP BY country_code, country_name
    ORDER BY win_rate DESC, wins DESC
    LIMIT 50
  `).bind(sevenDaysAgo).all();
  
  return c.json({
    today: todayStats.results || [],
    last7days: weekStats.results || []
  });
});

// Root route - Main HTML
app.get('/', (c) => {
  return c.html(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>NEONCRYPT - Global Typing Battle</title>
    <link rel="stylesheet" href="/static/styles.css">
</head>
<body>
    <div class="container">
        <!-- Header -->
        <header class="header">
            <h1 class="logo">NEONCRYPT</h1>
            <div class="status">
                STATUS: <span class="status-indicator">idle</span>
            </div>
        </header>

        <!-- Controls -->
        <div class="controls">
            <div class="control-group">
                <label class="control-label">Sound</label>
                <input type="checkbox" id="sound-toggle" checked>
                <span class="control-label">On</span>
            </div>
            <div class="control-group">
                <label class="control-label">Volume</label>
                <input type="range" id="volume-control" min="0" max="100" value="50">
            </div>
        </div>

        <!-- Welcome Screen -->
        <div id="welcome-screen" class="screen">
            <div class="welcome-content">
                <h2 class="welcome-title">Connect worldwide. Type fast. Solve the mystery.</h2>
                <p class="welcome-text">
                    <span class="highlight">Nickname + Country</span> to join random matches, friends, or AI opponents.
                </p>
                <p class="welcome-text">
                    Tip: If no match is found, you'll be paired with an AI bot tuned to your difficulty.
                </p>

                <div class="input-group">
                    <label class="input-label">Nickname</label>
                    <input type="text" id="nickname-input" class="neon-input" 
                           placeholder="Type your handle (e.g. pixel_hacker)">
                </div>

                <div class="input-group country-suggestions">
                    <label class="input-label">Country</label>
                    <input type="text" id="country-input" class="neon-input" 
                           placeholder="Start typing your country...">
                    <div id="country-suggestions"></div>
                </div>

                <div class="btn-group">
                    <button class="neon-btn" id="random-match-btn">Random Match</button>
                    <button class="neon-btn secondary" id="friend-match-btn">Play with Friend</button>
                </div>

                <p class="welcome-text" style="margin-top: 30px; font-size: 0.85rem;">
                    No account required — just a nickname.
                </p>
            </div>
        </div>

        <!-- Game Screen -->
        <div id="game-screen" class="screen">
            <div class="game-container">
                <!-- Player Info -->
                <div id="player-info" class="player-info"></div>

                <!-- Game Menu -->
                <div id="game-menu" class="welcome-content">
                    <h2 class="welcome-title">Select Game Mode</h2>
                    
                    <div class="difficulty-selector">
                        <button class="difficulty-btn" data-difficulty="easy">Easy</button>
                        <button class="difficulty-btn active" data-difficulty="normal">Normal</button>
                        <button class="difficulty-btn" data-difficulty="hard">Hard</button>
                    </div>

                    <div class="btn-group">
                        <button class="neon-btn" id="start-game-btn">Start Game</button>
                        <button class="neon-btn secondary" id="view-leaderboard">View Leaderboard</button>
                    </div>
                </div>

                <!-- Game Play -->
                <div id="game-play" class="game-play">
                    <div class="game-header">
                        <div class="round-info" id="round-number">Round 1/2</div>
                        <div class="timer-info" id="timer-display">
                            <span class="timer-label">Time:</span>
                            <span class="timer-value" id="timer-value">0:00</span>
                        </div>
                    </div>
                    
                    <div class="scores-container">
                        <div class="player-score">
                            <span class="score-label">You</span>
                            <span class="score-value" id="player-score">0</span>
                        </div>
                        <div class="vs-divider">VS</div>
                        <div class="opponent-score">
                            <span class="score-label" id="opponent-name">AI Bot</span>
                            <span class="score-value" id="opponent-score">0</span>
                        </div>
                    </div>

                    <!-- Typing Section -->
                    <div class="typing-section">
                        <div class="sentence-display" id="sentence-display">
                            The quick brown fox jumps over the lazy dog.
                        </div>
                        <input type="text" id="typing-input" class="typing-input" 
                               placeholder="Type the sentence exactly...">
                    </div>

                    <!-- Question Section -->
                    <div id="question-section" class="question-section">
                        <div class="question-text" id="question-text">What is 2 + 2?</div>
                        <div class="answers-grid">
                            <button class="answer-btn" data-answer="4">4</button>
                            <button class="answer-btn" data-answer="3">3</button>
                            <button class="answer-btn" data-answer="5">5</button>
                            <button class="answer-btn" data-answer="2">2</button>
                        </div>
                    </div>
                </div>

                <!-- Game Result -->
                <div id="game-result" class="game-result">
                    <h2 class="result-title" id="result-title">🎉 VICTORY!</h2>
                    <div class="result-score" id="result-score">Final Score: 100</div>
                    <div class="btn-group">
                        <button class="neon-btn" id="play-again">Play Again</button>
                        <button class="neon-btn secondary" id="back-to-menu">Back to Menu</button>
                    </div>
                </div>
            </div>
        </div>

        <!-- Leaderboard Screen -->
        <div id="leaderboard-screen" class="screen">
            <div class="leaderboard-content">
                <h2 class="welcome-title">Global Leaderboard</h2>

                <div class="leaderboard-section">
                    <h3 class="section-title">📅 Today's Rankings</h3>
                    <div id="today-leaderboard">
                        <div class="no-data">Loading...</div>
                    </div>
                </div>

                <div class="leaderboard-section">
                    <h3 class="section-title">📊 Last 7 Days Rankings</h3>
                    <div id="week-leaderboard">
                        <div class="no-data">Loading...</div>
                    </div>
                </div>

                <div class="btn-group">
                    <button class="neon-btn" id="back-to-menu">Back to Menu</button>
                </div>
            </div>
        </div>
    </div>

    <script src="/static/app.js"></script>
</body>
</html>
  `)
})

export default app
