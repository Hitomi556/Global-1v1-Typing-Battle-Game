// NeonCrypt - Game Logic
const API_BASE = '';
const COUNTRIES_API = 'https://restcountries.com/v3.1';

// Firebase Configuration
// Firebase Realtime Database for real-time matching
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyAbRpwp0_GZPpllAyOibfvOf-8TWDWezM8",
  authDomain: "neoncrypt-game.firebaseapp.com",
  databaseURL: "https://neoncrypt-game-default-rtdb.firebaseio.com",
  projectId: "neoncrypt-game",
  storageBucket: "neoncrypt-game.firebasestorage.app",
  messagingSenderId: "159940200017",
  appId: "1:159940200017:web:de8697ec234915bef21a70",
  measurementId: "G-08WB7F5D19"
};

let firebaseApp = null;
let database = null;

// Initialize Firebase
function initFirebase() {
  try {
    // Check if Firebase config is set
    if (FIREBASE_CONFIG.apiKey === "REPLACE_WITH_YOUR_API_KEY") {
      console.warn('Firebase not configured - using AI opponent mode only');
      console.info('See FIREBASE_SETUP.md for setup instructions');
      
      // Show warning in UI
      const statusDiv = document.getElementById('firebase-status');
      if (statusDiv) {
        statusDiv.style.display = 'block';
      }
      
      return false;
    }
    
    firebaseApp = firebase.initializeApp(FIREBASE_CONFIG);
    database = firebase.database();
    console.log('✅ Firebase initialized successfully - Real-time matching enabled!');
    return true;
  } catch (error) {
    console.error('Firebase initialization failed:', error);
    
    // Show warning in UI
    const statusDiv = document.getElementById('firebase-status');
    if (statusDiv) {
      statusDiv.style.display = 'block';
    }
    
    return false;
  }
}

// Sound management
const sounds = {
  typing: null,
  correct: null,
  wrong: null,
  enabled: true,
  volume: 0.5
};

// Initialize sounds (will be created programmatically)
function initSounds() {
  // We'll generate simple beep sounds using Web Audio API
  sounds.context = new (window.AudioContext || window.webkitAudioContext)();
}

function playSound(type) {
  if (!sounds.enabled || !sounds.context) return;
  
  const ctx = sounds.context;
  const oscillator = ctx.createOscillator();
  const gainNode = ctx.createGain();
  
  oscillator.connect(gainNode);
  gainNode.connect(ctx.destination);
  
  gainNode.gain.value = sounds.volume;
  
  switch(type) {
    case 'typing':
      oscillator.frequency.value = 800;
      oscillator.type = 'square';
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.05);
      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 0.05);
      break;
    case 'correct':
      oscillator.frequency.value = 1200;
      oscillator.type = 'sine';
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 0.2);
      break;
    case 'wrong':
      oscillator.frequency.value = 200;
      oscillator.type = 'sawtooth';
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 0.3);
      break;
  }
}

// Game state
const gameState = {
  user: null,
  currentMatch: null,
  difficulty: 'normal',
  currentRound: 0,
  score: 0,
  opponentScore: 0,
  countries: [],
  timer: {
    startTime: null,
    interval: null,
    elapsed: 0
  },
  typingStarted: false,
  matchId: null,
  isHost: false,
  opponentConnected: false,
  gameDataRef: null,
  listeners: [],
  roomListener: null,
  currentRiddle: null,
  targetText: ''
};

// Matching system using Firebase
const MatchingSystem = {
  async findMatch(userId, nickname, countryCode, countryName, difficulty) {
    if (!database) {
      console.log('Firebase not available, using AI opponent');
      return {
        type: 'ai',
        opponent: { type: 'ai', nickname: 'AI_Bot' }
      };
    }
    
    const matchingRef = database.ref('matching');
    const timestamp = Date.now();
    
    // Look for available matches with same difficulty
    const snapshot = await matchingRef
      .orderByChild('difficulty')
      .equalTo(difficulty)
      .limitToFirst(10)
      .once('value');
    
    const availableMatches = [];
    snapshot.forEach(child => {
      const match = child.val();
      // Check if match is still available (less than 30 seconds old)
      if (match.status === 'waiting' && 
          match.userId !== userId && 
          timestamp - match.timestamp < 30000) {
        availableMatches.push({ id: child.key, ...match });
      }
    });
    
    if (availableMatches.length > 0) {
      // Join existing match
      const match = availableMatches[0];
      const matchId = match.id;
      
      // Update match status
      await matchingRef.child(matchId).update({
        status: 'matched',
        player2Id: userId,
        player2Nickname: nickname,
        player2Country: countryCode
      });
      
      // Create game room
      const gameRef = database.ref(`games/${matchId}`);
      await gameRef.set({
        status: 'ready',
        difficulty: difficulty,
        player1: {
          id: match.userId,
          nickname: match.nickname,
          country: match.country,
          score: 0,
          round: 0,
          ready: false
        },
        player2: {
          id: userId,
          nickname: nickname,
          country: countryCode,
          score: 0,
          round: 0,
          ready: false
        },
        createdAt: timestamp
      });
      
      return {
        type: 'player',
        matchId: matchId,
        isHost: false,
        opponent: {
          type: 'player',
          nickname: match.nickname,
          country: match.country
        }
      };
    } else {
      // Create new match and wait
      const newMatchRef = matchingRef.push();
      await newMatchRef.set({
        userId: userId,
        nickname: nickname,
        country: countryCode,
        difficulty: difficulty,
        status: 'waiting',
        timestamp: timestamp
      });
      
      const matchId = newMatchRef.key;
      
      // Wait for opponent (max 10 seconds)
      return new Promise((resolve) => {
        let timeout;
        const checkInterval = setInterval(async () => {
          const matchSnapshot = await newMatchRef.once('value');
          const matchData = matchSnapshot.val();
          
          if (matchData && matchData.status === 'matched') {
            clearInterval(checkInterval);
            clearTimeout(timeout);
            
            resolve({
              type: 'player',
              matchId: matchId,
              isHost: true,
              opponent: {
                type: 'player',
                nickname: matchData.player2Nickname,
                country: matchData.player2Country
              }
            });
          }
        }, 500);
        
        // Timeout after 10 seconds - use AI opponent
        timeout = setTimeout(async () => {
          clearInterval(checkInterval);
          await newMatchRef.remove();
          
          resolve({
            type: 'ai',
            opponent: { type: 'ai', nickname: 'AI_Bot' }
          });
        }, 10000);
      });
    }
  },
  
  async setupGameListeners(matchId, isHost) {
    if (!database) return;
    
    const gameRef = database.ref(`games/${matchId}`);
    gameState.gameDataRef = gameRef;
    
    const playerKey = isHost ? 'player2' : 'player1';
    const opponentRef = gameRef.child(playerKey);
    
    // Listen to opponent's score changes
    const scoreListener = opponentRef.child('score').on('value', (snapshot) => {
      const score = snapshot.val();
      if (score !== null) {
        gameState.opponentScore = score;
        updateScoreDisplay();
      }
    });
    
    // Listen to opponent's round changes
    const roundListener = opponentRef.child('round').on('value', (snapshot) => {
      const round = snapshot.val();
      if (round !== null) {
        console.log(`Opponent completed round ${round}`);
      }
    });
    
    // Listen to game status
    const statusListener = gameRef.child('status').on('value', (snapshot) => {
      const status = snapshot.val();
      if (status === 'finished') {
        console.log('Game finished');
      }
    });
    
    gameState.listeners.push(
      { ref: opponentRef.child('score'), listener: scoreListener },
      { ref: opponentRef.child('round'), listener: roundListener },
      { ref: gameRef.child('status'), listener: statusListener }
    );
  },
  
  async updatePlayerData(matchId, isHost, data) {
    if (!database) return;
    
    const playerKey = isHost ? 'player1' : 'player2';
    const gameRef = database.ref(`games/${matchId}/${playerKey}`);
    await gameRef.update(data);
  },
  
  cleanup() {
    // Remove all listeners
    gameState.listeners.forEach(({ ref, listener }) => {
      ref.off('value', listener);
    });
    gameState.listeners = [];
    gameState.gameDataRef = null;
  }
};

// Initialize app
document.addEventListener('DOMContentLoaded', async () => {
  initFirebase();
  initSounds();
  setupEventListeners();
  loadCountries();
  loadWelcomeLeaderboard();
  checkExistingUser();
  updateStatus('idle');
});

// Status update helper
function updateStatus(status) {
  const statusIndicator = document.querySelector('.status-indicator');
  if (statusIndicator) {
    statusIndicator.textContent = status;
    statusIndicator.style.color = status === 'idle' ? 'var(--neon-green)' : 'var(--neon-cyan)';
  }
}

