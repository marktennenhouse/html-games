// Canvas setup
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// UI elements
const pianoConfigScreen = document.getElementById('pianoConfigScreen');
const startScreen = document.getElementById('startScreen');
const gameOverScreen = document.getElementById('gameOverScreen');
const pauseScreen = document.getElementById('pauseScreen');
const startButton = document.getElementById('startButton');
const restartButton = document.getElementById('restartButton');
const resumeButton = document.getElementById('resumeButton');
const speedSlider = document.getElementById('speedSlider');
const speedValue = document.getElementById('speedValue');

// Piano input mapper
const pianoMapper = new PianoInputMapper({
    mode: 'Note',
    upNote: 'C',
    downNote: 'G'
});
pianoMapper.onAction = (action, details) => handlePianoAction(action, details);
let usePiano = false;

const TRACKING_SETTINGS = {
    enabled: true,
    apiBaseUrl: 'http://localhost:5000',
    userId: 1,
    gameId: 1,
    skillLevelId: 1,
    keyName: 'C Major',
    progressionPreference: {
        requiredOnly: true
    },
    batchSize: 15,
    debug: false
};

const QUALITY_ALIASES = {
    major: ['major', 'maj'],
    minor: ['minor', 'min'],
    diminished: ['diminished', 'dim'],
    augmented: ['augmented', 'aug']
};

const trackingState = {
    enabled: false,
    ready: false,
    tracker: null,
    mode: pianoMapper.config.mode,
    keyId: null,
    progressionKeyId: null,
    noteIdByPitchClass: new Map(),
    chordIdBySignature: new Map(),
    chordsMeta: [],
    expectedIds: { up: null, down: null },
    sessionActive: false,
    sequence: 0,
    lastPromptTimes: { up: null, down: null },
    successCount: 0,
    errorCount: 0
};

// Game state
let gameSpeed = 1.0;
let gameRunning = false;
let gamePaused = false;
let animationId = null;
let practiceMode = false;

// Practice mode scroll control
let pipeScrollEnabled = true;
let lastCollisionY = 0;
let collisionPipe = null;
let collisionTime = 0;
let autoResumeDelay = 1000; // Resume after 1 second if not cleared

// Bird properties - Momentum-based physics
const bird = {
    x: 80,
    y: canvas.height / 2,
    radius: 15,
    velocity: 0,
    velocityX: 0,         // Horizontal velocity for practice mode bounces
    gravity: 0.05,        // Very light gravity when no input
    upThrust: -0.35,      // Upward acceleration from key press
    downThrust: 0.35,     // Downward acceleration from key press
    maxVelocity: 4,       // Speed cap
    rotation: 0
};

// Keyboard state
let keyboardState = {
    up: false,
    down: false
};

// Pipe properties
const pipeWidth = 60;
const pipeGap = 150;
const pipeSpeed = 2;
let pipes = [];
let frameCount = 0;
let pipeFrequency = 90; // frames between pipes

// Initialize game
function init() {
    bird.y = canvas.height / 2;
    bird.velocity = 0;
    bird.velocityX = 0;
    bird.rotation = 0;
    pipes = [];
    frameCount = 0;
    pipeScrollEnabled = true;
    lastCollisionY = 0;
    collisionPipe = null;
    collisionTime = 0;
}

// Update speed value display
speedSlider.addEventListener('input', (e) => {
    speedValue.textContent = parseFloat(e.target.value).toFixed(1) + 'x';
});

// Start game
startButton.addEventListener('click', async () => {
    gameSpeed = parseFloat(speedSlider.value);
    practiceMode = document.getElementById('practiceMode').checked;
    startScreen.classList.add('hidden');
    gameRunning = true;
    init();
    await startTrackingSession();
    gameLoop();
});

// Restart game
restartButton.addEventListener('click', () => {
    gameOverScreen.classList.add('hidden');
    startScreen.classList.remove('hidden');
    init();
});

// Resume game from pause
resumeButton.addEventListener('click', () => {
    resumeGame();
});

