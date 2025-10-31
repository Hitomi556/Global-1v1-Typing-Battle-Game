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
  currentRiddle: null
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
  
  document.getElementById('sentence-display').textContent = riddle.riddle;
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

// Riddle database - typing challenge is the riddle itself
function generateRandomRiddle() {
  const riddles = [
    {
      riddle: "I speak without a mouth and hear without ears. I have no body, but I come alive with wind. What am I?",
      answers: ["Echo", "Shadow", "Mirror", "Dream"],
      correct: "Echo"
    },
    {
      riddle: "The more you take, the more you leave behind. What am I?",
      answers: ["Footsteps", "Time", "Memory", "Breath"],
      correct: "Footsteps"
    },
    {
      riddle: "I have cities, but no houses. I have mountains, but no trees. I have water, but no fish. What am I?",
      answers: ["Map", "Globe", "Atlas", "Book"],
      correct: "Map"
    },
    {
      riddle: "What has keys but no locks, space but no room, and you can enter but can't go inside?",
      answers: ["Keyboard", "Piano", "House", "Computer"],
      correct: "Keyboard"
    },
    {
      riddle: "I'm tall when I'm young, and I'm short when I'm old. What am I?",
      answers: ["Candle", "Tree", "Person", "Building"],
      correct: "Candle"
    },
    {
      riddle: "What can travel around the world while staying in a corner?",
      answers: ["Stamp", "Letter", "Email", "Postcard"],
      correct: "Stamp"
    },
    {
      riddle: "What has a head and a tail but no body?",
      answers: ["Coin", "Snake", "Arrow", "Comet"],
      correct: "Coin"
    },
    {
      riddle: "What gets wet while drying?",
      answers: ["Towel", "Sponge", "Paper", "Cloth"],
      correct: "Towel"
    },
    {
      riddle: "I have branches, but no fruit, trunk, or leaves. What am I?",
      answers: ["Bank", "River", "Tree", "Road"],
      correct: "Bank"
    },
    {
      riddle: "What can fill a room but takes up no space?",
      answers: ["Light", "Air", "Sound", "Darkness"],
      correct: "Light"
    },
    {
      riddle: "What runs but never walks, has a mouth but never talks, has a bed but never sleeps?",
      answers: ["River", "Clock", "Road", "Wind"],
      correct: "River"
    },
    {
      riddle: "The more of this there is, the less you see. What is it?",
      answers: ["Darkness", "Fog", "Smoke", "Shadow"],
      correct: "Darkness"
    },
    {
      riddle: "What has hands but cannot clap?",
      answers: ["Clock", "Doll", "Statue", "Glove"],
      correct: "Clock"
    },
    {
      riddle: "I'm light as a feather, yet the strongest person can't hold me for five minutes. What am I?",
      answers: ["Breath", "Air", "Thought", "Time"],
      correct: "Breath"
    },
    {
      riddle: "What begins with T, ends with T, and has T in it?",
      answers: ["Teapot", "Text", "Tent", "Treat"],
      correct: "Teapot"
    }
  ];
  
  return riddles[Math.floor(Math.random() * riddles.length)];
}

async function handleTypingInput(e) {
  const input = e.target.value;
  const target = document.getElementById('sentence-display').textContent;
  
  // Start timer on first character typed
  if (!gameState.typingStarted && input.length === 1) {
    gameState.typingStarted = true;
    startTimer();
  }
  
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
