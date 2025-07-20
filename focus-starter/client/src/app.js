// --- CONFIGURATION ---
const API_URL = 'https://focus-starter.onrender.com'; // IMPORTANT: Replace with your deployed backend URL
const DEFAULT_FOCUS_TIME = 1500; // 25 minutes in seconds
const DEFAULT_BREAK_TIME = 300; // 5 minutes in seconds

// --- STATE MANAGEMENT ---
let state = {
    timerId: null,
    timeLeft: DEFAULT_FOCUS_TIME,
    isPaused: true,
    isBreak: false,
    isDndActive: false,
    currentSessionId: null,
    wakeLock: null,
    focusChart: null,
};

// Generate or retrieve a unique user ID
const USER_ID = localStorage.getItem('focus-starter-user-id') || `user_${Date.now()}`;
localStorage.setItem('focus-starter-user-id', USER_ID);

// --- DOM ELEMENTS ---
const timerDisplay = document.getElementById('timerDisplay');
const startPauseBtn = document.getElementById('startPauseBtn');
const resetBtn = document.getElementById('resetBtn');
const sessionTypeDisplay = document.getElementById('sessionType');
const timeSelectBtns = document.querySelectorAll('.time-select-btn');
const audioPlayer = document.getElementById('audioPlayer');
const musicTypeSelect = document.getElementById('musicType');
const unlockMusicBtn = document.getElementById('unlockMusicBtn');
const dndOverlay = document.getElementById('dndOverlay');
const themeToggle = document.getElementById('themeToggle');
const offlineModal = document.getElementById('offlineModal');
const quoteContainer = document.getElementById('quoteContainer');
const statsBtn = document.getElementById('statsBtn');
const statsModal = document.getElementById('statsModal');
const closeStatsBtn = document.getElementById('closeStatsBtn');
const chartCanvas = document.getElementById('focusChart');
const bannerAdPlaceholder = document.getElementById('admob-banner-placeholder');

// --- NOTIFICATIONS & SOUNDS ---
const endSound = new Audio('https://freesound.org/data/previews/391/391539_5121236-lq.mp3'); // A simple chime sound

// --- CORE FUNCTIONS ---

const updateTimerDisplay = () => {
    const minutes = Math.floor(state.timeLeft / 60).toString().padStart(2, '0');
    const seconds = (state.timeLeft % 60).toString().padStart(2, '0');
    const timeString = `${minutes}:${seconds}`;
    timerDisplay.textContent = timeString;
    document.title = `${timeString} - ${state.isBreak ? 'Break' : 'Focus'}`;
};

const startTimer = async () => {
    if (state.isPaused) {
        state.isPaused = false;
        startPauseBtn.textContent = 'Pause';
        startPauseBtn.classList.replace('bg-indigo-600', 'bg-yellow-500');
        startPauseBtn.classList.replace('hover:bg-indigo-700', 'hover:bg-yellow-600');
        
        if (!state.isBreak && !state.currentSessionId) {
            await logSessionStart();
            showQuote();
        }
        
        if (!state.isBreak) {
            playMusic();
            toggleDnd(true);
            requestWakeLock();
        }

        state.timerId = setInterval(() => {
            state.timeLeft--;
            updateTimerDisplay();
            if (state.timeLeft <= 0) {
                handleSessionEnd();
            }
        }, 1000);
    }
};

const pauseTimer = () => {
    if (!state.isPaused) {
        state.isPaused = true;
        clearInterval(state.timerId);
        startPauseBtn.textContent = 'Resume';
        startPauseBtn.classList.replace('bg-yellow-500', 'bg-indigo-600');
        startPauseBtn.classList.replace('hover:bg-yellow-600', 'hover:bg-indigo-700');
        audioPlayer.pause();
        releaseWakeLock();
    }
};

const resetTimer = (duration = DEFAULT_FOCUS_TIME, isBreakSession = false) => {
    clearInterval(state.timerId);
    state.isPaused = true;
    state.isBreak = isBreakSession;
    state.timeLeft = duration;
    startPauseBtn.textContent = 'Start';
    startPauseBtn.classList.replace('bg-yellow-500', 'bg-indigo-600');
    startPauseBtn.classList.replace('hover:bg-yellow-600', 'hover:bg-indigo-700');
    sessionTypeDisplay.textContent = state.isBreak ? 'Break Time' : 'Focus Session';
    toggleDnd(false);
    audioPlayer.pause();
    releaseWakeLock();
    if (state.currentSessionId && !state.isBreak) {
        logSessionEnd(); // Log if a session was active
    }
    state.currentSessionId = null;
    quoteContainer.classList.add('hidden');
    updateTimerDisplay();
};

const handleSessionEnd = () => {
    clearInterval(state.timerId);
    endSound.play();
    showNotification(state.isBreak ? 'Break is over! Time to focus.' : 'Focus session complete! Time for a break.');
    
    if (!state.isBreak) {
        logSessionEnd();
        resetTimer(DEFAULT_BREAK_TIME, true);
    } else {
        resetTimer(DEFAULT_FOCUS_TIME, false);
    }
};

// --- FEATURE-SPECIFIC FUNCTIONS ---

const playMusic = async () => {
    try {
        const musicType = musicTypeSelect.value;
        const response = await fetch(`${API_URL}/api/music?type=${encodeURIComponent(musicType)}`);
        if (!response.ok) throw new Error('Music not found');
        const data = await response.json();
        audioPlayer.src = data.soundUrl;
        audioPlayer.play().catch(e => console.error("Audio playback failed:", e));
    } catch (error) {
        console.error('Error fetching music:', error);
    }
};