// Keyboard controls - Track up/down state
document.addEventListener('keydown', (e) => {
    // Pause/Resume with Escape or P key
    if (gameRunning && (e.code === 'Escape' || e.code === 'KeyP')) {
        e.preventDefault();
        if (gamePaused) {
            resumeGame();
        } else {
            pauseGame();
        }
        return;
    }
    
    if (!gameRunning || gamePaused) return;
    
    if (e.code === 'ArrowUp') {
        e.preventDefault();
        keyboardState.up = true;
    }
    if (e.code === 'ArrowDown') {
        e.preventDefault();
        keyboardState.down = true;
    }
});

document.addEventListener('keyup', (e) => {
    if (e.code === 'ArrowUp') {
        keyboardState.up = false;
    }
    if (e.code === 'ArrowDown') {
        keyboardState.down = false;
    }
});

// Draw bird
function drawBird() {
    ctx.save();
    ctx.translate(bird.x, bird.y);
    
    // Rotate bird based on velocity
    const rotation = Math.min(Math.max(bird.velocity * 0.05, -0.5), 0.5);
    ctx.rotate(rotation);
    
    // Draw bird body (yellow circle)
    ctx.fillStyle = '#FFD700';
    ctx.beginPath();
    ctx.arc(0, 0, bird.radius, 0, Math.PI * 2);
    ctx.fill();
    
    // Draw bird outline
    ctx.strokeStyle = '#FFA500';
    ctx.lineWidth = 2;
    ctx.stroke();
    
    // Draw eye
    ctx.fillStyle = 'white';
    ctx.beginPath();
    ctx.arc(5, -5, 4, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.fillStyle = 'black';
    ctx.beginPath();
    ctx.arc(6, -5, 2, 0, Math.PI * 2);
    ctx.fill();
    
    // Draw beak
    ctx.fillStyle = '#FF6347';
    ctx.beginPath();
    ctx.moveTo(bird.radius - 5, 0);
    ctx.lineTo(bird.radius + 5, 0);
    ctx.lineTo(bird.radius, 3);
    ctx.closePath();
    ctx.fill();
    
    ctx.restore();
}

// Draw pipes
function drawPipes() {
    pipes.forEach(pipe => {
        // Top pipe
        ctx.fillStyle = '#228B22';
        ctx.fillRect(pipe.x, 0, pipeWidth, pipe.top);
        
        // Top pipe cap
        ctx.fillStyle = '#32CD32';
        ctx.fillRect(pipe.x - 5, pipe.top - 20, pipeWidth + 10, 20);
        
        // Bottom pipe
        ctx.fillStyle = '#228B22';
        ctx.fillRect(pipe.x, pipe.bottom, pipeWidth, canvas.height - pipe.bottom);
        
        // Bottom pipe cap
        ctx.fillStyle = '#32CD32';
        ctx.fillRect(pipe.x - 5, pipe.bottom, pipeWidth + 10, 20);
        
        // Pipe highlights
        ctx.fillStyle = 'rgba(50, 205, 50, 0.3)';
        ctx.fillRect(pipe.x + 5, 0, 8, pipe.top);
        ctx.fillRect(pipe.x + 5, pipe.bottom, 8, canvas.height - pipe.bottom);
    });
}

// Draw background
function drawBackground() {
    // Sky gradient
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, '#87CEEB');
    gradient.addColorStop(1, '#70c5ce');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Ground
    ctx.fillStyle = '#8B4513';
    ctx.fillRect(0, canvas.height - 50, canvas.width, 50);
    
    // Grass
    ctx.fillStyle = '#228B22';
    ctx.fillRect(0, canvas.height - 50, canvas.width, 10);
}

// Check input from both keyboard and piano
function isUpPressed() {
    return keyboardState.up || (usePiano && pianoMapper.up);
}

function isDownPressed() {
    return keyboardState.down || (usePiano && pianoMapper.down);
}