// Timer functions
function startTimer() {
  if (gameState.timer.interval) return; // Already started
  
  gameState.timer.startTime = Date.now();
  gameState.timer.elapsed = 0;
  
  gameState.timer.interval = setInterval(() => {
    gameState.timer.elapsed = Math.floor((Date.now() - gameState.timer.startTime) / 1000);
    updateTimerDisplay();
  }, 100);
}

function stopTimer() {
  if (gameState.timer.interval) {
    clearInterval(gameState.timer.interval);
    gameState.timer.interval = null;
  }
}

function updateTimerDisplay() {
  const minutes = Math.floor(gameState.timer.elapsed / 60);
  const seconds = gameState.timer.elapsed % 60;
  document.getElementById('timer-value').textContent = 
    `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function resetTimer() {
  stopTimer();
  gameState.timer.elapsed = 0;
  gameState.timer.startTime = null;
  document.getElementById('timer-value').textContent = '0:00';
}

// Update score displays
function updateScoreDisplay() {
  document.getElementById('player-score').textContent = gameState.score;
  document.getElementById('opponent-score').textContent = gameState.opponentScore;
}

// Simulate opponent progress (AI)
function simulateOpponentProgress() {
  const difficulty = gameState.difficulty;
  let baseDelay, variance;
  
  switch(difficulty) {
    case 'easy':
      baseDelay = 3000; // 3 seconds
      variance = 2000;
      break;
    case 'normal':
      baseDelay = 2000; // 2 seconds
      variance = 1500;
      break;
    case 'hard':
      baseDelay = 1500; // 1.5 seconds
      variance = 1000;
      break;
  }
  
  const delay = baseDelay + Math.random() * variance;
  
  setTimeout(() => {
    if (gameState.currentRound > 0 && gameState.currentRound <= { easy: 1, normal: 2, hard: 3 }[gameState.difficulty]) {
      gameState.opponentScore += 10;
      updateScoreDisplay();
    }
  }, delay);
}

function setupEventListeners() {
  // Sound controls
  document.getElementById('sound-toggle').addEventListener('change', (e) => {
    sounds.enabled = e.target.checked;
  });
  
  document.getElementById('volume-control').addEventListener('input', (e) => {
    sounds.volume = e.target.value / 100;
  });
  
  // Country input with autocomplete
  const countryInput = document.getElementById('country-input');
  countryInput.addEventListener('input', handleCountryInput);
  
  // Difficulty selection
  document.querySelectorAll('.difficulty-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.difficulty-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      gameState.difficulty = btn.dataset.difficulty;
    });
  });
  
  // Game buttons
  document.getElementById('random-match-btn').addEventListener('click', startWorldBattle);
  document.getElementById('friend-match-btn').addEventListener('click', openFriendRoomModal);
  document.getElementById('start-game-btn').addEventListener('click', startGame);
  
  // Friend room modal
  document.getElementById('create-room-btn').addEventListener('click', createFriendRoom);
  document.getElementById('join-room-btn').addEventListener('click', showJoinRoomSection);
  document.getElementById('join-room-submit-btn').addEventListener('click', joinFriendRoom);
  document.getElementById('close-modal-btn').addEventListener('click', closeFriendRoomModal);
  document.getElementById('copy-code-btn').addEventListener('click', copyRoomCode);
  
  // Typing input
  document.getElementById('typing-input').addEventListener('input', handleTypingInput);
  document.getElementById('typing-input').addEventListener('keydown', (e) => {
    if (e.key.length === 1) {
      playSound('typing');
    }
  });
  
  // Answer buttons
  document.querySelectorAll('.answer-btn').forEach(btn => {
    btn.addEventListener('click', () => handleAnswer(btn.dataset.answer));
  });
  
  // Navigation buttons
  document.getElementById('view-leaderboard').addEventListener('click', showLeaderboard);
  document.querySelectorAll('#back-to-menu').forEach(btn => {
    btn.addEventListener('click', showMainMenu);
  });
  document.getElementById('play-again').addEventListener('click', showMainMenu);
  document.getElementById('logout-btn').addEventListener('click', logout);
}

async function loadCountries() {
  try {
    const response = await fetch(`${COUNTRIES_API}/all?fields=name,cca2,flags`);
    gameState.countries = await response.json();
  } catch (error) {
    console.error('Failed to load countries:', error);
    document.getElementById('country-suggestions').innerHTML = 
      '<div class="error-text">Could not load countries</div>';
  }
}

async function loadWelcomeLeaderboard() {
  try {
    const response = await fetch(`${API_BASE}/api/leaderboard`);
    const data = await response.json();
    
    const container = document.getElementById('welcome-leaderboard');
    
    // Use today's data, fallback to last 7 days if no data today
    let topCountries = data.today && data.today.length > 0 ? data.today : data.last7days;
    
    if (!topCountries || topCountries.length === 0) {
      container.innerHTML = '<div class="no-data-text">No rankings yet. Be the first to play!</div>';
      return;
    }
    
    // Get top 5
    topCountries = topCountries.slice(0, 5);
    
    container.innerHTML = topCountries.map((country, index) => {
      const rank = index + 1;
      const rankClass = `rank-${rank}`;
      
      return `
        <div class="leaderboard-item">
          <div class="rank-number ${rankClass}">#${rank}</div>
          <img src="https://flagcdn.com/48x36/${country.country_code.toLowerCase()}.png" 
               alt="${country.country_name}" 
               class="country-flag-large"
               onerror="this.src='https://flagcdn.com/48x36/un.png'">
          <div class="country-name-large">${country.country_name}</div>
          <div class="win-rate-large">${country.win_rate}%</div>
        </div>
      `;
    }).join('');
    
    // Auto-refresh every 30 seconds
    setTimeout(loadWelcomeLeaderboard, 30000);
  } catch (error) {
    console.error('Failed to load welcome leaderboard:', error);
    document.getElementById('welcome-leaderboard').innerHTML = 
      '<div class="no-data-text">Unable to load rankings</div>';
  }
}

function handleCountryInput(e) {
  const input = e.target.value.toLowerCase();
  const suggestions = document.getElementById('country-suggestions');
  
  if (input.length < 2) {
    suggestions.style.display = 'none';
    return;
  }
  
  const matches = gameState.countries
    .filter(c => c.name.common.toLowerCase().includes(input))
    .slice(0, 5);
  
  if (matches.length > 0) {
    suggestions.innerHTML = matches.map(c => `
      <div class="country-option" data-code="${c.cca2}" data-name="${c.name.common}">
        <img src="${c.flags.svg}" alt="${c.name.common}" class="flag-icon">
        <span>${c.name.common}</span>
      </div>
    `).join('');
    
    suggestions.style.display = 'block';
    
    // Add click handlers
    suggestions.querySelectorAll('.country-option').forEach(opt => {
      opt.addEventListener('click', () => selectCountry(opt.dataset.code, opt.dataset.name));
    });
  } else {
    suggestions.style.display = 'none';
  }
}

function selectCountry(code, name) {
  gameState.selectedCountry = { code, name };
  document.getElementById('country-input').value = name;
  document.getElementById('country-suggestions').style.display = 'none';
}

function checkExistingUser() {
  const user = localStorage.getItem('neoncrypt_user');
  if (user) {
    gameState.user = JSON.parse(user);
    showMainMenu();
    updateStatus('ready');
  } else {
    showScreen('welcome-screen');
    updateStatus('waiting');
  }
}

async function startWorldBattle() {
  const nickname = document.getElementById('nickname-input').value.trim();
  
  if (!nickname) {
    alert('Please enter a nickname');
    return;
  }
  
  if (!gameState.selectedCountry) {
    alert('Please select your country');
    return;
  }
  
  try {
    // Show matching status
    updateStatus('searching...');
    
    // Check daily limit
    const response = await fetch(`${API_BASE}/api/match/world`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nickname,
        countryCode: gameState.selectedCountry.code,
        countryName: gameState.selectedCountry.name,
        difficulty: gameState.difficulty
      })
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      alert(data.error || 'Failed to start match');
      updateStatus('idle');
      return;
    }
    
    gameState.user = {
      id: data.userId,
      nickname,
      countryCode: gameState.selectedCountry.code,
      countryName: gameState.selectedCountry.name
    };
    localStorage.setItem('neoncrypt_user', JSON.stringify(gameState.user));
    
    // Find match using Firebase
    const matchResult = await MatchingSystem.findMatch(
      data.userId,
      nickname,
      gameState.selectedCountry.code,
      gameState.selectedCountry.name,
      gameState.difficulty
    );
    
    if (matchResult.type === 'player') {
      gameState.matchId = matchResult.matchId;
      gameState.isHost = matchResult.isHost;
      
      // Setup Firebase listeners
      await MatchingSystem.setupGameListeners(matchResult.matchId, matchResult.isHost);
      
      updateStatus('matched!');
    } else {
      updateStatus('vs AI');
    }
    
    gameState.currentMatch = {
      type: 'world',
      difficulty: gameState.difficulty,
      opponent: matchResult.opponent,
      matchId: matchResult.matchId,
      isHost: matchResult.isHost,
      realtime: matchResult.type === 'player'
    };
    
    showScreen('game-screen');
    showMainMenu();
  } catch (error) {
    console.error('Match error:', error);
    alert('Failed to start match. Please try again.');
    updateStatus('idle');
  }
}

// Friend room functions
function generateRoomCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function openFriendRoomModal() {
  const nickname = document.getElementById('nickname-input').value.trim();
  
  if (!nickname) {
    alert('Please enter a nickname');
    return;
  }
  
  if (!gameState.selectedCountry) {
    alert('Please select your country');
    return;
  }
  
  // Save user data
  gameState.user = {
    id: `friend_${Date.now()}`,
    nickname,
    countryCode: gameState.selectedCountry.code,
    countryName: gameState.selectedCountry.name
  };
  localStorage.setItem('neoncrypt_user', JSON.stringify(gameState.user));
  
  // Show modal
  document.getElementById('friend-room-modal').style.display = 'flex';
  document.getElementById('create-room-section').style.display = 'none';
  document.getElementById('join-room-section').style.display = 'none';
  document.querySelector('.room-options').style.display = 'grid';
}

function closeFriendRoomModal() {
  document.getElementById('friend-room-modal').style.display = 'none';
  
  // Cleanup room listener if exists
  if (gameState.roomListener) {
    gameState.roomListener.off();
    gameState.roomListener = null;
  }
}

async function createFriendRoom() {
  if (!database) {
    alert('Firebase not configured. Cannot create friend rooms.');
    return;
  }
  
  const roomCode = generateRoomCode();
  const roomRef = database.ref(`rooms/${roomCode}`);
  
  // Create room
  await roomRef.set({
    code: roomCode,
    host: {
      id: gameState.user.id,
      nickname: gameState.user.nickname,
      country: gameState.user.countryCode
    },
    guest: null,
    status: 'waiting',
    difficulty: gameState.difficulty,
    createdAt: Date.now()
  });
  
  // Show room code
  document.querySelector('.room-options').style.display = 'none';
  document.getElementById('create-room-section').style.display = 'block';
  document.getElementById('room-code-display').value = roomCode;
  
  // Listen for guest joining
  gameState.roomListener = roomRef.on('value', async (snapshot) => {
    const room = snapshot.val();
    
    if (room && room.guest) {
      // Guest joined!
      document.getElementById('room-status').textContent = `${room.guest.nickname} joined! Starting game...`;
      document.getElementById('room-status').style.color = 'var(--neon-green)';
      
      // Remove listener
      roomRef.off();
      gameState.roomListener = null;
      
      // Create game
      const gameRef = database.ref(`games/${roomCode}`);
      await gameRef.set({
        status: 'ready',
        difficulty: room.difficulty,
        player1: {
          id: room.host.id,
          nickname: room.host.nickname,
          country: room.host.country,
          score: 0,
          round: 0,
          ready: false
        },
        player2: {
          id: room.guest.id,
          nickname: room.guest.nickname,
          country: room.guest.country,
          score: 0,
          round: 0,
          ready: false
        },
        createdAt: Date.now()
      });
      
      gameState.currentMatch = {
        type: 'friend',
        difficulty: room.difficulty,
        opponent: {
          type: 'player',
          nickname: room.guest.nickname,
          country: room.guest.country
        },
        matchId: roomCode,
        isHost: true,
        realtime: true
      };
      
      gameState.matchId = roomCode;
      gameState.isHost = true;
      
      // Setup Firebase listeners
      await MatchingSystem.setupGameListeners(roomCode, true);
      
      // Close modal and start game
      closeFriendRoomModal();
      showScreen('game-screen');
      showMainMenu();
      updateStatus('matched!');
    }
  });
}

function showJoinRoomSection() {
  document.querySelector('.room-options').style.display = 'none';
  document.getElementById('join-room-section').style.display = 'block';
  document.getElementById('room-code-input').value = '';
  document.getElementById('room-code-input').focus();
}

async function joinFriendRoom() {
  if (!database) {
    alert('Firebase not configured. Cannot join friend rooms.');
    return;
  }
  
  const roomCode = document.getElementById('room-code-input').value.trim().toUpperCase();
  
  if (roomCode.length !== 6) {
    alert('Please enter a valid 6-character room code');
    return;
  }
  
  const roomRef = database.ref(`rooms/${roomCode}`);
  const snapshot = await roomRef.once('value');
  const room = snapshot.val();
  
  if (!room) {
    alert('Room not found. Please check the code and try again.');
    return;
  }
  
  if (room.status !== 'waiting') {
    alert('This room is no longer available.');
    return;
  }
  
  // Join room
  await roomRef.update({
    guest: {
      id: gameState.user.id,
      nickname: gameState.user.nickname,
      country: gameState.user.countryCode
    },
    status: 'matched'
  });
  
  gameState.currentMatch = {
    type: 'friend',
    difficulty: room.difficulty,
    opponent: {
      type: 'player',
      nickname: room.host.nickname,
      country: room.host.country
    },
    matchId: roomCode,
    isHost: false,
    realtime: true
  };
  
  gameState.matchId = roomCode;
  gameState.isHost = false;
  gameState.difficulty = room.difficulty;
  
  // Wait for game to be created by host
  const gameRef = database.ref(`games/${roomCode}`);
  const gameSnapshot = await new Promise((resolve) => {
    const listener = gameRef.on('value', (snapshot) => {
      if (snapshot.val()) {
        gameRef.off('value', listener);
        resolve(snapshot);
      }
    });
    
    // Timeout after 10 seconds
    setTimeout(() => {
      gameRef.off('value', listener);
      resolve(null);
    }, 10000);
  });
  
  if (!gameSnapshot) {
    alert('Failed to join game. Please try again.');
    return;
  }
  
  // Setup Firebase listeners
  await MatchingSystem.setupGameListeners(roomCode, false);
  
  // Close modal and start game
  closeFriendRoomModal();
  showScreen('game-screen');
  showMainMenu();
  updateStatus('matched!');
}

function copyRoomCode() {
  const codeInput = document.getElementById('room-code-display');
  codeInput.select();
  document.execCommand('copy');
  
  const copyBtn = document.getElementById('copy-code-btn');
  const originalText = copyBtn.innerHTML;
  copyBtn.innerHTML = '<i class="fas fa-check"></i> Copied!';
  copyBtn.style.background = 'rgba(0, 255, 65, 0.2)';
  
  setTimeout(() => {
    copyBtn.innerHTML = originalText;
    copyBtn.style.background = 'rgba(0, 255, 65, 0.1)';
  }, 2000);
}

async function startGame() {
  gameState.currentRound = 0;
  gameState.score = 0;
  gameState.opponentScore = 0;
  gameState.typingStarted = false;
  document.getElementById('game-menu').style.display = 'none';
  document.getElementById('game-play').style.display = 'block';
  updateStatus('playing');
  
  // Set opponent name
  const opponentName = gameState.currentMatch?.opponent?.nickname || 'AI Bot';
  document.getElementById('opponent-name').textContent = opponentName;
  
  // Reset scores display
  document.getElementById('player-score').textContent = '0';
  document.getElementById('opponent-score').textContent = '0';
  
  // Mark player as ready in Firebase
  if (gameState.matchId && gameState.currentMatch?.realtime) {
    await MatchingSystem.updatePlayerData(gameState.matchId, gameState.isHost, {
      ready: true,
      score: 0,
      round: 0
    });
  }
  
  nextRound();
}

function nextRound() {
  const roundsNeeded = { easy: 1, normal: 2, hard: 3 }[gameState.difficulty];
  
  if (gameState.currentRound >= roundsNeeded) {
    endGame(true);
    return;
  }
  
  gameState.currentRound++;
  document.getElementById('round-number').textContent = `Round ${gameState.currentRound}/${roundsNeeded}`;
  updateScoreDisplay();
  
  // Reset typing started flag for this round
  gameState.typingStarted = false;
  
  // Generate random riddle
  const riddle = generateRandomRiddle();
  gameState.currentRiddle = riddle;
  gameState.targetText = riddle.riddle;
  
  // Initialize sentence display with individual characters
  updateSentenceDisplay('');
  
  document.getElementById('typing-input').value = '';
  document.getElementById('typing-input').disabled = false;
  document.getElementById('typing-input').focus();
  
  // Hide question section (will show answers after typing)
  document.getElementById('question-section').style.display = 'none';
  
  // Simulate opponent typing only in AI mode
  if (!gameState.currentMatch?.realtime) {
    simulateOpponentProgress();
  }
}

// Riddle database - typing challenge is the riddle itself (300 riddles)
function generateRandomRiddle() {
  const riddles = [
    // Classic Riddles (50)
    {riddle:"I speak without a mouth and hear without ears. I have no body, but I come alive with wind. What am I?",answers:["Echo","Shadow","Mirror","Dream"],correct:"Echo"},
    {riddle:"The more you take, the more you leave behind. What am I?",answers:["Footsteps","Time","Memory","Breath"],correct:"Footsteps"},
    {riddle:"I have cities, but no houses. I have mountains, but no trees. I have water, but no fish. What am I?",answers:["Map","Globe","Atlas","Book"],correct:"Map"},
    {riddle:"What has keys but no locks, space but no room, and you can enter but can't go inside?",answers:["Keyboard","Piano","House","Computer"],correct:"Keyboard"},
    {riddle:"I'm tall when I'm young, and I'm short when I'm old. What am I?",answers:["Candle","Tree","Person","Building"],correct:"Candle"},
    {riddle:"What can travel around the world while staying in a corner?",answers:["Stamp","Letter","Email","Postcard"],correct:"Stamp"},
    {riddle:"What has a head and a tail but no body?",answers:["Coin","Snake","Arrow","Comet"],correct:"Coin"},
    {riddle:"What gets wet while drying?",answers:["Towel","Sponge","Paper","Cloth"],correct:"Towel"},
    {riddle:"I have branches, but no fruit, trunk, or leaves. What am I?",answers:["Bank","River","Tree","Road"],correct:"Bank"},
    {riddle:"What can fill a room but takes up no space?",answers:["Light","Air","Sound","Darkness"],correct:"Light"},
    {riddle:"What runs but never walks, has a mouth but never talks, has a bed but never sleeps?",answers:["River","Clock","Road","Wind"],correct:"River"},
    {riddle:"The more of this there is, the less you see. What is it?",answers:["Darkness","Fog","Smoke","Shadow"],correct:"Darkness"},
    {riddle:"What has hands but cannot clap?",answers:["Clock","Doll","Statue","Glove"],correct:"Clock"},
    {riddle:"I'm light as a feather, yet the strongest person can't hold me for five minutes. What am I?",answers:["Breath","Air","Thought","Time"],correct:"Breath"},
    {riddle:"What begins with T, ends with T, and has T in it?",answers:["Teapot","Text","Tent","Treat"],correct:"Teapot"},
    {riddle:"What has a neck but no head?",answers:["Bottle","Shirt","Vase","Guitar"],correct:"Bottle"},
    {riddle:"What can you catch but never throw?",answers:["Cold","Ball","Fish","Bird"],correct:"Cold"},
    {riddle:"What has many teeth but cannot bite?",answers:["Comb","Saw","Zipper","Gear"],correct:"Comb"},
    {riddle:"What goes up but never comes down?",answers:["Age","Balloon","Smoke","Bird"],correct:"Age"},
    {riddle:"What has a ring but no finger?",answers:["Phone","Door","Bell","Circle"],correct:"Phone"},
    {riddle:"What has words but never speaks?",answers:["Book","Sign","Letter","Screen"],correct:"Book"},
    {riddle:"What has legs but doesn't walk?",answers:["Table","Pants","Spider","Chair"],correct:"Table"},
    {riddle:"What has one eye but cannot see?",answers:["Needle","Potato","Storm","Camera"],correct:"Needle"},
    {riddle:"What has a thumb and four fingers but is not alive?",answers:["Glove","Hand","Statue","Robot"],correct:"Glove"},
    {riddle:"What goes through cities and fields but never moves?",answers:["Road","River","Wind","Train"],correct:"Road"},
    {riddle:"What can you break without touching it?",answers:["Promise","Glass","Egg","Heart"],correct:"Promise"},
    {riddle:"What has four wheels and flies?",answers:["Garbage truck","Airplane","Helicopter","Car"],correct:"Garbage truck"},
    {riddle:"What kind of room has no doors or windows?",answers:["Mushroom","Bathroom","Bedroom","Classroom"],correct:"Mushroom"},
    {riddle:"What is always in front of you but can't be seen?",answers:["Future","Air","Ghost","Shadow"],correct:"Future"},
    {riddle:"What belongs to you but others use it more than you?",answers:["Name","Phone","Car","House"],correct:"Name"},
    {riddle:"What month has 28 days?",answers:["All of them","February","January","March"],correct:"All of them"},
    {riddle:"What question can you never answer yes to?",answers:["Are you asleep?","Are you awake?","Are you alive?","Are you dead?"],correct:"Are you asleep?"},
    {riddle:"What is full of holes but still holds water?",answers:["Sponge","Net","Bucket","Cup"],correct:"Sponge"},
    {riddle:"What gets bigger the more you take away?",answers:["Hole","Debt","Problem","Distance"],correct:"Hole"},
    {riddle:"What has a bottom at the top?",answers:["Leg","Mountain","Bottle","Hat"],correct:"Leg"},
    {riddle:"What comes once in a minute, twice in a moment, but never in a thousand years?",answers:["Letter M","Time","Second","Minute"],correct:"Letter M"},
    {riddle:"What building has the most stories?",answers:["Library","Skyscraper","Hotel","School"],correct:"Library"},
    {riddle:"What is so fragile that saying its name breaks it?",answers:["Silence","Glass","Promise","Peace"],correct:"Silence"},
    {riddle:"What can you hold in your left hand but not in your right?",answers:["Right elbow","Left hand","Ball","Book"],correct:"Right elbow"},
    {riddle:"What has thirteen hearts but no other organs?",answers:["Deck of cards","Monster","Plant","Body"],correct:"Deck of cards"},
    {riddle:"What has a face and two hands but no arms or legs?",answers:["Clock","Doll","Statue","Robot"],correct:"Clock"},
    {riddle:"What tastes better than it smells?",answers:["Tongue","Food","Coffee","Perfume"],correct:"Tongue"},
    {riddle:"What kind of band never plays music?",answers:["Rubber band","Rock band","Jazz band","Metal band"],correct:"Rubber band"},
    {riddle:"What kind of tree can you carry in your hand?",answers:["Palm","Oak","Pine","Maple"],correct:"Palm"},
    {riddle:"What has a head, a tail, is brown, and has no legs?",answers:["Penny","Snake","Dog","Rope"],correct:"Penny"},
    {riddle:"What has four legs in the morning, two in the afternoon, and three in the evening?",answers:["Human","Animal","Table","Chair"],correct:"Human"},
    {riddle:"What flies without wings?",answers:["Time","Bird","Plane","Insect"],correct:"Time"},
    {riddle:"What can be cracked, made, told, and played?",answers:["Joke","Egg","Code","Game"],correct:"Joke"},
    {riddle:"What has a spine but no bones?",answers:["Book","Fish","Cactus","Snake"],correct:"Book"},
    {riddle:"What invention lets you look right through a wall?",answers:["Window","Mirror","Door","Camera"],correct:"Window"},
    
    // Logic & Wordplay (50)
    {riddle:"What word becomes shorter when you add two letters to it?",answers:["Short","Long","Word","Letter"],correct:"Short"},
    {riddle:"What five-letter word becomes shorter when you add two letters?",answers:["Short","Sweet","Thick","Round"],correct:"Short"},
    {riddle:"What starts with E, ends with E, but only has one letter?",answers:["Envelope","Eye","Edge","Eagle"],correct:"Envelope"},
    {riddle:"What word is spelled wrong in every dictionary?",answers:["Wrong","Dictionary","Incorrectly","Error"],correct:"Wrong"},
    {riddle:"What can run but never walks, has a mouth but never talks?",answers:["River","Machine","Clock","Robot"],correct:"River"},
    {riddle:"What goes up and down but doesn't move?",answers:["Stairs","Elevator","Temperature","Price"],correct:"Stairs"},
    {riddle:"What is black when you buy it, red when you use it, and gray when you throw it away?",answers:["Charcoal","Coal","Wood","Ash"],correct:"Charcoal"},
    {riddle:"What is cut on a table, but is never eaten?",answers:["Deck of cards","Paper","Cloth","Wood"],correct:"Deck of cards"},
    {riddle:"What has a golden head and a golden tail but no body?",answers:["Gold coin","Snake","Fish","Dragon"],correct:"Gold coin"},
    {riddle:"What comes down but never goes up?",answers:["Rain","Stairs","Elevator","Bird"],correct:"Rain"},
    {riddle:"What has cities, mountains, and rivers but no people?",answers:["Map","Book","Movie","Game"],correct:"Map"},
    {riddle:"What can you put in a bucket to make it lighter?",answers:["Hole","Air","Water","Nothing"],correct:"Hole"},
    {riddle:"What occurs once in every minute, twice in every moment, yet never in a thousand years?",answers:["Letter M","Time","Second","Hour"],correct:"Letter M"},
    {riddle:"What word looks the same upside down and backwards?",answers:["SWIMS","NOON","MOM","WOW"],correct:"SWIMS"},
    {riddle:"What 7 letter word has hundreds of letters in it?",answers:["Mailbox","Alphabet","Letters","Postman"],correct:"Mailbox"},
    {riddle:"What gets wetter as it dries?",answers:["Towel","Sponge","Hair","Skin"],correct:"Towel"},
    {riddle:"What kind of coat can only be put on when wet?",answers:["Paint","Rain coat","Fur coat","Lab coat"],correct:"Paint"},
    {riddle:"What begins with an E and only contains one letter?",answers:["Envelope","Email","Eye","Edge"],correct:"Envelope"},
    {riddle:"What is always coming but never arrives?",answers:["Tomorrow","Train","Bus","Future"],correct:"Tomorrow"},
    {riddle:"What has one head, one foot, and four legs?",answers:["Bed","Table","Chair","Animal"],correct:"Bed"},
    {riddle:"What is harder to catch the faster you run?",answers:["Breath","Ball","Time","Wind"],correct:"Breath"},
    {riddle:"What can be seen once in a minute, twice in a moment, and never in a thousand years?",answers:["Letter M","Time","Second","Minute"],correct:"Letter M"},
    {riddle:"What is so delicate that even mentioning it breaks it?",answers:["Silence","Glass","Heart","Peace"],correct:"Silence"},
    {riddle:"What kind of ship has two mates but no captain?",answers:["Relationship","Friendship","Spaceship","Warship"],correct:"Relationship"},
    {riddle:"What can travel all around the world without leaving its corner?",answers:["Stamp","Map","Book","Letter"],correct:"Stamp"},
    {riddle:"What has many keys but can't open a single lock?",answers:["Piano","Keyboard","Map","Bunch"],correct:"Piano"},
    {riddle:"What is at the end of a rainbow?",answers:["Letter W","Pot of gold","Colors","Sky"],correct:"Letter W"},
    {riddle:"What loses its head in the morning but gets it back at night?",answers:["Pillow","Person","Sun","Moon"],correct:"Pillow"},
    {riddle:"What kind of cheese is made backward?",answers:["Edam","Cheddar","Swiss","Gouda"],correct:"Edam"},
    {riddle:"What goes all the way around the world but stays in a corner?",answers:["Stamp","Wind","Light","Sound"],correct:"Stamp"},
    {riddle:"What has six faces, but does not wear makeup, has twenty-one eyes, but cannot see?",answers:["Die","Dice","Cube","Box"],correct:"Die"},
    {riddle:"What must be broken before you can use it?",answers:["Egg","Seal","Code","Lock"],correct:"Egg"},
    {riddle:"What can you serve but never eat?",answers:["Tennis ball","Food","Drink","Plate"],correct:"Tennis ball"},
    {riddle:"What has three feet but cannot walk?",answers:["Yardstick","Table","Stool","Tripod"],correct:"Yardstick"},
    {riddle:"What kind of table has no legs?",answers:["Timetable","Coffee table","Dinner table","Pool table"],correct:"Timetable"},
    {riddle:"What kind of stones are never found in the ocean?",answers:["Dry","Wet","Small","Big"],correct:"Dry"},
    {riddle:"What kind of dress can never be worn?",answers:["Address","Wedding dress","Summer dress","Evening dress"],correct:"Address"},
    {riddle:"What kind of cup doesn't hold water?",answers:["Cupcake","Teacup","Coffee cup","Paper cup"],correct:"Cupcake"},
    {riddle:"What kind of coat is best put on wet?",answers:["Paint","Raincoat","Winter coat","Lab coat"],correct:"Paint"},
    {riddle:"What has bark but no bite?",answers:["Tree","Dog","Wolf","Sound"],correct:"Tree"},
    {riddle:"What gets sharper the more you use it?",answers:["Brain","Knife","Pencil","Blade"],correct:"Brain"},
    {riddle:"What kind of band never plays any music?",answers:["Rubber band","Rock band","Jazz band","Metal band"],correct:"Rubber band"},
    {riddle:"What starts with a P, ends with an E, and has thousands of letters?",answers:["Post office","Plate","Phone","Page"],correct:"Post office"},
    {riddle:"What has no beginning, end, or middle?",answers:["Doughnut","Circle","Ring","Ball"],correct:"Doughnut"},
    {riddle:"What has an eye but can not see?",answers:["Needle","Potato","Storm","Fish"],correct:"Needle"},
    {riddle:"What goes around and around the wood but never goes into the wood?",answers:["Bark","Rope","Ring","Chain"],correct:"Bark"},
    {riddle:"What travels faster: heat or cold?",answers:["Heat","Cold","Light","Sound"],correct:"Heat"},
    {riddle:"What kind of nut has no shell?",answers:["Doughnut","Walnut","Peanut","Chestnut"],correct:"Doughnut"},
    {riddle:"What kind of dog never bites?",answers:["Hot dog","Puppy","Guard dog","Pet dog"],correct:"Hot dog"},
    {riddle:"What kind of room has no windows or doors?",answers:["Mushroom","Bathroom","Bedroom","Living room"],correct:"Mushroom"},
    
    // Nature & Animals (50)
    {riddle:"What has roots that nobody sees, is taller than trees, up up it goes, yet never grows?",answers:["Mountain","Tree","Building","Tower"],correct:"Mountain"},
    {riddle:"What kind of bird can lift the most weight?",answers:["Crane","Eagle","Hawk","Parrot"],correct:"Crane"},
    {riddle:"What has a bark but no bite?",answers:["Tree","Dog","Wolf","Fox"],correct:"Tree"},
    {riddle:"What jumps when it walks and sits when it stands?",answers:["Kangaroo","Frog","Rabbit","Cricket"],correct:"Kangaroo"},
    {riddle:"What animal walks on four legs in the morning, two in the afternoon, and three at night?",answers:["Human","Dog","Cat","Bear"],correct:"Human"},
    {riddle:"What is black and white and red all over?",answers:["Newspaper","Zebra","Panda","Penguin"],correct:"Newspaper"},
    {riddle:"What animal can jump higher than a house?",answers:["All animals","Kangaroo","Frog","Rabbit"],correct:"All animals"},
    {riddle:"What bird can lift the heaviest weights?",answers:["Crane","Eagle","Condor","Vulture"],correct:"Crane"},
    {riddle:"What has ears but cannot hear?",answers:["Corn","Rabbit","Wall","Cup"],correct:"Corn"},
    {riddle:"What kind of tree can you hold in your hand?",answers:["Palm","Oak","Pine","Maple"],correct:"Palm"},
    {riddle:"What creature walks on four legs in the morning, two at noon, and three in the evening?",answers:["Human","Dog","Cat","Horse"],correct:"Human"},
    {riddle:"What has wings but cannot fly, is enclosed but can open up?",answers:["Door","Window","Box","Book"],correct:"Door"},
    {riddle:"What blooms year-round but never grows?",answers:["Calendar","Painting","Photo","Picture"],correct:"Calendar"},
    {riddle:"What kind of flower is on your face?",answers:["Tulips","Rose","Daisy","Lily"],correct:"Tulips"},
    {riddle:"What kind of apple isn't an apple?",answers:["Pineapple","Red apple","Green apple","Golden apple"],correct:"Pineapple"},
    {riddle:"What kind of coat is always wet when you put it on?",answers:["Paint","Raincoat","Fur coat","Winter coat"],correct:"Paint"},
    {riddle:"What has a head and tail but no body?",answers:["Coin","Snake","Fish","Worm"],correct:"Coin"},
    {riddle:"What flies when it's born, lies when it's alive, and runs when it's dead?",answers:["Snowflake","Bird","Insect","Leaf"],correct:"Snowflake"},
    {riddle:"What lives in winter, dies in summer, and grows with its roots upward?",answers:["Icicle","Tree","Plant","Snowman"],correct:"Icicle"},
    {riddle:"What runs around a whole yard without moving?",answers:["Fence","Dog","Child","Wind"],correct:"Fence"},
    {riddle:"What kind of lion never roars?",answers:["Dandelion","Dead lion","Stone lion","Baby lion"],correct:"Dandelion"},
    {riddle:"What has many rings but no fingers?",answers:["Tree","Phone","Bell","Saturn"],correct:"Tree"},
    {riddle:"What grows down while it grows up?",answers:["Goose","Plant","Tree","Child"],correct:"Goose"},
    {riddle:"What kind of coat can be put on only when wet?",answers:["Paint","Raincoat","Fur coat","Lab coat"],correct:"Paint"},
    {riddle:"What has leaves but is not a tree?",answers:["Book","Plant","Table","Door"],correct:"Book"},
    {riddle:"What comes out at night without being called and is lost in the day without being stolen?",answers:["Stars","Moon","Owl","Bat"],correct:"Stars"},
    {riddle:"What falls but never hits the ground?",answers:["Temperature","Rain","Snow","Leaf"],correct:"Temperature"},
    {riddle:"What is white when it's dirty and black when it's clean?",answers:["Chalkboard","Snow","Paper","Cloth"],correct:"Chalkboard"},
    {riddle:"What kind of nut has a hole?",answers:["Doughnut","Walnut","Peanut","Coconut"],correct:"Doughnut"},
    {riddle:"What kind of stone can never be found in an ocean?",answers:["Dry","Precious","Heavy","Small"],correct:"Dry"},
    {riddle:"What part of the chicken has the most feathers?",answers:["Outside","Wing","Tail","Head"],correct:"Outside"},
    {riddle:"What can honk without using a horn?",answers:["Goose","Car","Bike","Duck"],correct:"Goose"},
    {riddle:"What kind of fish chases a mouse?",answers:["Catfish","Shark","Goldfish","Bass"],correct:"Catfish"},
    {riddle:"What bird is always sad?",answers:["Bluebird","Crow","Dove","Sparrow"],correct:"Bluebird"},
    {riddle:"What kind of dog keeps the best time?",answers:["Watchdog","Bloodhound","Shepherd","Pointer"],correct:"Watchdog"},
    {riddle:"What kind of ant is good at math?",answers:["Accountant","Fire ant","Carpenter ant","Army ant"],correct:"Accountant"},
    {riddle:"What has four eyes but can't see?",answers:["Mississippi","Spider","Fly","Potato"],correct:"Mississippi"},
    {riddle:"What grows when it eats but dies when it drinks?",answers:["Fire","Plant","Animal","Tree"],correct:"Fire"},
    {riddle:"What is the longest word in the dictionary?",answers:["Smiles","Dictionary","Alphabet","Encyclopedia"],correct:"Smiles"},
    {riddle:"What kind of room has no walls?",answers:["Mushroom","Bathroom","Bedroom","Classroom"],correct:"Mushroom"},
    {riddle:"What animal keeps the best time?",answers:["Watchdog","Cat","Horse","Bird"],correct:"Watchdog"},
    {riddle:"What kind of fish is the most valuable?",answers:["Goldfish","Tuna","Salmon","Bass"],correct:"Goldfish"},
    {riddle:"What has a bottom at the top of it?",answers:["Leg","Mountain","Tree","Building"],correct:"Leg"},
    {riddle:"What kind of vegetable is angry?",answers:["Steamed","Carrot","Potato","Tomato"],correct:"Steamed"},
    {riddle:"What kind of tree can you carry in your pocket?",answers:["Palm","Oak","Pine","Maple"],correct:"Palm"},
    {riddle:"What has four legs but can't walk?",answers:["Table","Chair","Bed","Desk"],correct:"Table"},
    {riddle:"What kind of pool can't you swim in?",answers:["Car pool","Swimming pool","Tide pool","Gene pool"],correct:"Car pool"},
    {riddle:"What bird can write?",answers:["Pen-guin","Parrot","Crow","Dove"],correct:"Pen-guin"},
    {riddle:"What has teeth but cannot chew?",answers:["Comb","Saw","Gear","Zipper"],correct:"Comb"},
    {riddle:"What kind of coat has no sleeves, no buttons, no pockets, and won't keep you warm?",answers:["Paint","Fur coat","Rain coat","Lab coat"],correct:"Paint"},
    
    // Objects & Everyday Items (50)
    {riddle:"What has a neck but no head, and wears a cap?",answers:["Bottle","Person","Lamp","Vase"],correct:"Bottle"},
    {riddle:"What has four wheels and flies but is not an aircraft?",answers:["Garbage truck","Car","Bike","Cart"],correct:"Garbage truck"},
    {riddle:"What can you catch but not throw?",answers:["Cold","Ball","Fish","Bird"],correct:"Cold"},
    {riddle:"What has a tongue but cannot talk?",answers:["Shoe","Bell","Wagon","Flame"],correct:"Shoe"},
    {riddle:"What has a bed but never sleeps, can run but never walks, has a bank but no money?",answers:["River","Hotel","House","Park"],correct:"River"},
    {riddle:"What can be opened but never closed?",answers:["Egg","Door","Window","Box"],correct:"Egg"},
    {riddle:"What goes up when rain comes down?",answers:["Umbrella","Balloon","Kite","Bird"],correct:"Umbrella"},
    {riddle:"What has a foot but no legs?",answers:["Ruler","Table","Chair","Bed"],correct:"Ruler"},
    {riddle:"What has teeth but no mouth?",answers:["Saw","Comb","Gear","Zipper"],correct:"Saw"},
    {riddle:"What gets broken without being held?",answers:["Promise","Glass","Egg","Heart"],correct:"Promise"},
    {riddle:"What can you make that you can't see?",answers:["Noise","Sound","Music","Shadow"],correct:"Noise"},
    {riddle:"What has a handle but no door?",answers:["Cup","Bag","Suitcase","Pot"],correct:"Cup"},
    {riddle:"What invention lets you look through walls?",answers:["Window","Mirror","Door","Camera"],correct:"Window"},
    {riddle:"What is always on its way but never arrives?",answers:["Tomorrow","Train","Bus","Future"],correct:"Tomorrow"},
    {riddle:"What is full of keys but can't open any door?",answers:["Piano","Keyboard","Map","Ring"],correct:"Piano"},
    {riddle:"What kind of key opens a banana?",answers:["Monkey","House key","Car key","Piano key"],correct:"Monkey"},
    {riddle:"What kind of ship never sinks?",answers:["Friendship","Warship","Spaceship","Cruise ship"],correct:"Friendship"},
    {riddle:"What can you find in the middle of nowhere?",answers:["Letter H","Nothing","Desert","Ocean"],correct:"Letter H"},
    {riddle:"What comes up when rain comes down?",answers:["Umbrella","Sun","Rainbow","Clouds"],correct:"Umbrella"},
    {riddle:"What runs around the yard without moving?",answers:["Fence","Dog","Child","Wind"],correct:"Fence"},
    {riddle:"What gets sharper the more you use it?",answers:["Brain","Knife","Pencil","Sword"],correct:"Brain"},
    {riddle:"What kind of ship has no captain?",answers:["Friendship","Warship","Cruise ship","Cargo ship"],correct:"Friendship"},
    {riddle:"What is bought by the yard and worn by the foot?",answers:["Carpet","Fabric","Rope","Ribbon"],correct:"Carpet"},
    {riddle:"What always falls without getting hurt?",answers:["Rain","Snow","Leaf","Stone"],correct:"Rain"},
    {riddle:"What has a single eye but cannot see?",answers:["Needle","Camera","Storm","Potato"],correct:"Needle"},
    {riddle:"What can clap without hands?",answers:["Thunder","Person","Door","Bird"],correct:"Thunder"},
    {riddle:"What has lots of eyes but can't see?",answers:["Potato","Spider","Fly","Peacock"],correct:"Potato"},
    {riddle:"What kind of key is hard to turn?",answers:["Donkey","Door key","Car key","Piano key"],correct:"Donkey"},
    {riddle:"What has four fingers and a thumb but isn't alive?",answers:["Glove","Hand","Robot","Statue"],correct:"Glove"},
    {riddle:"What has a cap but no head?",answers:["Bottle","Person","Mushroom","Pen"],correct:"Bottle"},
    {riddle:"What kind of room has no floor, ceiling, windows, or doors?",answers:["Mushroom","Bathroom","Bedroom","Classroom"],correct:"Mushroom"},
    {riddle:"What has one horn and gives milk?",answers:["Milk truck","Unicorn","Cow","Goat"],correct:"Milk truck"},
    {riddle:"What has words but never speaks?",answers:["Book","Sign","Screen","Letter"],correct:"Book"},
    {riddle:"What has pages but isn't a book, has a spine but isn't an animal?",answers:["Calendar","Magazine","Notebook","Album"],correct:"Calendar"},
    {riddle:"What kind of coat can you put on only when it's wet?",answers:["Paint","Raincoat","Fur coat","Winter coat"],correct:"Paint"},
    {riddle:"What is black when clean and white when dirty?",answers:["Chalkboard","Paper","Cloth","Wall"],correct:"Chalkboard"},
    {riddle:"What has arms but cannot hug?",answers:["Chair","Shirt","Clock","Tree"],correct:"Chair"},
    {riddle:"What stands on one leg with its heart in its head?",answers:["Cabbage","Flower","Lamp","Person"],correct:"Cabbage"},
    {riddle:"What can wave but has no hands?",answers:["Flag","Ocean","Person","Tree"],correct:"Flag"},
    {riddle:"What has no life but can die?",answers:["Battery","Plant","Machine","Candle"],correct:"Battery"},
    {riddle:"What can be hot or cold, but is always measured in degrees?",answers:["Temperature","Weather","Angle","Oven"],correct:"Temperature"},
    {riddle:"What has numbers on its face but can't count?",answers:["Clock","Calculator","Phone","Computer"],correct:"Clock"},
    {riddle:"What goes up and never comes down?",answers:["Age","Balloon","Smoke","Price"],correct:"Age"},
    {riddle:"What kind of bow can't be tied?",answers:["Rainbow","Hair bow","Gift bow","Bow tie"],correct:"Rainbow"},
    {riddle:"What kind of shoes do spies wear?",answers:["Sneakers","Boots","Sandals","Loafers"],correct:"Sneakers"},
    {riddle:"What kind of cup can't hold water?",answers:["Cupcake","Teacup","Coffee cup","Paper cup"],correct:"Cupcake"},
    {riddle:"What kind of nail does a carpenter try to avoid?",answers:["Thumbnail","Iron nail","Rusty nail","Loose nail"],correct:"Thumbnail"},
    {riddle:"What kind of coat has the most warmth?",answers:["Paint","Winter coat","Fur coat","Rain coat"],correct:"Paint"},
    {riddle:"What kind of street does a ghost like best?",answers:["Dead end","Main street","One way","Highway"],correct:"Dead end"},
    {riddle:"What kind of match won't light?",answers:["Tennis match","Boxing match","Wrestling match","Soccer match"],correct:"Tennis match"},
    
    // Math & Numbers (50)
    {riddle:"What number has all letters in alphabetical order?",answers:["Forty","Twenty","Thirty","Fifty"],correct:"Forty"},
    {riddle:"What is the only number that has letters in alphabetical order?",answers:["Forty","Fifty","Sixty","Eighty"],correct:"Forty"},
    {riddle:"What three numbers give the same result when added or multiplied?",answers:["1, 2, 3","2, 3, 4","1, 1, 1","0, 1, 2"],correct:"1, 2, 3"},
    {riddle:"What number do you get when you multiply all the numbers on a telephone dial?",answers:["Zero","One","Hundred","Thousand"],correct:"Zero"},
    {riddle:"If you have me, you want to share me. If you share me, you don't have me. What am I?",answers:["Secret","Money","Food","Time"],correct:"Secret"},
    {riddle:"What occurs twice in a week, once in a year, but never in a day?",answers:["Letter E","Monday","Season","Holiday"],correct:"Letter E"},
    {riddle:"What comes after a million, billion, and trillion?",answers:["Quadrillion","Zillion","Infinity","Gazillion"],correct:"Quadrillion"},
    {riddle:"What number is twice the sum of its digits?",answers:["18","24","36","48"],correct:"18"},
    {riddle:"If two is company and three is a crowd, what are four and five?",answers:["Nine","Seven","Many","Group"],correct:"Nine"},
    {riddle:"What three positive numbers give the same answer when multiplied and added together?",answers:["1, 2, 3","2, 2, 2","1, 1, 2","2, 3, 4"],correct:"1, 2, 3"},
    {riddle:"What digit can you subtract from nine to get ten?",answers:["S from SIX","One","Two","Three"],correct:"S from SIX"},
    {riddle:"What is the smallest number that increases by 12 when it is flipped upside down?",answers:["86","68","96","69"],correct:"86"},
    {riddle:"What number is half of two plus two?",answers:["Three","Two","Four","One"],correct:"Three"},
    {riddle:"What mathematical symbol can be placed between 5 and 9 to get a number greater than 5 and less than 9?",answers:["Decimal point","Plus","Minus","Multiply"],correct:"Decimal point"},
    {riddle:"What is greater than God, more evil than the devil, the poor have it, the rich need it?",answers:["Nothing","Money","Power","Love"],correct:"Nothing"},
    {riddle:"Using only addition, how do you add eight 8s to get 1000?",answers:["888+88+8+8+8","800+200","500+500","Many ways"],correct:"888+88+8+8+8"},
    {riddle:"What comes once in a minute, twice in a moment, but never in a hundred years?",answers:["Letter M","Time","Second","Hour"],correct:"Letter M"},
    {riddle:"What has thousands of ears but cannot hear?",answers:["Cornfield","Concert","Crowd","Stadium"],correct:"Cornfield"},
    {riddle:"What has six faces but does not wear makeup?",answers:["Die","Cube","Box","Clock"],correct:"Die"},
    {riddle:"What has 88 keys but can't open a single door?",answers:["Piano","Computer","Keyboard","Bunch"],correct:"Piano"},
    {riddle:"What occurs four times in every week, twice in every month, and once in a year?",answers:["Letter E","Day","Night","Season"],correct:"Letter E"},
    {riddle:"If you multiply this number by any other number, the answer will always be the same. What number?",answers:["Zero","One","Ten","Infinity"],correct:"Zero"},
    {riddle:"What is the next number in the sequence: 2, 3, 5, 9, 17?",answers:["33","25","34","32"],correct:"33"},
    {riddle:"What is the only even prime number?",answers:["Two","Four","Six","Eight"],correct:"Two"},
    {riddle:"How many sides does a circle have?",answers:["Two","None","One","Infinite"],correct:"Two"},
    {riddle:"What five-digit number has the following: First digit is 1/3 of the second, third is sum of first two, fourth is 3 times second?",answers:["13458","12345","13579","14589"],correct:"13458"},
    {riddle:"What can you add to nine to make it six?",answers:["Letter S","Three","Nothing","Zero"],correct:"Letter S"},
    {riddle:"What is the value of 1/2 of 2/3 of 3/4 of 4/5 of 5/6 of 6/7 of 7/8 of 8/9 of 9/10 of 1000?",answers:["100","500","250","200"],correct:"100"},
    {riddle:"What single-digit number should be written in the space to make the following equation correct: 9 _ 7 = 10?",answers:["- and 1/","+ and -","/","x"],correct:"- and 1/"},
    {riddle:"What has one hundred heads and one hundred tails?",answers:["100 coins","Monster","Hydra","Dragon"],correct:"100 coins"},
    {riddle:"When things go wrong, what can you always count on?",answers:["Fingers","Friends","Family","Money"],correct:"Fingers"},
    {riddle:"What is the greatest worldwide use of cowhide?",answers:["Hold cows","Leather","Shoes","Bags"],correct:"Hold cows"},
    {riddle:"What is it that if you have, you want to share it, but if you share, you don't have?",answers:["Secret","Money","Food","Love"],correct:"Secret"},
    {riddle:"What grows larger the more you take away?",answers:["Hole","Debt","Problem","Distance"],correct:"Hole"},
    {riddle:"What can fill an entire room without taking up space?",answers:["Light","Air","Sound","Heat"],correct:"Light"},
    {riddle:"What has ten letters and starts with gas?",answers:["Automobile","Motorcycle","Gasoline","Gasolina"],correct:"Automobile"},
    {riddle:"What word of five letters has one left when two are removed?",answers:["Stone","Money","Honey","Phone"],correct:"Stone"},
    {riddle:"What 8 letter word has kst in middle, in beginning, and at the end?",answers:["Inkstand","Keystone","Inkstone","Kickstart"],correct:"Inkstand"},
    {riddle:"What word is pronounced the same if you take away four of its five letters?",answers:["Queue","Quiet","Quick","Queen"],correct:"Queue"},
    {riddle:"What is always running but never gets tired?",answers:["Water","Clock","River","Engine"],correct:"Water"},
    {riddle:"What has legs but doesn't walk?",answers:["Table","Pants","Spider","Chair"],correct:"Table"},
    {riddle:"What can go up a chimney down, but can't go down a chimney up?",answers:["Umbrella","Santa","Smoke","Bird"],correct:"Umbrella"},
    {riddle:"What is full of holes but still holds a lot of weight?",answers:["Net","Sponge","Bridge","Mesh"],correct:"Net"},
    {riddle:"What is it that no man wants, but no man wants to lose?",answers:["Lawsuit","Job","Fight","Argument"],correct:"Lawsuit"},
    {riddle:"What belongs to you but is used more by others?",answers:["Name","Car","Phone","House"],correct:"Name"},
    {riddle:"What can you keep after giving it to someone?",answers:["Word","Gift","Promise","Love"],correct:"Word"},
    {riddle:"What kind of robbery is not dangerous?",answers:["Daylight robbery","Bank robbery","Armed robbery","Street robbery"],correct:"Daylight robbery"},
    {riddle:"What is the longest word in the English language?",answers:["Smiles","Alphabet","Dictionary","Encyclopedia"],correct:"Smiles"},
    {riddle:"What word has three consecutive double letters?",answers:["Bookkeeper","Committee","Tennessee","Mississippi"],correct:"Bookkeeper"},
    {riddle:"What belongs to you but other people use it more than you?",answers:["Name","Phone","Car","Time"],correct:"Name"}
  ];
  
  return riddles[Math.floor(Math.random() * riddles.length)];
}

// Update sentence display with colored characters
function updateSentenceDisplay(userInput) {
  const target = gameState.targetText;
  const display = document.getElementById('sentence-display');
  
  let html = '';
  
  for (let i = 0; i < target.length; i++) {
    const char = target[i];
    
    if (i < userInput.length) {
      // User has typed this character
      if (userInput[i] === char) {
        // Correct character
        html += `<span class="char-correct">${char}</span>`;
      } else {
        // Incorrect character
        html += `<span class="char-incorrect">${char}</span>`;
      }
    } else {
      // User hasn't typed this character yet
      html += `<span class="char-pending">${char}</span>`;
    }
  }
  
  display.innerHTML = html;
}

async function handleTypingInput(e) {
  const input = e.target.value;
  const target = gameState.targetText;
  
  // Start timer on first character typed
  if (!gameState.typingStarted && input.length === 1) {
    gameState.typingStarted = true;
    startTimer();
  }
  
  // Update display with colors
  updateSentenceDisplay(input);
  
  // Check if input matches target (play error sound only on new error)
  if (input.length > 0) {
    const lastChar = input[input.length - 1];
    const targetChar = target[input.length - 1];
    
    if (lastChar !== targetChar) {
      playSound('wrong');
    }
  }
  
  // If complete and correct
  if (input === target) {
    playSound('correct');
    gameState.score += 10;
    updateScoreDisplay();
    e.target.disabled = true;
    
    // Update Firebase
    if (gameState.matchId && gameState.currentMatch?.realtime) {
      await MatchingSystem.updatePlayerData(gameState.matchId, gameState.isHost, {
        score: gameState.score
      });
    }
    
    showQuestion();
  }
}

function showQuestion() {
  const questionSection = document.getElementById('question-section');
  questionSection.style.display = 'block';
  
  // Use the current riddle's answers
  const riddle = gameState.currentRiddle;
  
  // Show "Select your answer:" as the question prompt
  document.getElementById('question-text').textContent = "Select your answer:";
  
  const buttons = document.querySelectorAll('.answer-btn');
  riddle.answers.forEach((answer, i) => {
    if (buttons[i]) {
      buttons[i].textContent = answer;
      buttons[i].dataset.answer = answer;
      buttons[i].style.display = 'block';
    }
  });
  
  // Hide extra buttons if less than 4 answers
  for (let i = riddle.answers.length; i < 4; i++) {
    if (buttons[i]) buttons[i].style.display = 'none';
  }
}

async function handleAnswer(answer) {
  if (answer === gameState.currentRiddle.correct) {
    playSound('correct');
    gameState.score += 5;
    updateScoreDisplay();
    
    // Update Firebase
    if (gameState.matchId && gameState.currentMatch?.realtime) {
      await MatchingSystem.updatePlayerData(gameState.matchId, gameState.isHost, {
        score: gameState.score,
        round: gameState.currentRound
      });
    } else {
      // Simulate opponent answering question (AI mode only)
      setTimeout(() => {
        gameState.opponentScore += 5;
        updateScoreDisplay();
      }, 500 + Math.random() * 1000);
    }
    
    nextRound();
  } else {
    playSound('wrong');
    endGame(false);
  }
}

async function endGame(won) {
  stopTimer();
  
  // Update Firebase game status
  if (gameState.matchId && gameState.currentMatch?.realtime) {
    await MatchingSystem.updatePlayerData(gameState.matchId, gameState.isHost, {
      finished: true,
      won: won
    });
    
    // Cleanup Firebase listeners
    MatchingSystem.cleanup();
  }
  
  document.getElementById('game-play').style.display = 'none';
  document.getElementById('game-result').style.display = 'block';
  
  const resultTitle = document.getElementById('result-title');
  const resultScore = document.getElementById('result-score');
  
  const finalTime = gameState.timer.elapsed;
  const minutes = Math.floor(finalTime / 60);
  const seconds = finalTime % 60;
  
  const matchType = gameState.currentMatch?.realtime ? 'Real Player' : 'AI';
  
  resultTitle.textContent = won ? '🎉 VICTORY!' : '💥 DEFEAT';
  resultTitle.style.color = won ? '#00ff41' : '#ff0051';
  resultScore.innerHTML = `
    <div>Your Score: ${gameState.score}</div>
    <div>Opponent Score: ${gameState.opponentScore}</div>
    <div style="margin-top: 10px;">Time: ${minutes}:${seconds.toString().padStart(2, '0')}</div>
    <div style="margin-top: 5px; color: var(--neon-cyan); font-size: 0.9rem;">vs ${matchType}</div>
  `;
  
  // Save result if world battle
  if (gameState.currentMatch && gameState.currentMatch.type === 'world') {
    try {
      await fetch(`${API_BASE}/api/match/result`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: gameState.user.id,
          nickname: gameState.user.nickname,
          countryCode: gameState.user.countryCode,
          countryName: gameState.user.countryName,
          matchType: 'world',
          difficulty: gameState.difficulty,
          opponentType: gameState.currentMatch.opponent.type,
          opponentNickname: gameState.currentMatch.opponent.nickname,
          result: won ? 'win' : 'loss',
          score: gameState.score,
          completedRounds: gameState.currentRound
        })
      });
    } catch (error) {
      console.error('Failed to save result:', error);
    }
  }
}

async function showLeaderboard() {
  showScreen('leaderboard-screen');
  updateStatus('viewing stats');
  
  try {
    const response = await fetch(`${API_BASE}/api/leaderboard`);
    const data = await response.json();
    
    renderLeaderboard('today-leaderboard', data.today || []);
    renderLeaderboard('week-leaderboard', data.last7days || []);
  } catch (error) {
    console.error('Failed to load leaderboard:', error);
    document.getElementById('today-leaderboard').innerHTML = 
      '<div class="error-text">Failed to load leaderboard</div>';
  }
}

function renderLeaderboard(elementId, countries) {
  const container = document.getElementById(elementId);
  
  if (countries.length === 0) {
    container.innerHTML = '<div class="no-data">No data yet</div>';
    return;
  }
  
  container.innerHTML = `
    <table class="leaderboard-table">
      <thead>
        <tr>
          <th>Rank</th>
          <th>Country</th>
          <th>Matches</th>
          <th>Wins</th>
          <th>Losses</th>
          <th>Win Rate</th>
        </tr>
      </thead>
      <tbody>
        ${countries.map((c, i) => `
          <tr>
            <td>${i + 1}</td>
            <td>
              <img src="https://flagcdn.com/24x18/${c.country_code.toLowerCase()}.png" 
                   alt="${c.country_name}" class="flag-icon">
              ${c.country_name}
            </td>
            <td>${c.matches}</td>
            <td class="win-text">${c.wins}</td>
            <td class="loss-text">${c.losses}</td>
            <td>${c.win_rate}%</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function showMainMenu() {
  showScreen('game-screen');
  document.getElementById('game-menu').style.display = 'block';
  document.getElementById('game-play').style.display = 'none';
  document.getElementById('game-result').style.display = 'none';
  updateStatus('ready');
  
  // Reset timer
  resetTimer();
  
  // Cleanup Firebase listeners
  MatchingSystem.cleanup();
  gameState.matchId = null;
  gameState.isHost = false;
  
  if (gameState.user) {
    document.getElementById('player-info').innerHTML = `
      <button id="logout-btn" class="logout-btn" title="Change Player">
        <i class="fas fa-sign-out-alt"></i> Logout
      </button>
      <div class="player-card">
        <img src="https://flagcdn.com/24x18/${gameState.user.countryCode.toLowerCase()}.png" 
             alt="${gameState.user.countryName}" class="flag-icon">
        <span class="player-name">${gameState.user.nickname}</span>
        <span class="player-country">${gameState.user.countryName}</span>
      </div>
    `;
    
    // Re-attach logout button listener
    document.getElementById('logout-btn').addEventListener('click', logout);
  }
}

function logout() {
  // Confirm logout
  if (!confirm('Are you sure you want to logout and return to the welcome screen?')) {
    return;
  }
  
  // Cleanup Firebase listeners
  MatchingSystem.cleanup();
  
  // Clear user data
  gameState.user = null;
  gameState.currentMatch = null;
  gameState.matchId = null;
  gameState.isHost = false;
  gameState.score = 0;
  gameState.opponentScore = 0;
  gameState.currentRound = 0;
  
  // Clear localStorage
  localStorage.removeItem('neoncrypt_user');
  
  // Reset timer
  resetTimer();
  
  // Show welcome screen
  showScreen('welcome-screen');
  updateStatus('waiting');
  
  // Clear input fields
  document.getElementById('nickname-input').value = '';
  document.getElementById('country-input').value = '';
  gameState.selectedCountry = null;
}

function showScreen(screenId) {
  document.querySelectorAll('.screen').forEach(screen => {
    screen.classList.remove('active');
  });
  document.getElementById(screenId).classList.add('active');
}
