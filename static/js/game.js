const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

let speedX = 3;
let speedY = 1;

canvas.width = 800;
canvas.height = 250;

let x = 0;
let y = canvas.height;

let animationId = null;

let dotPath = [];
let counterDepo = [1.01, 18.45, 2.02, 5.21, 1.22, 1.25, 2.03, 4.55, 65.11, 1.03, 1.10, 3.01, 8.85, 6.95, 11.01, 2.07, 4.05, 1.51, 1.02, 1.95, 1.05, 3.99, 2.89, 4.09, 11.20, 2.55];

let playerId = localStorage.getItem('aviator_player_id');
if (!playerId) {
    playerId = 'player_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    localStorage.setItem('aviator_player_id', playerId);
}

let currentBetId = null;
let calculatedBalanceAmount = 3000;
let gameStatus = 'waiting';
let currentMultiplier = 1.0;

const image = new Image();
image.src = '/static/img/aviator_jogo.png';
image.style.minWidth = '100%';
image.style.width = '100%';

let balanceAmount = document.getElementById('balance-amount');
let betButton = document.getElementById('bet-button');
betButton.textContent = 'BET';

let lastCounters = document.getElementById('last-counters');
let inputBox = document.getElementById("bet-input");
let messageField = document.getElementById('message');

async function loadBalance() {
    try {
        const response = await fetch(`/api/player/${playerId}/balance`);
        const data = await response.json();
        calculatedBalanceAmount = data.balance;
        balanceAmount.textContent = calculatedBalanceAmount.toFixed(2).toString() + '€';
    } catch (error) {
        console.error('Error loading balance:', error);
    }
}

loadBalance();

function updateCounterDepo() {
    lastCounters.innerHTML = counterDepo.map(function (i) {
        let classNameForCounter;
        if ((i < 2.00)) {
            classNameForCounter = 'blueBorder';
        } else if ((i >= 2) && (i < 10)) {
            classNameForCounter = 'purpleBorder';
        } else {
            classNameForCounter = 'burgundyBorder';
        }
        return '<p class="' + classNameForCounter + '">' + i + '</p>';
    }).join('');
}

updateCounterDepo();

let invalidChars = ["-", "+", "e"];
inputBox.addEventListener("keydown", function (e) {
    if (invalidChars.includes(e.key)) {
        e.preventDefault();
    }
});

async function pollGameStatus() {
    try {
        const response = await fetch('/api/game/status');
        const data = await response.json();
        
        const previousStatus = gameStatus;
        gameStatus = data.status;
        currentMultiplier = data.current_multiplier || 1.0;
        
        document.getElementById('counter').textContent = currentMultiplier.toFixed(2) + 'x';
        
        if (gameStatus === 'waiting') {
            messageField.textContent = 'Place your bet';
            if (animationId) {
                cancelAnimationFrame(animationId);
                animationId = null;
            }
            resetAnimation();
        } else if (gameStatus === 'running') {
            if (previousStatus === 'waiting') {
                startAnimation();
            }
            updateAnimation();
        } else if (gameStatus === 'ended') {
            if (data.target_multiplier) {
                counterDepo.unshift(data.target_multiplier);
                updateCounterDepo();
            }
            
            if (currentBetId) {
                messageField.textContent = 'Round ended - You lost!';
                currentBetId = null;
                betButton.textContent = 'BET';
                await loadBalance();
            }
        }
        
    } catch (error) {
        console.error('Error polling game status:', error);
    }
}

function resetAnimation() {
    x = 0;
    y = canvas.height;
    dotPath = [];
    ctx.clearRect(0, 0, canvas.width, canvas.height);
}

function startAnimation() {
    resetAnimation();
    messageField.textContent = '';
    animationId = requestAnimationFrame(draw);
}

function updateAnimation() {
    const progress = (currentMultiplier - 1.0) / 9.0;
    x = progress * 800;
    y = canvas.height / 2 + 50 * Math.cos(x / 100);
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (gameStatus === 'running') {
        x += speedX;
        y = canvas.height / 2 + 50 * Math.cos(x / 100);
    }

    dotPath.push({ x: x, y: y });
    
    if (dotPath.length > 100) {
        dotPath.shift();
    }

    const canvasOffsetX = canvas.width / 2 - x;
    const canvasOffsetY = canvas.height / 2 - y;

    ctx.save();
    ctx.translate(canvasOffsetX, canvasOffsetY);

    for (let i = 1; i < dotPath.length; i++) {
        ctx.beginPath();
        ctx.strokeStyle = '#dc3545';
        ctx.moveTo(dotPath[i - 1].x, dotPath[i - 1].y);
        ctx.lineTo(dotPath[i].x, dotPath[i].y);
        ctx.stroke();
    }

    ctx.beginPath();
    ctx.fillStyle = '#dc3545';
    ctx.lineWidth = 5;
    ctx.arc(x, y, 1, 0, 2 * Math.PI);
    ctx.fill();

    if (image.complete) {
        ctx.drawImage(image, x - 28, y - 78, 185, 85);
    }

    ctx.restore();

    if (gameStatus === 'running') {
        animationId = requestAnimationFrame(draw);
    }
}

betButton.addEventListener('click', async () => {
    if (currentBetId) {
        await cashOut();
    } else {
        await placeBet();
    }
});

async function placeBet() {
    const betAmount = parseFloat(inputBox.value);

    if (!betAmount || isNaN(betAmount) || betAmount <= 0) {
        messageField.textContent = 'Please enter a valid bet amount';
        return;
    }

    if (betAmount > calculatedBalanceAmount) {
        messageField.textContent = 'Insufficient balance';
        return;
    }

    if (gameStatus !== 'waiting') {
        messageField.textContent = 'Wait for next round';
        return;
    }

    try {
        const response = await fetch(`/api/player/${playerId}/bet`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ bet_amount: betAmount })
        });

        const data = await response.json();

        if (data.success) {
            currentBetId = data.bet_id;
            calculatedBalanceAmount = data.balance;
            balanceAmount.textContent = calculatedBalanceAmount.toFixed(2).toString() + '€';
            betButton.textContent = 'CASH OUT';
            messageField.textContent = 'Bet placed! Wait for round...';
        } else {
            messageField.textContent = data.message || 'Bet failed';
        }
    } catch (error) {
        console.error('Error placing bet:', error);
        messageField.textContent = 'Error placing bet';
    }
}

async function cashOut() {
    if (!currentBetId) {
        messageField.textContent = 'No active bet';
        return;
    }

    if (gameStatus !== 'running') {
        messageField.textContent = 'Cannot cash out now';
        return;
    }

    try {
        const response = await fetch(`/api/bet/${currentBetId}/cashout`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({})
        });

        const data = await response.json();

        if (data.success) {
            calculatedBalanceAmount = data.balance;
            balanceAmount.textContent = calculatedBalanceAmount.toFixed(2).toString() + '€';

            currentBetId = null;
            betButton.textContent = 'BET';
            messageField.textContent = `Cashed out at ${data.multiplier.toFixed(2)}x! Won €${data.win_amount.toFixed(2)}`;
        } else {
            messageField.textContent = data.message || 'Cashout failed';
        }
    } catch (error) {
        console.error('Error cashing out:', error);
        messageField.textContent = 'Error cashing out';
    }
}

setInterval(pollGameStatus, 100);

messageField.textContent = 'Loading...';