// Update bird physics - Momentum-based with thrust
function updateBird() {
    // Apply thrust based on input (keyboard or piano)
    if (isUpPressed()) {
        bird.velocity += bird.upThrust;
    }
    if (isDownPressed()) {
        bird.velocity += bird.downThrust;
    }
    
    // Apply light gravity when no input
    if (!isUpPressed() && !isDownPressed()) {
        bird.velocity += bird.gravity * gameSpeed;
    }
    
    // Cap velocity
    bird.velocity = Math.max(-bird.maxVelocity, 
                            Math.min(bird.maxVelocity, bird.velocity));
    
    // Update position
    bird.y += bird.velocity * gameSpeed;
    
    // Handle horizontal velocity (for practice mode bounces)
    if (practiceMode && bird.velocityX !== 0) {
        bird.x += bird.velocityX * gameSpeed;
        bird.velocityX *= 0.95; // Horizontal drag
        
        // Stop horizontal movement when nearly zero
        if (Math.abs(bird.velocityX) < 0.1) {
            bird.velocityX = 0;
            bird.x = 80; // Return to default X position
        }
    }
    
    // Add drag for smooth feel
    bird.velocity *= 0.98;
    
    // Check if should resume scrolling in practice mode
    checkScrollResume();
}

// Update pipes
function updatePipes() {
    // Only update pipes if scrolling is enabled (or not in practice mode)
    if (!practiceMode || pipeScrollEnabled) {
        frameCount++;
        
        // Generate new pipes
        if (frameCount % Math.floor(pipeFrequency / gameSpeed) === 0) {
            const minHeight = 50;
            const maxHeight = canvas.height - pipeGap - 100;
            const topHeight = Math.random() * (maxHeight - minHeight) + minHeight;
            
            pipes.push({
                x: canvas.width,
                top: topHeight,
                bottom: topHeight + pipeGap
            });
        }
        
        // Move pipes
        pipes.forEach(pipe => {
            pipe.x -= pipeSpeed * gameSpeed;
        });
        
        // Remove off-screen pipes
        pipes = pipes.filter(pipe => pipe.x + pipeWidth > 0);
    }
}

// Check collisions
function checkCollisions() {
    if (practiceMode) {
        // Practice mode: bounce physics instead of game over
        handlePracticeCollisions();
        return;
    }
    
    // Normal mode: Game over on collision
    // Ground and ceiling collision
    if (bird.y + bird.radius > canvas.height - 50 || bird.y - bird.radius < 0) {
        gameOver();
        return;
    }
    
    // Pipe collision
    pipes.forEach(pipe => {
        // Check if bird is in horizontal range of pipe
        if (bird.x + bird.radius > pipe.x && bird.x - bird.radius < pipe.x + pipeWidth) {
            // Check if bird hits top or bottom pipe
            if (bird.y - bird.radius < pipe.top || bird.y + bird.radius > pipe.bottom) {
                gameOver();
            }
        }
    });
}

// Handle collisions in practice mode with bounce physics
function handlePracticeCollisions() {
    const bounceDampening = 0.6; // Energy loss on bounce
    
    // Ground collision
    if (bird.y + bird.radius > canvas.height - 50) {
        bird.y = canvas.height - 50 - bird.radius;
        bird.velocity = -Math.abs(bird.velocity) * bounceDampening;
    }
    
    // Ceiling collision
    if (bird.y - bird.radius < 0) {
        bird.y = bird.radius;
        bird.velocity = Math.abs(bird.velocity) * bounceDampening;
    }
    
    // Pipe collisions
    pipes.forEach(pipe => {
        // Check if bird is in horizontal range of pipe
        if (bird.x + bird.radius > pipe.x && bird.x - bird.radius < pipe.x + pipeWidth) {
            // Top pipe collision
            if (bird.y - bird.radius < pipe.top && bird.y > pipe.top - bird.radius * 2) {
                bird.y = pipe.top + bird.radius;
                bird.velocity = Math.abs(bird.velocity) * bounceDampening;
                
                // Pause scrolling and mark collision
                if (pipeScrollEnabled) {
                    pipeScrollEnabled = false;
                    lastCollisionY = bird.y;
                    collisionPipe = pipe;
                    collisionTime = Date.now();
                }
            }
            
            // Bottom pipe collision
            if (bird.y + bird.radius > pipe.bottom && bird.y < pipe.bottom + bird.radius * 2) {
                bird.y = pipe.bottom - bird.radius;
                bird.velocity = -Math.abs(bird.velocity) * bounceDampening;
                
                // Pause scrolling and mark collision
                if (pipeScrollEnabled) {
                    pipeScrollEnabled = false;
                    lastCollisionY = bird.y;
                    collisionPipe = pipe;
                    collisionTime = Date.now();
                }
            }
        }
        
        // Left side of pipe collision (bird hits front of pipe)
        if (bird.x + bird.radius > pipe.x && 
            bird.x < pipe.x + pipeWidth / 2 &&
            (bird.y < pipe.top || bird.y > pipe.bottom)) {
            
            // Check if hitting from the left side
            if (bird.x < pipe.x + bird.radius) {
                bird.x = pipe.x - bird.radius - 1;
                bird.velocityX = -Math.abs(bird.velocityX || 2) * bounceDampening;
                bird.velocity *= bounceDampening;
                
                // Pause scrolling and mark collision
                if (pipeScrollEnabled) {
                    pipeScrollEnabled = false;
                    lastCollisionY = bird.y;
                    collisionPipe = pipe;
                    collisionTime = Date.now();
                }
            }
        }
    });
}

