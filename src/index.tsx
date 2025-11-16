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

// Serve robots.txt
app.get('/robots.txt', async (c) => {
  const text = `# NeonCrypt - Global Typing Battle Game
# Robots.txt

User-agent: *
Allow: /
Disallow: /api/

# Sitemap
Sitemap: https://your-project.pages.dev/sitemap.xml

# Common crawlers
User-agent: Googlebot
Allow: /

User-agent: Bingbot
Allow: /

User-agent: Slurp
Allow: /

# Block bad bots
User-agent: AhrefsBot
Disallow: /

User-agent: SemrushBot
Disallow: /

# Crawl-delay for all bots
Crawl-delay: 1`;
  return c.text(text, 200, { 'Content-Type': 'text/plain' });
})

// Serve sitemap.xml
app.get('/sitemap.xml', async (c) => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://your-project.pages.dev/</loc>
    <lastmod>2025-10-31</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>https://your-project.pages.dev/credits</loc>
    <lastmod>2025-10-31</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.5</priority>
  </url>
  <url>
    <loc>https://your-project.pages.dev/terms</loc>
    <lastmod>2025-10-31</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.5</priority>
  </url>
  <url>
    <loc>https://your-project.pages.dev/privacy</loc>
    <lastmod>2025-10-31</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.5</priority>
  </url>
  <url>
    <loc>https://your-project.pages.dev/cookies</loc>
    <lastmod>2025-10-31</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.5</priority>
  </url>
</urlset>`;
  return c.text(xml, 200, { 'Content-Type': 'application/xml' });
})

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
    <meta name="description" content="NeonCrypt - Global 1v1 typing and puzzle battle game. Compete with players worldwide in real-time matches with riddles and typing challenges.">
    <meta name="keywords" content="typing game, puzzle game, online game, multiplayer, riddles, cyberpunk, typing battle">
    <meta name="author" content="NeonCrypt Team">
    
    <!-- Google Search Console Verification -->
    <!-- Replace YOUR_VERIFICATION_CODE with your actual verification code from Google Search Console -->
    <meta name="google-site-verification" content="YOUR_GOOGLE_SEARCH_CONSOLE_VERIFICATION_CODE">
    
    <!-- Google Analytics 4 -->
    <!-- Replace G-XXXXXXXXXX with your actual GA4 Measurement ID -->
    <script async src="https://www.googletagmanager.com/gtag/js?id=G-XXXXXXXXXX"></script>
    <script>
      window.dataLayer = window.dataLayer || [];
      function gtag(){dataLayer.push(arguments);}
      gtag('js', new Date());
      gtag('config', 'G-XXXXXXXXXX', {
        'page_title': 'NeonCrypt - Home',
        'page_location': window.location.href
      });
    </script>
    
    <title>NEONCRYPT - Global Typing Battle</title>
    <link rel="stylesheet" href="/static/styles.css">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    
    <!-- Firebase SDK -->
    <script src="https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js"></script>
    <script src="https://www.gstatic.com/firebasejs/10.7.1/firebase-database-compat.js"></script>
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
                
                <div id="firebase-status" style="margin-top: 20px; padding: 10px; background: rgba(255, 165, 0, 0.1); border: 1px solid rgba(255, 165, 0, 0.5); display: none;">
                    <div style="color: #ffa500; font-size: 0.9rem; text-align: center;">
                        ⚠️ Firebase not configured - AI opponent mode only<br>
                        <span style="font-size: 0.8rem;">See FIREBASE_SETUP.md for real-time matching setup</span>
                    </div>
                </div>

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
                
                <!-- Friend Room Modal -->
                <div id="friend-room-modal" class="modal" style="display: none;">
                    <div class="modal-content">
                        <h3 class="modal-title">Play with Friend</h3>
                        <div class="modal-body">
                            <div class="room-options">
                                <button class="room-option-btn" id="create-room-btn">
                                    <i class="fas fa-plus-circle"></i>
                                    <span>Create Room</span>
                                </button>
                                <button class="room-option-btn" id="join-room-btn">
                                    <i class="fas fa-sign-in-alt"></i>
                                    <span>Join Room</span>
                                </button>
                            </div>
                            
                            <div id="create-room-section" style="display: none;">
                                <p class="room-instruction">Share this code with your friend:</p>
                                <div class="room-code-display">
                                    <input type="text" id="room-code-display" class="room-code-input" readonly>
                                    <button class="copy-btn" id="copy-code-btn">
                                        <i class="fas fa-copy"></i> Copy
                                    </button>
                                </div>
                                <p class="room-status" id="room-status">Waiting for friend to join...</p>
                            </div>
                            
                            <div id="join-room-section" style="display: none;">
                                <p class="room-instruction">Enter your friend's room code:</p>
                                <input type="text" id="room-code-input" class="neon-input" 
                                       placeholder="Enter 6-digit code" maxlength="6">
                                <button class="neon-btn" id="join-room-submit-btn">Join Room</button>
                            </div>
                        </div>
                        <button class="modal-close-btn" id="close-modal-btn">Close</button>
                    </div>
                </div>

                <p class="welcome-text" style="margin-top: 30px; font-size: 0.85rem;">
                    No account required — just a nickname.
                </p>
                
                <!-- Live Leaderboard -->
                <div class="live-leaderboard">
                    <h3 class="leaderboard-title">
                        <i class="fas fa-trophy"></i> Top 5 Countries
                    </h3>
                    <div id="welcome-leaderboard" class="welcome-leaderboard-content">
                        <div class="loading-text">Loading rankings...</div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Game Screen -->
        <div id="game-screen" class="screen">
            <div class="game-container">
                <!-- Player Info -->
                <div id="player-info" class="player-info">
                    <button id="logout-btn" class="logout-btn" title="Change Player">
                        <i class="fas fa-sign-out-alt"></i> Logout
                    </button>
                </div>

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
                               placeholder="Type the sentence exactly..." autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false">
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

    <!-- Footer -->
    <footer class="footer">
        <div class="footer-content">
            <div class="footer-links">
                <a href="/credits" class="footer-link">Credits</a>
                <a href="/terms" class="footer-link">Terms of Service</a>
                <a href="/privacy" class="footer-link">Privacy Policy</a>
                <a href="/cookies" class="footer-link">Cookie Policy</a>
                <a href="mailto:neoncrypt.game@gmail.com" class="footer-link">Contact</a>
            </div>
            <div class="footer-copyright">
                © 2025 NeonCrypt. All rights reserved.
            </div>
        </div>
    </footer>

    <script src="/static/app.js"></script>
</body>
</html>
  `)
})