const toggleDnd = (enable) => {
    state.isDndActive = enable;
    if (enable) {
        dndOverlay.classList.remove('hidden');
        dndOverlay.classList.add('flex');
    } else {
        dndOverlay.classList.add('hidden');
        dndOverlay.classList.remove('flex');
    }
};

const toggleTheme = () => {
    const isDark = document.documentElement.classList.toggle('dark');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
};

const showQuote = async () => {
    try {
        const response = await fetch(`${API_URL}/api/quote`);
        const data = await response.json();
        quoteContainer.querySelector('#quoteText').textContent = `"${data.q}"`;
        quoteContainer.querySelector('#quoteAuthor').textContent = `– ${data.a}`;
        quoteContainer.classList.remove('hidden');
    } catch (error) {
        console.error('Failed to fetch quote:', error);
    }
};

const showNotification = (body) => {
    if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('Focus Starter', { body });
    }
};

// --- BACKEND & API INTEGRATION ---

const logSessionStart = async () => {
    try {
        const response = await fetch(`${API_URL}/start-session`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: USER_ID }),
        });
        const data = await response.json();
        state.currentSessionId = data.sessionId;
    } catch (error) {
        console.error('Could not start session:', error);
    }
};

const logSessionEnd = async () => {
    if (!state.currentSessionId) return;
    try {
        await fetch(`${API_URL}/end-session`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId: state.currentSessionId }),
        });
        state.currentSessionId = null;
    } catch (error) {
        console.error('Could not end session:', error);
    }
};

const fetchAndRenderStats = async () => {
    statsModal.classList.remove('hidden');
    statsModal.classList.add('flex');
    try {
        const response = await fetch(`${API_URL}/stats?userId=${USER_ID}`);
        const data = await response.json();
        renderChart(data);
    } catch (error) {
        console.error("Failed to fetch stats:", error);
    }
};

const renderChart = (statsData) => {
    const labels = statsData.map(d => d._id);
    const data = statsData.map(d => (d.totalDuration / 60).toFixed(1)); // Convert to minutes

    if (state.focusChart) {
        state.focusChart.destroy();
    }

    state.focusChart = new Chart(chartCanvas, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Focus Time (minutes)',
                data: data,
                backgroundColor: 'rgba(79, 70, 229, 0.8)',
                borderColor: 'rgba(79, 70, 229, 1)',
                borderWidth: 1
            }]
        },
        options: {
            scales: { y: { beginAtZero: true } },
            responsive: true,
            maintainAspectRatio: true,
        }
    });
};

// --- HARDWARE & BROWSER APIs ---

const requestWakeLock = async () => {
    if ('wakeLock' in navigator) {
        try {
            state.wakeLock = await navigator.wakeLock.request('screen');
            console.log('Screen Wake Lock is active.');
        } catch (err) {
            console.error(`${err.name}, ${err.message}`);
        }
    }
};

const releaseWakeLock = () => {
    if (state.wakeLock !== null) {
        state.wakeLock.release().then(() => {
            state.wakeLock = null;
            console.log('Screen Wake Lock released.');
        });
    }
};

const updateOnlineStatus = () => {
    offlineModal.classList.toggle('hidden', navigator.onLine);
};

// --- ADMOB JAVASCRIPT BRIDGE ---

const showRewardedAd = () => {
    // Check if the native Android interface is available
    if (window.Android && typeof window.Android.showRewardedAd === 'function') {
        window.Android.showRewardedAd();
    } else {
        // Fallback for testing in a regular browser
        console.warn("AdMob not available in browser. Simulating reward.");
        onRewardGranted();
    }
};

// This function MUST be callable from the native WebView side.
// Sketchware/Kodular will call `webView.evaluateJavascript("onRewardGranted();", null);`
window.onRewardGranted = () => {
    console.log("Reward granted! Unlocking premium features.");
    const premiumOption = musicTypeSelect.querySelector('option[value="cinematic drone"]');
    if (premiumOption) {
        premiumOption.disabled = false;
        premiumOption.textContent = "✨ Premium Drone";
        alert("Premium sound unlocked for this session!");
    }
};

// --- EVENT LISTENERS ---

startPauseBtn.addEventListener('click', () => {
    state.isPaused ? startTimer() : pauseTimer();
});

resetBtn.addEventListener('click', () => resetTimer(DEFAULT_FOCUS_TIME, false));

timeSelectBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        const timeInSeconds = parseInt(btn.dataset.time, 10);
        resetTimer(timeInSeconds, timeInSeconds < 600); // Assume short times are breaks
    });
});

musicTypeSelect.addEventListener('change', () => {
    if (!state.isPaused && !state.isBreak) playMusic();
});

unlockMusicBtn.addEventListener('click', showRewardedAd);
themeToggle.addEventListener('click', toggleTheme);
statsBtn.addEventListener('click', fetchAndRenderStats);
closeStatsBtn.addEventListener('click', () => {
    statsModal.classList.add('hidden');
    statsModal.classList.remove('flex');
});

window.addEventListener('online', updateOnlineStatus);
window.addEventListener('offline', updateOnlineStatus);

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    // Load theme
    if (localStorage.getItem('theme') === 'dark' ||
        (window.matchMedia('(prefers-color-scheme: dark)').matches && !localStorage.getItem('theme'))) {
        document.documentElement.classList.add('dark');
    }

    // Request Notification permission
    if ('Notification' in window && Notification.permission !== 'granted') {
        Notification.requestPermission();
    }

    // Check online status and set initial timer
    updateOnlineStatus();
    updateTimerDisplay();

    // Show banner ad if in native app context
    if (window.Android && typeof window.Android.showBanner === 'function') {
        window.Android.showBanner();
        bannerAdPlaceholder.style.display = 'none'; // Hide placeholder if native ad is shown
    }
});