// Check if bird has moved past collision point to resume scrolling
function checkScrollResume() {
    if (practiceMode && !pipeScrollEnabled) {
        const currentTime = Date.now();
        const timeSinceCollision = currentTime - collisionTime;
        
        // Resume scrolling if:
        // 1. Auto-resume delay has passed (1 second)
        if (timeSinceCollision > autoResumeDelay) {
            pipeScrollEnabled = true;
            collisionPipe = null;
            return;
        }
        
        // 2. Bird has moved through the gap (vertically cleared the collision zone)
        if (collisionPipe) {
            const inGap = bird.y > collisionPipe.top && bird.y < collisionPipe.bottom;
            const clearedVertically = Math.abs(bird.y - lastCollisionY) > 40;
            
            if (inGap || clearedVertically) {
                pipeScrollEnabled = true;
                collisionPipe = null;
            }
        }
    }
}

// Game over
function gameOver() {
    gameRunning = false;
    cancelAnimationFrame(animationId);
    gameOverScreen.classList.remove('hidden');
    endTrackingSession();
}

// Pause game
function pauseGame() {
    gamePaused = true;
    pauseScreen.classList.remove('hidden');
}

// Resume game
function resumeGame() {
    gamePaused = false;
    pauseScreen.classList.add('hidden');
    gameLoop(); // Restart the game loop
}

// Game loop
function gameLoop() {
    if (!gameRunning || gamePaused) return;
    
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw everything
    drawBackground();
    drawPipes();
    drawBird();
    
    // Update game state
    updateBird();
    updatePipes();
    checkCollisions();
    
    // Continue loop
    animationId = requestAnimationFrame(gameLoop);
}

// Piano Configuration UI Handlers
const inputModeSelect = document.getElementById('inputMode');
const noteModeConfig = document.getElementById('noteModeConfig');
const chordModeConfig = document.getElementById('chordModeConfig');
const configPreview = document.getElementById('configPreview');
const savePianoConfigButton = document.getElementById('savePianoConfig');
const skipPianoConfigButton = document.getElementById('skipPianoConfig');

// MIDI Status UI elements
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const deviceList = document.getElementById('deviceList');
const gameInputStatus = document.getElementById('gameInputStatus');
const gameStatusDot = document.getElementById('gameStatusDot');
const gameStatusText = document.getElementById('gameStatusText');

// Toggle between Note and Chord config
inputModeSelect.addEventListener('change', () => {
    updateConfigUI();
    updateConfigPreview();
});

// Update preview when any config changes
document.getElementById('upNote').addEventListener('change', updateConfigPreview);
document.getElementById('downNote').addEventListener('change', updateConfigPreview);
document.getElementById('upChord').addEventListener('change', updateConfigPreview);
document.getElementById('upChordType').addEventListener('change', updateConfigPreview);
document.getElementById('downChord').addEventListener('change', updateConfigPreview);
document.getElementById('downChordType').addEventListener('change', updateConfigPreview);

function updateConfigUI() {
    const mode = inputModeSelect.value;
    
    if (mode === 'Note') {
        noteModeConfig.classList.remove('hidden');
        chordModeConfig.classList.add('hidden');
    } else {
        noteModeConfig.classList.add('hidden');
        chordModeConfig.classList.remove('hidden');
    }
}