// Credits page
app.get('/credits', (c) => {
  return c.html(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    
    <!-- Google Analytics 4 -->
    <script async src="https://www.googletagmanager.com/gtag/js?id=G-XXXXXXXXXX"></script>
    <script>
      window.dataLayer = window.dataLayer || [];
      function gtag(){dataLayer.push(arguments);}
      gtag('js', new Date());
      gtag('config', 'G-XXXXXXXXXX', {
        'page_title': 'Credits - NeonCrypt',
        'page_location': window.location.href
      });
    </script>
    
    <title>Credits - NEONCRYPT</title>
    <link rel="stylesheet" href="/static/styles.css">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
</head>
<body>
    <div class="container">
        <header class="header">
            <h1 class="logo">NEONCRYPT</h1>
        </header>

        <div class="legal-content">
            <h1 class="legal-title">Credits & Acknowledgments</h1>
            
            <section class="legal-section">
                <h2>Development</h2>
                <p><strong>NeonCrypt</strong> is developed and maintained by the NeonCrypt Team.</p>
                <p>Contact: <a href="mailto:neoncrypt.game@gmail.com">neoncrypt.game@gmail.com</a></p>
            </section>

            <section class="legal-section">
                <h2>Technologies Used</h2>
                <ul class="legal-list">
                    <li><strong>Hono</strong> - Fast web framework for Cloudflare Workers</li>
                    <li><strong>Cloudflare Pages</strong> - Edge deployment platform</li>
                    <li><strong>Cloudflare D1</strong> - Distributed SQLite database</li>
                    <li><strong>Firebase Realtime Database</strong> - Real-time data synchronization</li>
                    <li><strong>REST Countries API</strong> - Country information and flags</li>
                    <li><strong>Font Awesome</strong> - Icons (<a href="https://fontawesome.com/license/free" target="_blank">License</a>)</li>
                    <li><strong>Google Fonts</strong> - Orbitron and Share Tech Mono fonts</li>
                </ul>
            </section>

            <section class="legal-section">
                <h2>Riddles & Content</h2>
                <p>The riddles and puzzles in this game are compiled from various public domain sources and original creations. We respect intellectual property rights and do not claim ownership of traditional riddles in the public domain.</p>
            </section>

            <section class="legal-section">
                <h2>Open Source Libraries</h2>
                <p>This project uses various open source software libraries. We thank all contributors to the open source community.</p>
            </section>

            <section class="legal-section">
                <h2>Special Thanks</h2>
                <p>To all players worldwide who make this game possible through their participation and feedback.</p>
            </section>

            <div class="btn-group">
                <a href="/" class="neon-btn">Back to Home</a>
            </div>
        </div>
    </div>
</body>
</html>
  `)
})

// Terms of Service page
app.get('/terms', (c) => {
  return c.html(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    
    <!-- Google Analytics 4 -->
    <script async src="https://www.googletagmanager.com/gtag/js?id=G-XXXXXXXXXX"></script>
    <script>
      window.dataLayer = window.dataLayer || [];
      function gtag(){dataLayer.push(arguments);}
      gtag('js', new Date());
      gtag('config', 'G-XXXXXXXXXX', {
        'page_title': 'Terms of Service - NeonCrypt',
        'page_location': window.location.href
      });
    </script>
    
    <title>Terms of Service - NEONCRYPT</title>
    <link rel="stylesheet" href="/static/styles.css">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
</head>
<body>
    <div class="container">
        <header class="header">
            <h1 class="logo">NEONCRYPT</h1>
        </header>

        <div class="legal-content">
            <h1 class="legal-title">Terms of Service</h1>
            <p class="legal-update">Last Updated: October 31, 2025</p>
            
            <section class="legal-section">
                <h2>1. Acceptance of Terms</h2>
                <p>By accessing and using NeonCrypt ("the Service"), you accept and agree to be bound by the terms and provisions of this agreement. If you do not agree to these terms, please do not use the Service.</p>
            </section>

            <section class="legal-section">
                <h2>2. Description of Service</h2>
                <p>NeonCrypt is a free online typing and puzzle battle game that allows users to compete against other players or AI opponents in real-time matches.</p>
            </section>

            <section class="legal-section">
                <h2>3. User Conduct</h2>
                <p>You agree not to:</p>
                <ul class="legal-list">
                    <li>Use offensive, inappropriate, or abusive nicknames</li>
                    <li>Attempt to hack, disrupt, or exploit the game systems</li>
                    <li>Use automated bots or scripts to play the game</li>
                    <li>Harass, bully, or negatively target other players</li>
                    <li>Engage in any activity that violates applicable laws</li>
                </ul>
            </section>

            <section class="legal-section">
                <h2>4. Account and Data</h2>
                <p>NeonCrypt does not require account registration. User data (nickname and country) is stored locally in your browser and may be transmitted to our servers for gameplay purposes.</p>
            </section>

            <section class="legal-section">
                <h2>5. Intellectual Property</h2>
                <p>All content, features, and functionality of the Service are owned by NeonCrypt and are protected by international copyright, trademark, and other intellectual property laws.</p>
            </section>

            <section class="legal-section">
                <h2>6. Limitation of Liability</h2>
                <p>The Service is provided "as is" without warranties of any kind. NeonCrypt shall not be liable for any damages arising from the use or inability to use the Service.</p>
            </section>

            <section class="legal-section">
                <h2>7. Changes to Terms</h2>
                <p>We reserve the right to modify these terms at any time. Continued use of the Service after changes constitutes acceptance of the new terms.</p>
            </section>

            <section class="legal-section">
                <h2>8. Termination</h2>
                <p>We reserve the right to terminate or suspend access to the Service immediately, without prior notice, for any reason, including breach of these Terms.</p>
            </section>

            <section class="legal-section">
                <h2>9. Contact Information</h2>
                <p>For questions about these Terms, please contact us at:</p>
                <p><a href="mailto:neoncrypt.game@gmail.com">neoncrypt.game@gmail.com</a></p>
            </section>

            <div class="btn-group">
                <a href="/" class="neon-btn">Back to Home</a>
            </div>
        </div>
    </div>
</body>
</html>
  `)
})

