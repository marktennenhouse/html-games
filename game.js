// Canvas setup
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// UI elements
const startScreen = document.getElementById('startScreen');
const gameOverScreen = document.getElementById('gameOverScreen');
const startButton = document.getElementById('startButton');
const restartButton = document.getElementById('restartButton');
const speedSlider = document.getElementById('speedSlider');
const speedValue = document.getElementById('speedValue');

// Game state
let gameSpeed = 1.0;
let gameRunning = false;
let animationId = null;

// Bird properties
const bird = {
    x: 80,
    y: canvas.height / 2,
    radius: 15,
    velocity: 0,
    gravity: 0.25,
    jumpStrength: -4,
    rotation: 0
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
    bird.rotation = 0;
    pipes = [];
    frameCount = 0;
}

// Update speed value display
speedSlider.addEventListener('input', (e) => {
    speedValue.textContent = parseFloat(e.target.value).toFixed(1) + 'x';
});

// Start game
startButton.addEventListener('click', () => {
    gameSpeed = parseFloat(speedSlider.value);
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

// Keyboard controls
document.addEventListener('keydown', (e) => {
    if ((e.code === 'ArrowUp' || e.code === 'Space') && gameRunning) {
        e.preventDefault();
        bird.velocity = bird.jumpStrength;
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

// Update bird physics
function updateBird() {
    bird.velocity += bird.gravity * gameSpeed;
    bird.y += bird.velocity * gameSpeed;
}

// Update pipes
function updatePipes() {
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

// Check collisions
function checkCollisions() {
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

// Initialize on load
init();