function updateConfigPreview() {
    const mode = inputModeSelect.value;
    
    const config = {
        mode: mode
    };
    
    if (mode === 'Note') {
        config.upNote = document.getElementById('upNote').value;
        config.downNote = document.getElementById('downNote').value;
    } else {
        config.upChord = document.getElementById('upChord').value;
        config.upChordType = document.getElementById('upChordType').value;
        config.downChord = document.getElementById('downChord').value;
        config.downChordType = document.getElementById('downChordType').value;
    }
    
    pianoMapper.updateConfig(config);
    configPreview.textContent = pianoMapper.getConfigDescription();
    refreshExpectedIdsFromConfig();
}

// Update MIDI connection status display
function updateConnectionStatus() {
    const status = pianoMapper.getConnectionStatus();
    
    if (status.connected) {
        statusDot.className = 'status-dot connected';
        statusText.textContent = `Connected (${status.deviceCount} device${status.deviceCount > 1 ? 's' : ''})`;
        
        // Show device list
        deviceList.innerHTML = '';
        status.devices.forEach(device => {
            const deviceItem = document.createElement('div');
            deviceItem.className = 'device-item';
            deviceItem.textContent = `🎹 ${device.name}`;
            deviceList.appendChild(deviceItem);
        });
    } else {
        statusDot.className = 'status-dot disconnected';
        statusText.textContent = 'Not connected';
        deviceList.innerHTML = '';
    }
}

// Save piano config and initialize MIDI
savePianoConfigButton.addEventListener('click', async () => {
    updateConfigPreview(); // Apply final config
    
    // Show connecting status
    statusText.textContent = 'Connecting...';
    statusDot.className = 'status-dot';
    
    const success = await pianoMapper.init();
    
    if (success) {
        usePiano = true;
        updateConnectionStatus();
        await configureTrackingForPiano();
        
        // Set up connection change listener
        pianoMapper.onConnectionChange = (status) => {
            updateConnectionStatus();
            
            // Show warning if disconnected during gameplay
            if (!status.connected && gameRunning) {
                console.warn('MIDI device disconnected during gameplay!');
                // Note: Game will still work with keyboard
            }
            
            // Update game screen status if visible
            if (!pianoConfigScreen.classList.contains('hidden') === false) {
                updateGameInputStatus();
            }
        };
        
        pianoConfigScreen.classList.add('hidden');
        startScreen.classList.remove('hidden');
        updateGameInputStatus();
        console.log('Piano input enabled:', pianoMapper.getConfigDescription());
    } else {
        updateConnectionStatus();
        trackingState.enabled = false;
        trackingState.ready = false;
        alert('Could not connect to MIDI device. Please check your piano connection and try again, or use keyboard instead.');
    }
});

// Update input status on game start screen
function updateGameInputStatus() {
    if (usePiano) {
        const status = pianoMapper.getConnectionStatus();
        gameInputStatus.classList.remove('hidden');
        
        if (status.connected) {
            gameStatusDot.className = 'status-dot connected';
            gameStatusText.textContent = `Piano: ${status.deviceNames}`;
        } else {
            gameStatusDot.className = 'status-dot disconnected';
            gameStatusText.textContent = 'Piano disconnected (keyboard active)';
        }
    } else {
        gameInputStatus.classList.add('hidden');
    }
}

// Skip piano config and use keyboard
skipPianoConfigButton.addEventListener('click', () => {
    usePiano = false;
    trackingState.enabled = false;
    trackingState.ready = false;
    pianoConfigScreen.classList.add('hidden');
    startScreen.classList.remove('hidden');
    console.log('Using keyboard input');
});