// Privacy Policy page
app.get('/privacy', (c) => {
  return c.html(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    
    <!-- Google Analytics 4 -->
    <script async src="https://www.googletagmanager.com/gtag/js?id=G-XXXXXXXXXX"></script>
    <script>
      window.dataLayer = window.dataLayer || [];
      function gtag(){dataLayer.push(arguments);}
      gtag('js', new Date());
      gtag('config', 'G-XXXXXXXXXX', {
        'page_title': 'Privacy Policy - NeonCrypt',
        'page_location': window.location.href
      });
    </script>
    
    <title>Privacy Policy - NEONCRYPT</title>
    <link rel="stylesheet" href="/static/styles.css">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
</head>
<body>
    <div class="container">
        <header class="header">
            <h1 class="logo">NEONCRYPT</h1>
        </header>

        <div class="legal-content">
            <h1 class="legal-title">Privacy Policy</h1>
            <p class="legal-update">Last Updated: October 31, 2025</p>
            
            <section class="legal-section">
                <h2>1. Information We Collect</h2>
                
                <h3>1.1 Information You Provide</h3>
                <ul class="legal-list">
                    <li><strong>Nickname:</strong> A display name you choose for gameplay</li>
                    <li><strong>Country:</strong> Your selected country for leaderboard purposes</li>
                </ul>

                <h3>1.2 Automatically Collected Information</h3>
                <ul class="legal-list">
                    <li><strong>Game Statistics:</strong> Match results, scores, completion times</li>
                    <li><strong>Technical Data:</strong> Browser type, device information, IP address (for security)</li>
                    <li><strong>Usage Data:</strong> Game interactions, feature usage patterns</li>
                </ul>
            </section>

            <section class="legal-section">
                <h2>2. How We Use Your Information</h2>
                <p>We use collected information to:</p>
                <ul class="legal-list">
                    <li>Provide and maintain the game service</li>
                    <li>Match you with other players in real-time</li>
                    <li>Display leaderboards and country rankings</li>
                    <li>Prevent cheating and enforce daily play limits</li>
                    <li>Improve game features and user experience</li>
                    <li>Communicate about service updates (if you contact us)</li>
                </ul>
            </section>

            <section class="legal-section">
                <h2>3. Data Storage and Security</h2>
                <p><strong>Local Storage:</strong> Your nickname and country preferences are stored in your browser's local storage.</p>
                <p><strong>Server Storage:</strong> Game results and statistics are stored securely in our Cloudflare D1 database.</p>
                <p><strong>Firebase:</strong> Real-time match data is temporarily stored in Firebase Realtime Database during active games.</p>
                <p><strong>Security:</strong> We implement reasonable security measures to protect your data, but no method of transmission over the internet is 100% secure.</p>
            </section>

            <section class="legal-section">
                <h2>4. Third-Party Services</h2>
                <p>We use the following third-party services:</p>
                <ul class="legal-list">
                    <li><strong>Cloudflare:</strong> Hosting and content delivery (<a href="https://www.cloudflare.com/privacypolicy/" target="_blank">Privacy Policy</a>)</li>
                    <li><strong>Firebase:</strong> Real-time database (<a href="https://firebase.google.com/support/privacy" target="_blank">Privacy Policy</a>)</li>
                    <li><strong>Google Analytics:</strong> Website analytics and user behavior tracking (<a href="https://policies.google.com/privacy" target="_blank">Privacy Policy</a>)</li>
                    <li><strong>REST Countries API:</strong> Country information</li>
                    <li><strong>Google Fonts:</strong> Web fonts (<a href="https://policies.google.com/privacy" target="_blank">Privacy Policy</a>)</li>
                </ul>
            </section>

            <section class="legal-section">
                <h2>5. Cookies and Tracking</h2>
                <p>We use browser local storage to save your preferences and Google Analytics to track website usage patterns. Google Analytics may set cookies to collect anonymous usage data such as:</p>
                <ul class="legal-list">
                    <li>Pages visited and time spent on each page</li>
                    <li>Device type and browser information</li>
                    <li>Geographic location (country/city level)</li>
                    <li>Traffic sources and user flow</li>
                </ul>
                <p>You can opt-out of Google Analytics tracking by installing the <a href="https://tools.google.com/dlpage/gaoptout" target="_blank">Google Analytics Opt-out Browser Add-on</a>.</p>
                <p>For more details, see our <a href="/cookies">Cookie Policy</a>.</p>
            </section>

            <section class="legal-section">
                <h2>6. Data Retention</h2>
                <p>Game statistics and leaderboard data are retained indefinitely to maintain historical rankings. You can clear your local data by clearing your browser's local storage.</p>
            </section>

            <section class="legal-section">
                <h2>7. Your Rights</h2>
                <p>You have the right to:</p>
                <ul class="legal-list">
                    <li>Access your personal data</li>
                    <li>Request deletion of your data (contact us)</li>
                    <li>Stop using the service at any time</li>
                    <li>Clear your browser's local storage</li>
                </ul>
            </section>

            <section class="legal-section">
                <h2>8. Children's Privacy</h2>
                <p>NeonCrypt is not directed to children under 13. We do not knowingly collect personal information from children under 13. If you believe we have collected such information, please contact us.</p>
            </section>

            <section class="legal-section">
                <h2>9. International Data Transfers</h2>
                <p>Your data may be processed in various countries where Cloudflare's edge network operates. By using the Service, you consent to such transfers.</p>
            </section>

            <section class="legal-section">
                <h2>10. Changes to This Policy</h2>
                <p>We may update this Privacy Policy from time to time. Changes will be posted on this page with an updated "Last Updated" date.</p>
            </section>

            <section class="legal-section">
                <h2>11. Contact Us</h2>
                <p>For privacy-related questions or requests, contact us at:</p>
                <p><a href="mailto:neoncrypt.game@gmail.com">neoncrypt.game@gmail.com</a></p>
            </section>

            <div class="btn-group">
                <a href="/" class="neon-btn">Back to Home</a>
            </div>
        </div>
    </div>
</body>
</html>
  `)
})

// Cookie Policy page
app.get('/cookies', (c) => {
  return c.html(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    
    <!-- Google Analytics 4 -->
    <script async src="https://www.googletagmanager.com/gtag/js?id=G-XXXXXXXXXX"></script>
    <script>
      window.dataLayer = window.dataLayer || [];
      function gtag(){dataLayer.push(arguments);}
      gtag('js', new Date());
      gtag('config', 'G-XXXXXXXXXX', {
        'page_title': 'Cookie Policy - NeonCrypt',
        'page_location': window.location.href
      });
    </script>
    
    <title>Cookie Policy - NEONCRYPT</title>
    <link rel="stylesheet" href="/static/styles.css">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
</head>
<body>
    <div class="container">
        <header class="header">
            <h1 class="logo">NEONCRYPT</h1>
        </header>

        <div class="legal-content">
            <h1 class="legal-title">Cookie Policy</h1>
            <p class="legal-update">Last Updated: October 31, 2025</p>
            
            <section class="legal-section">
                <h2>1. What Are Cookies?</h2>
                <p>Cookies are small text files stored on your device by websites you visit. They are widely used to make websites work more efficiently and provide information to website owners.</p>
            </section>

            <section class="legal-section">
                <h2>2. How NeonCrypt Uses Storage</h2>
                <p><strong>Important:</strong> NeonCrypt primarily uses <strong>Local Storage</strong> rather than traditional cookies.</p>
                
                <h3>2.1 Local Storage</h3>
                <p>We use browser Local Storage to save:</p>
                <ul class="legal-list">
                    <li><strong>User ID:</strong> A unique identifier generated for your gameplay</li>
                    <li><strong>Nickname:</strong> Your chosen display name</li>
                    <li><strong>Country:</strong> Your selected country</li>
                    <li><strong>Sound Preferences:</strong> Volume and on/off settings</li>
                </ul>
                <p><em>Purpose:</em> To remember your preferences and prevent you from re-entering information every visit.</p>
            </section>

            <section class="legal-section">
                <h2>3. Third-Party Cookies</h2>
                <p>Third-party services we use may set their own cookies:</p>
                
                <h3>3.1 Cloudflare</h3>
                <p>Cloudflare may use cookies for security, performance optimization, and DDoS protection.</p>
                <p>Learn more: <a href="https://www.cloudflare.com/cookie-policy/" target="_blank">Cloudflare Cookie Policy</a></p>

                <h3>3.2 Firebase</h3>
                <p>Firebase may use cookies for authentication and analytics purposes.</p>
                <p>Learn more: <a href="https://firebase.google.com/support/privacy" target="_blank">Firebase Privacy</a></p>

                <h3>3.3 Google Analytics</h3>
                <p>Google Analytics uses cookies to collect anonymous usage statistics including:</p>
                <ul class="legal-list">
                    <li><strong>_ga:</strong> Distinguishes unique users (expires in 2 years)</li>
                    <li><strong>_gid:</strong> Distinguishes unique users (expires in 24 hours)</li>
                    <li><strong>_gat:</strong> Throttles request rate (expires in 1 minute)</li>
                </ul>
                <p>This helps us understand how users interact with our game and improve the experience.</p>
                <p>Learn more: <a href="https://policies.google.com/technologies/cookies" target="_blank">Google Cookie Policy</a></p>
                <p>Opt-out: <a href="https://tools.google.com/dlpage/gaoptout" target="_blank">Google Analytics Opt-out Add-on</a></p>

                <h3>3.4 Google Fonts</h3>
                <p>Google Fonts may set cookies when loading web fonts.</p>
                <p>Learn more: <a href="https://policies.google.com/technologies/cookies" target="_blank">Google Cookie Policy</a></p>
            </section>

            <section class="legal-section">
                <h2>4. Types of Data We Store</h2>
                
                <table class="legal-table">
                    <thead>
                        <tr>
                            <th>Type</th>
                            <th>Purpose</th>
                            <th>Duration</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td>Strictly Necessary</td>
                            <td>User identification, preferences</td>
                            <td>Permanent (until cleared)</td>
                        </tr>
                        <tr>
                            <td>Functionality</td>
                            <td>Sound settings, game state</td>
                            <td>Permanent (until cleared)</td>
                        </tr>
                        <tr>
                            <td>Performance</td>
                            <td>CDN optimization (Cloudflare)</td>
                            <td>Varies by service</td>
                        </tr>
                        <tr>
                            <td>Analytics</td>
                            <td>Usage tracking (Google Analytics)</td>
                            <td>1 minute to 2 years</td>
                        </tr>
                    </tbody>
                </table>
            </section>

            <section class="legal-section">
                <h2>5. Managing Your Storage Preferences</h2>
                
                <h3>5.1 Clear Local Storage</h3>
                <p><strong>Chrome/Edge:</strong></p>
                <ol class="legal-list">
                    <li>Press F12 to open Developer Tools</li>
                    <li>Go to "Application" tab</li>
                    <li>Click "Local Storage" → Select the website</li>
                    <li>Right-click and select "Clear"</li>
                </ol>

                <p><strong>Firefox:</strong></p>
                <ol class="legal-list">
                    <li>Press F12 to open Developer Tools</li>
                    <li>Go to "Storage" tab</li>
                    <li>Click "Local Storage" → Select the website</li>
                    <li>Right-click and select "Delete All"</li>
                </ol>

                <h3>5.2 Disable Cookies (Third-Party)</h3>
                <p>You can configure your browser to refuse cookies, but this may affect website functionality:</p>
                <ul class="legal-list">
                    <li><strong>Chrome:</strong> Settings → Privacy and security → Cookies and other site data</li>
                    <li><strong>Firefox:</strong> Settings → Privacy & Security → Cookies and Site Data</li>
                    <li><strong>Safari:</strong> Preferences → Privacy → Cookies and website data</li>
                </ul>
            </section>

            <section class="legal-section">
                <h2>6. Do Not Track Signals</h2>
                <p>NeonCrypt does not track users across different websites. We only collect data necessary for gameplay within our service.</p>
            </section>

            <section class="legal-section">
                <h2>7. Updates to This Policy</h2>
                <p>We may update this Cookie Policy to reflect changes in technology or legal requirements. Please review this page periodically.</p>
            </section>

            <section class="legal-section">
                <h2>8. Contact Us</h2>
                <p>For questions about cookies and data storage, contact us at:</p>
                <p><a href="mailto:neoncrypt.game@gmail.com">neoncrypt.game@gmail.com</a></p>
            </section>

            <div class="btn-group">
                <a href="/" class="neon-btn">Back to Home</a>
            </div>
        </div>
    </div>
</body>
</html>
  `)
})

export default app
