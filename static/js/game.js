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
let currentBetAmount = 0;
let calculatedBalanceAmount = 3000;
let gameStatus = 'waiting';
let currentMultiplier = 1.0;
let isExploding = false;
let explosionParticles = [];

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

function showResultMessage(won, amount, multiplier) {
    const resultDiv = document.createElement('div');
    resultDiv.className = won ? 'result-message win' : 'result-message loss';
    
    if (won) {
        resultDiv.innerHTML = `
            <div class="result-icon">🎉</div>
            <div class="result-title">ربح!</div>
            <div class="result-amount">+€${amount.toFixed(2)}</div>
            <div class="result-multiplier">${multiplier.toFixed(2)}x</div>
        `;
    } else {
        resultDiv.innerHTML = `
            <div class="result-icon">💥</div>
            <div class="result-title">خسارة!</div>
            <div class="result-amount">-€${amount.toFixed(2)}</div>
            <div class="result-multiplier">طار عند ${multiplier.toFixed(2)}x</div>
        `;
    }
    
    document.body.appendChild(resultDiv);
    
    setTimeout(() => {
        resultDiv.style.opacity = '0';
        setTimeout(() => resultDiv.remove(), 300);
    }, 3000);
}

function createExplosion(cx, cy) {
    isExploding = true;
    explosionParticles = [];
    
    for (let i = 0; i < 30; i++) {
        const angle = (Math.PI * 2 * i) / 30;
        const speed = 2 + Math.random() * 4;
        explosionParticles.push({
            x: cx,
            y: cy,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            life: 1.0,
            size: 3 + Math.random() * 5,
            color: ['#ff4500', '#ff6347', '#ffa500', '#ffff00'][Math.floor(Math.random() * 4)]
        });
    }
    
    animateExplosion();
}

function animateExplosion() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    const canvasOffsetX = canvas.width / 2 - x;
    const canvasOffsetY = canvas.height / 2 - y;
    
    ctx.save();
    ctx.translate(canvasOffsetX, canvasOffsetY);
    
    for (let i = 1; i < dotPath.length; i++) {
        ctx.beginPath();
        ctx.strokeStyle = '#dc3545';
        ctx.lineWidth = 2;
        ctx.moveTo(dotPath[i - 1].x, dotPath[i - 1].y);
        ctx.lineTo(dotPath[i].x, dotPath[i].y);
        ctx.stroke();
    }
    
    let allDead = true;
    for (let particle of explosionParticles) {
        if (particle.life > 0) {
            allDead = false;
            particle.x += particle.vx;
            particle.y += particle.vy;
            particle.vy += 0.1;
            particle.life -= 0.02;
            
            ctx.beginPath();
            ctx.fillStyle = particle.color;
            ctx.globalAlpha = particle.life;
            ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    
    ctx.globalAlpha = 1.0;
    ctx.restore();
    
    if (!allDead) {
        requestAnimationFrame(animateExplosion);
    } else {
        isExploding = false;
        explosionParticles = [];
    }
}

async function pollGameStatus() {
    try {
        const response = await fetch('/api/game/status');
        const data = await response.json();
        
        const previousStatus = gameStatus;
        gameStatus = data.status;
        currentMultiplier = data.current_multiplier || 1.0;
        
        document.getElementById('counter').textContent = currentMultiplier.toFixed(2) + 'x';
        
        if (gameStatus === 'waiting') {
            messageField.textContent = 'ضع رهانك';
            if (animationId) {
                cancelAnimationFrame(animationId);
                animationId = null;
            }
            if (!isExploding) {
                resetAnimation();
            }
        } else if (gameStatus === 'running') {
            if (previousStatus === 'waiting') {
                startAnimation();
            }
            updateAnimation();
        } else if (gameStatus === 'ended') {
            if (data.target_multiplier) {
                counterDepo.unshift(data.target_multiplier);
                if (counterDepo.length > 26) {
                    counterDepo.pop();
                }
                updateCounterDepo();
            }
            
            if (currentBetId && !isExploding) {
                createExplosion(x, y);
                showResultMessage(false, currentBetAmount, data.target_multiplier || currentMultiplier);
                messageField.textContent = `طار عند ${(data.target_multiplier || currentMultiplier).toFixed(2)}x - خسرت €${currentBetAmount.toFixed(2)}!`;
                currentBetId = null;
                currentBetAmount = 0;
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
    messageField.textContent = 'الطائرة تطير...';
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
        ctx.lineWidth = 2;
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
        messageField.textContent = 'الرجاء إدخال مبلغ رهان صحيح';
        return;
    }

    if (betAmount > calculatedBalanceAmount) {
        messageField.textContent = 'رصيد غير كافي';
        return;
    }

    if (gameStatus !== 'waiting') {
        messageField.textContent = 'انتظر الجولة القادمة';
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
            currentBetAmount = betAmount;
            calculatedBalanceAmount = data.balance;
            balanceAmount.textContent = calculatedBalanceAmount.toFixed(2).toString() + '€';
            betButton.textContent = 'سحب الأرباح';
            betButton.style.backgroundColor = '#30fcbe';
            messageField.textContent = `تم الرهان بمبلغ €${betAmount.toFixed(2)} - انتظر انطلاق الطائرة...`;
        } else {
            messageField.textContent = data.message || 'فشل الرهان';
        }
    } catch (error) {
        console.error('Error placing bet:', error);
        messageField.textContent = 'خطأ في وضع الرهان';
    }
}

async function cashOut() {
    if (!currentBetId) {
        messageField.textContent = 'لا يوجد رهان نشط';
        return;
    }

    if (gameStatus !== 'running') {
        messageField.textContent = 'لا يمكن السحب الآن';
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

            showResultMessage(true, data.win_amount, data.multiplier);
            
            currentBetId = null;
            currentBetAmount = 0;
            betButton.textContent = 'BET';
            betButton.style.backgroundColor = '#fb024c';
            messageField.textContent = `تم السحب عند ${data.multiplier.toFixed(2)}x! ربحت €${data.win_amount.toFixed(2)} 🎉`;
        } else {
            messageField.textContent = data.message || 'فشل السحب';
        }
    } catch (error) {
        console.error('Error cashing out:', error);
        messageField.textContent = 'خطأ في السحب';
    }
}

setInterval(pollGameStatus, 100);

messageField.textContent = 'جاري التحميل...';