// Tracking integration helpers
function normalizeNoteName(note) {
    if (!note) return '';
    const trimmed = note.toString().trim()
        .replace(/♯/g, '#')
        .replace(/♭/g, 'b');
    const match = trimmed.match(/^([A-Ga-g])([#b]?)/);
    if (!match) {
        return trimmed.toUpperCase();
    }
    const letter = match[1].toUpperCase();
    const accidental = match[2] ? match[2].toLowerCase() : '';
    return `${letter}${accidental}`;
}

function extractRootFromChordName(name) {
    if (!name) return '';
    const cleaned = name.split(/[\s(]/)[0];
    const withoutSlash = cleaned.split('/')[0];
    const withoutDash = withoutSlash.split('-')[0];
    return normalizeNoteName(withoutDash);
}

function getPitchClassFromNote(note) {
    const normalized = normalizeNoteName(note);
    const pitch = pianoMapper.noteToMidi[normalized];
    if (pitch === undefined) return null;
    return ((pitch % 12) + 12) % 12;
}

function noteStringToMidi(noteStr) {
    if (typeof noteStr !== 'string') return null;
    const trimmed = noteStr.trim()
        .replace(/♯/g, '#')
        .replace(/♭/g, 'b');
    const match = trimmed.match(/^([A-Ga-g])([#b]?)(-?\d)$/);
    if (!match) return null;
    const name = normalizeNoteName(`${match[1]}${match[2] || ''}`);
    const octave = parseInt(match[3], 10);
    if (Number.isNaN(octave)) return null;
    const pitch = pianoMapper.noteToMidi[name];
    if (pitch === undefined) return null;
    return (octave + 1) * 12 + pitch;
}

function buildChordSignature(midiNotes) {
    if (!Array.isArray(midiNotes)) return '';
    const uniquePitchClasses = [...new Set(
        midiNotes
            .filter(n => typeof n === 'number' && Number.isFinite(n))
            .map(n => ((Math.round(n) % 12) + 12) % 12)
    )].sort((a, b) => a - b);
    return uniquePitchClasses.join('-');
}

function extractMidiNumbersFromChord(chord) {
    if (!chord) return [];
    if (Array.isArray(chord.midiNumbers)) {
        return chord.midiNumbers
            .map(n => typeof n === 'number' ? n : parseInt(n, 10))
            .filter(n => Number.isFinite(n));
    }
    let notes = chord.notes;
    if (typeof notes === 'string') {
        try {
            notes = JSON.parse(notes);
        } catch {
            notes = [];
        }
    }
    if (!Array.isArray(notes)) return [];
    return notes
        .map(noteStringToMidi)
        .filter(n => n !== null);
}

function buildChordLookups(chords) {
    trackingState.noteIdByPitchClass.clear();
    trackingState.chordIdBySignature.clear();
    trackingState.chordsMeta = [];
    
    chords.forEach((chord) => {
        const chordId = chord?.chordId ?? chord?.id ?? null;
        if (chordId === null) return;
        
        const midiNumbers = extractMidiNumbersFromChord(chord);
        const pitchClasses = [...new Set(midiNumbers.map(n => ((n % 12) + 12) % 12))].sort((a, b) => a - b);
        const signature = pitchClasses.join('-');
        
        const meta = {
            chordId,
            chordName: chord.chordName || chord.name || '',
            chordQuality: chord.chordQuality || chord.quality || '',
            chordType: chord.chordType || '',
            inversionType: chord.inversionType || '',
            pitchClasses,
            signature
        };
        
        trackingState.chordsMeta.push(meta);
        
        if (signature) {
            trackingState.chordIdBySignature.set(signature, chordId);
        }
        
        if (pitchClasses.length === 1 && !trackingState.noteIdByPitchClass.has(pitchClasses[0])) {
            trackingState.noteIdByPitchClass.set(pitchClasses[0], chordId);
        }
    });
}

function findChordIdForConfig(root, chordTypeLabel) {
    const normalizedRoot = normalizeNoteName(root);
    const qualityKey = chordTypeLabel ? chordTypeLabel.toLowerCase() : 'major';
    const allowedQualities = QUALITY_ALIASES[qualityKey] || [qualityKey];
    
    const candidates = trackingState.chordsMeta.filter(meta => {
        const metaRoot = extractRootFromChordName(meta.chordName);
        const metaQuality = (meta.chordQuality || '').toLowerCase();
        const inversion = (meta.inversionType || '').toLowerCase();
        const chordType = (meta.chordType || '').toLowerCase();
        
        const isTriad = chordType.includes('triad') || chordType === 'full-triad' || chordType === 'full-chords';
        const isRootMatch = metaRoot === normalizedRoot;
        const isQualityMatch = allowedQualities.includes(metaQuality);
        const isRootPosition = !inversion || inversion === 'root-position';
        
        return isRootMatch && isQualityMatch && isRootPosition && isTriad;
    });
    
    const selected = candidates[0] || trackingState.chordsMeta.find(meta => extractRootFromChordName(meta.chordName) === normalizedRoot);
    return selected ? selected.chordId : null;
}

function refreshExpectedIdsFromConfig() {
    trackingState.mode = pianoMapper.config.mode;
    
    if (trackingState.mode === 'Note' && trackingState.noteIdByPitchClass.size > 0) {
        const upPitch = getPitchClassFromNote(pianoMapper.config.upNote);
        const downPitch = getPitchClassFromNote(pianoMapper.config.downNote);
        trackingState.expectedIds.up = upPitch !== null ? (trackingState.noteIdByPitchClass.get(upPitch) ?? null) : null;
        trackingState.expectedIds.down = downPitch !== null ? (trackingState.noteIdByPitchClass.get(downPitch) ?? null) : null;
    } else if (trackingState.mode === 'Chord' && trackingState.chordsMeta.length > 0) {
        trackingState.expectedIds.up = findChordIdForConfig(pianoMapper.config.upChord, pianoMapper.config.upChordType);
        trackingState.expectedIds.down = findChordIdForConfig(pianoMapper.config.downChord, pianoMapper.config.downChordType);
    } else {
        trackingState.expectedIds.up = null;
        trackingState.expectedIds.down = null;
    }
}

async function configureTrackingForPiano() {
    trackingState.enabled = TRACKING_SETTINGS.enabled && usePiano;
    
    if (!trackingState.enabled) {
        trackingState.ready = false;
        return;
    }
    
    if (typeof PianoTracker === 'undefined') {
        console.warn('PianoTracker library not available. Disabling tracking.');
        trackingState.enabled = false;
        trackingState.ready = false;
        return;
    }
    
    if (!trackingState.tracker) {
        trackingState.tracker = new PianoTracker(
            TRACKING_SETTINGS.apiBaseUrl,
            TRACKING_SETTINGS.userId,
            TRACKING_SETTINGS.gameId,
            {
                batchMode: true,
                batchSize: TRACKING_SETTINGS.batchSize,
                debug: TRACKING_SETTINGS.debug
            }
        );
    }
    
    try {
        await loadTrackingReferenceData();
        refreshExpectedIdsFromConfig();
        trackingState.ready = Boolean(trackingState.expectedIds.up && trackingState.expectedIds.down);
        
        if (!trackingState.ready) {
            console.warn('Tracking reference data loaded, but expected IDs could not be resolved for the current configuration.');
        } else {
            console.log('Tracking configured. ProgressionKeyId:', trackingState.progressionKeyId);
        }
    } catch (error) {
        console.error('Failed to configure tracking:', error);
        trackingState.ready = false;
    }
}

async function loadTrackingReferenceData() {
    if (trackingState.ready && trackingState.noteIdByPitchClass.size > 0) {
        return;
    }
    
    const baseUrl = TRACKING_SETTINGS.apiBaseUrl.replace(/\/$/, '');
    const keysData = await fetchJson(`${baseUrl}/api/keys`);
    const keys = Array.isArray(keysData) ? keysData : keysData.keys || [];
    const keyEntry = keys.find(k => (k.keyName || k.name) === TRACKING_SETTINGS.keyName);
    
    if (!keyEntry) {
        throw new Error(`Key "${TRACKING_SETTINGS.keyName}" not found on API.`);
    }
    
    trackingState.keyId = keyEntry.keyId ?? keyEntry.id ?? keyEntry.KeyId ?? null;
    
    if (trackingState.keyId === null) {
        throw new Error('Could not resolve keyId for tracking.');
    }
    
    const chordsResponse = await fetchJson(`${baseUrl}/api/chords?keyId=${trackingState.keyId}`);
    const chords = Array.isArray(chordsResponse) ? chordsResponse : chordsResponse.chords || [];
    buildChordLookups(chords);
    
    await resolveProgressionKeyId(baseUrl);
}

async function resolveProgressionKeyId(baseUrl) {
    if (!TRACKING_SETTINGS.skillLevelId) {
        trackingState.progressionKeyId = null;
        return;
    }
    
    const response = await fetchJson(`${baseUrl}/api/progressions/level/${TRACKING_SETTINGS.skillLevelId}`);
    const progressions = Array.isArray(response) ? response : response.progressions || [];
    
    const targetKey = TRACKING_SETTINGS.keyName;
    let selection = null;
    
    if (TRACKING_SETTINGS.progressionPreference.requiredOnly) {
        selection = progressions.find(p => (p.keyName === targetKey || p.key === targetKey) && p.isRequired);
    }
    
    if (!selection) {
        selection = progressions.find(p => (p.keyName === targetKey || p.key === targetKey));
    }
    
    if (!selection) {
        selection = progressions[0] || null;
    }
    
    trackingState.progressionKeyId = selection ? (selection.progressionKeyId ?? selection.id ?? null) : null;
}

async function fetchJson(url) {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText} for ${url}`);
    }
    return response.json();
}

function isTrackingConfigured() {
    return trackingState.enabled && trackingState.ready && !!trackingState.tracker;
}

async function startTrackingSession() {
    if (!isTrackingConfigured()) {
        return;
    }
    
    trackingState.sequence = 0;
    trackingState.successCount = 0;
    trackingState.errorCount = 0;
    trackingState.lastPromptTimes.up = Date.now();
    trackingState.lastPromptTimes.down = Date.now();
    
    try {
        const sessionId = await trackingState.tracker.startSession(trackingState.progressionKeyId);
        trackingState.sessionActive = Boolean(sessionId);
        
        if (!trackingState.sessionActive) {
            console.warn('Tracking session did not start (sessionId was null).');
        }
    } catch (error) {
        console.error('Failed to start tracking session:', error);
        trackingState.sessionActive = false;
    }
}

async function endTrackingSession() {
    if (!trackingState.sessionActive || !trackingState.tracker) {
        trackingState.sessionActive = false;
        return;
    }
    
    trackingState.sessionActive = false;
    
    try {
        const score = Math.max(0, trackingState.successCount * 10 - trackingState.errorCount * 2);
        await trackingState.tracker.endSession(score, trackingState.successCount, trackingState.errorCount);
    } catch (error) {
        console.error('Failed to end tracking session:', error);
    } finally {
        trackingState.lastPromptTimes.up = null;
        trackingState.lastPromptTimes.down = null;
    }
}

function handlePianoAction(action, details) {
    if (!trackingState.sessionActive || !isTrackingConfigured()) {
        return;
    }
    
    const expectedId = trackingState.expectedIds[action];
    if (!expectedId) return;
    
    const playedId = lookupPlayedId(details);
    const timestamp = details?.timestamp || Date.now();
    const responseTime = computeResponseTime(action, timestamp);
    const position = ++trackingState.sequence;
    const hand = trackingState.mode === 'Note' ? 'right' : 'both';
    
    if (trackingState.mode === 'Note') {
        trackingState.tracker.trackNote(expectedId, playedId ?? null, responseTime, position, hand);
    } else {
        trackingState.tracker.trackChord(expectedId, playedId ?? null, responseTime, position, hand);
    }
    
    if (playedId !== null && playedId === expectedId) {
        trackingState.successCount += 1;
    } else {
        trackingState.errorCount += 1;
    }
}

function lookupPlayedId(details) {
    if (!details) return null;
    
    if (trackingState.mode === 'Note') {
        const midi = typeof details.triggerNote === 'number'
            ? details.triggerNote
            : (Array.isArray(details.midiNotes) && details.midiNotes.length ? details.midiNotes[0] : null);
        
        if (typeof midi !== 'number') return null;
        const pitchClass = ((Math.round(midi) % 12) + 12) % 12;
        return trackingState.noteIdByPitchClass.get(pitchClass) ?? null;
    }
    
    const midiNotes = Array.isArray(details.midiNotes) ? details.midiNotes : [];
    if (!midiNotes.length) return null;
    const signature = buildChordSignature(midiNotes);
    return trackingState.chordIdBySignature.get(signature) ?? null;
}

function computeResponseTime(action, timestamp) {
    const now = typeof timestamp === 'number' ? timestamp : Date.now();
    const previous = trackingState.lastPromptTimes[action] ?? now;
    trackingState.lastPromptTimes[action] = now;
    return Math.max(0, Math.round(now - previous));
}

// Initialize on load
init();
