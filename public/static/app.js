// NeonCrypt - Game Logic
const API_BASE = '';
const COUNTRIES_API = 'https://restcountries.com/v3.1';

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
  typingStarted: false
};

// Initialize app
document.addEventListener('DOMContentLoaded', async () => {
  initSounds();
  setupEventListeners();
  loadCountries();
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
  document.getElementById('friend-match-btn').addEventListener('click', startFriendBattle);
  document.getElementById('start-game-btn').addEventListener('click', startGame);
  
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
      return;
    }
    
    gameState.user = {
      id: data.userId,
      nickname,
      countryCode: gameState.selectedCountry.code,
      countryName: gameState.selectedCountry.name
    };
    localStorage.setItem('neoncrypt_user', JSON.stringify(gameState.user));
    
    gameState.currentMatch = {
      type: 'world',
      difficulty: gameState.difficulty,
      opponent: data.opponent
    };
    
    showScreen('game-screen');
    showMainMenu();
  } catch (error) {
    console.error('Match error:', error);
    alert('Failed to start match. Please try again.');
  }
}

async function startFriendBattle() {
  const nickname = document.getElementById('nickname-input').value.trim();
  
  if (!nickname) {
    alert('Please enter a nickname');
    return;
  }
  
  if (!gameState.selectedCountry) {
    alert('Please select your country');
    return;
  }
  
  gameState.user = {
    id: `friend_${Date.now()}`,
    nickname,
    countryCode: gameState.selectedCountry.code,
    countryName: gameState.selectedCountry.name
  };
  localStorage.setItem('neoncrypt_user', JSON.stringify(gameState.user));
  
  gameState.currentMatch = {
    type: 'friend',
    difficulty: gameState.difficulty,
    opponent: { type: 'friend', nickname: 'Friend' }
  };
  
  showScreen('game-screen');
  showMainMenu();
}

function startGame() {
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
  
  // Generate random sentence
  const sentence = generateRandomSentence();
  document.getElementById('sentence-display').textContent = sentence;
  document.getElementById('typing-input').value = '';
  document.getElementById('typing-input').disabled = false;
  document.getElementById('typing-input').focus();
  
  // Hide question section
  document.getElementById('question-section').style.display = 'none';
  
  // Simulate opponent typing (with random delay)
  simulateOpponentProgress();
}

function generateRandomSentence() {
  const sentences = [
    "The quick brown fox jumps over the lazy dog.",
    "Pack my box with five dozen liquor jugs.",
    "How vexingly quick daft zebras jump!",
    "Sphinx of black quartz, judge my vow.",
    "Two driven jocks help fax my big quiz.",
    "Five quacking zephyrs jolt my wax bed.",
    "The five boxing wizards jump quickly.",
    "Jackdaws love my big sphinx of quartz.",
    "Mr. Jock, TV quiz PhD, bags few lynx.",
    "Waltz, bad nymph, for quick jigs vex."
  ];
  return sentences[Math.floor(Math.random() * sentences.length)];
}

function handleTypingInput(e) {
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
    showQuestion();
  }
}

function showQuestion() {
  const questionSection = document.getElementById('question-section');
  questionSection.style.display = 'block';
  
  // Generate random question
  const questions = [
    {
      question: "What is 15 + 27?",
      answers: ["42", "41", "43", "40"],
      correct: "42"
    },
    {
      question: "Capital of France?",
      answers: ["Paris", "London", "Berlin", "Madrid"],
      correct: "Paris"
    },
    {
      question: "2^5 = ?",
      answers: ["32", "16", "64", "25"],
      correct: "32"
    },
    {
      question: "HTML stands for?",
      answers: ["HyperText Markup Language", "High Tech Modern Language", "Home Tool Markup Language", "Hyperlinks and Text Markup Language"],
      correct: "HyperText Markup Language"
    },
    {
      question: "Largest ocean?",
      answers: ["Pacific", "Atlantic", "Indian", "Arctic"],
      correct: "Pacific"
    }
  ];
  
  const q = questions[Math.floor(Math.random() * questions.length)];
  gameState.currentQuestion = q;
  
  document.getElementById('question-text').textContent = q.question;
  
  const buttons = document.querySelectorAll('.answer-btn');
  q.answers.forEach((answer, i) => {
    if (buttons[i]) {
      buttons[i].textContent = answer;
      buttons[i].dataset.answer = answer;
      buttons[i].style.display = 'block';
    }
  });
  
  // Hide extra buttons if less than 4 answers
  for (let i = q.answers.length; i < 4; i++) {
    if (buttons[i]) buttons[i].style.display = 'none';
  }
}

function handleAnswer(answer) {
  if (answer === gameState.currentQuestion.correct) {
    playSound('correct');
    gameState.score += 5;
    updateScoreDisplay();
    
    // Simulate opponent answering question
    setTimeout(() => {
      gameState.opponentScore += 5;
      updateScoreDisplay();
    }, 500 + Math.random() * 1000);
    
    nextRound();
  } else {
    playSound('wrong');
    endGame(false);
  }
}

async function endGame(won) {
  stopTimer();
  
  document.getElementById('game-play').style.display = 'none';
  document.getElementById('game-result').style.display = 'block';
  
  const resultTitle = document.getElementById('result-title');
  const resultScore = document.getElementById('result-score');
  
  const finalTime = gameState.timer.elapsed;
  const minutes = Math.floor(finalTime / 60);
  const seconds = finalTime % 60;
  
  resultTitle.textContent = won ? '🎉 VICTORY!' : '💥 DEFEAT';
  resultTitle.style.color = won ? '#00ff41' : '#ff0051';
  resultScore.innerHTML = `
    <div>Your Score: ${gameState.score}</div>
    <div>Opponent Score: ${gameState.opponentScore}</div>
    <div style="margin-top: 10px;">Time: ${minutes}:${seconds.toString().padStart(2, '0')}</div>
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
  
  if (gameState.user) {
    document.getElementById('player-info').innerHTML = `
      <div class="player-card">
        <img src="https://flagcdn.com/24x18/${gameState.user.countryCode.toLowerCase()}.png" 
             alt="${gameState.user.countryName}" class="flag-icon">
        <span class="player-name">${gameState.user.nickname}</span>
        <span class="player-country">${gameState.user.countryName}</span>
      </div>
    `;
  }
}

function showScreen(screenId) {
  document.querySelectorAll('.screen').forEach(screen => {
    screen.classList.remove('active');
  });
  document.getElementById(screenId).classList.add('active');
}
