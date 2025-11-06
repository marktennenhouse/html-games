// Canvas setup
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// UI elements
const pianoConfigScreen = document.getElementById('pianoConfigScreen');
const startScreen = document.getElementById('startScreen');
const gameOverScreen = document.getElementById('gameOverScreen');
const startButton = document.getElementById('startButton');
const restartButton = document.getElementById('restartButton');
const speedSlider = document.getElementById('speedSlider');
const speedValue = document.getElementById('speedValue');

// Piano input mapper
const pianoMapper = new PianoInputMapper({
    mode: 'Note',
    upNote: 'C',
    downNote: 'G'
});
let usePiano = false;

// Game state
let gameSpeed = 1.0;
let gameRunning = false;
let animationId = null;
let practiceMode = false;

// Practice mode scroll control
let pipeScrollEnabled = true;
let lastCollisionX = 0;
let clearThreshold = 60; // Distance to move forward to resume scrolling

// Bird properties - Momentum-based physics
const bird = {
    x: 80,
    y: canvas.height / 2,
    radius: 15,
    velocity: 0,
    velocityX: 0,         // Horizontal velocity for practice mode bounces
    gravity: 0.15,        // Light gravity when no input
    upThrust: -0.5,       // Upward acceleration
    downThrust: 0.5,      // Downward acceleration
    maxVelocity: 5,       // Speed cap
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
    lastCollisionX = 0;
}

// Update speed value display
speedSlider.addEventListener('input', (e) => {
    speedValue.textContent = parseFloat(e.target.value).toFixed(1) + 'x';
});

// Start game
startButton.addEventListener('click', () => {
    gameSpeed = parseFloat(speedSlider.value);
    practiceMode = document.getElementById('practiceMode').checked;
    startScreen.classList.add('hidden');
    gameRunning = true;
    init();
    gameLoop();
});

// Restart game
restartButton.addEventListener('click', () => {
    gameOverScreen.classList.add('hidden');
    startScreen.classList.remove('hidden');
    init();
});

// Keyboard controls - Track up/down state
document.addEventListener('keydown', (e) => {
    if (!gameRunning) return;
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
                pipeScrollEnabled = false;
                lastCollisionX = bird.x;
            }
            
            // Bottom pipe collision
            if (bird.y + bird.radius > pipe.bottom && bird.y < pipe.bottom + bird.radius * 2) {
                bird.y = pipe.bottom - bird.radius;
                bird.velocity = -Math.abs(bird.velocity) * bounceDampening;
                
                // Pause scrolling and mark collision
                pipeScrollEnabled = false;
                lastCollisionX = bird.x;
            }
        }
        
        // Left side of pipe collision (bird hits front of pipe)
        if (bird.x + bird.radius > pipe.x && 
            bird.x < pipe.x + pipeWidth / 2 &&
            (bird.y < pipe.top || bird.y > pipe.bottom)) {
            
            const centerY = (pipe.top + pipe.bottom) / 2;
            
            // Check if hitting from the left side
            if (bird.x < pipe.x + bird.radius) {
                bird.x = pipe.x - bird.radius - 1;
                bird.velocityX = -Math.abs(bird.velocityX || 2) * bounceDampening;
                bird.velocity *= bounceDampening;
                
                // Pause scrolling and mark collision
                pipeScrollEnabled = false;
                lastCollisionX = bird.x;
            }
        }
    });
}

// Check if bird has moved past collision point to resume scrolling
function checkScrollResume() {
    if (practiceMode && !pipeScrollEnabled) {
        // Resume scrolling if bird has moved forward past the collision point
        if (bird.x > lastCollisionX + clearThreshold) {
            pipeScrollEnabled = true;
        }
    }
}

// Game over
function gameOver() {
    gameRunning = false;
    cancelAnimationFrame(animationId);
    gameOverScreen.classList.remove('hidden');
}

// Game loop
function gameLoop() {
    if (!gameRunning) return;
    
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
    pianoConfigScreen.classList.add('hidden');
    startScreen.classList.remove('hidden');
    console.log('Using keyboard input');
});

// Initialize on load
init();
