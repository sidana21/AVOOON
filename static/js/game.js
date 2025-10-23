const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

let speedX = 3;
let speedY = 1;

canvas.width = 800;
canvas.height = 400;

let x = 0;
let y = canvas.height;

let animationId = null;
let dotPath = [];
let counterDepo = [];
let explosionParticles = [];
let isExploding = false;

let playerId = localStorage.getItem('aviator_player_id');
if (!playerId) {
    playerId = 'player_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    localStorage.setItem('aviator_player_id', playerId);
}

let currentBetId = null;
let currentBetAmount = 0;
let calculatedBalanceAmount = 3000;
let totalWins = 0;
let totalLosses = 0;
let gameStatus = 'waiting';
let currentMultiplier = 1.0;
let betsHistory = [];

const image = new Image();
image.onload = function() {
    console.log('Plane image loaded successfully');
};
image.onerror = function() {
    console.error('Failed to load plane image');
};
image.src = '/static/img/aviator_jogo.png';

let balanceAmount = document.getElementById('balance-amount');
let totalWinsElement = document.getElementById('total-wins');
let totalLossesElement = document.getElementById('total-losses');
let betButton = document.getElementById('bet-button');
let btnText = document.getElementById('btn-text');
let lastCounters = document.getElementById('last-counters');
let inputBox = document.getElementById("bet-input");
let messageField = document.getElementById('message');
let gameStatusElement = document.getElementById('game-status');
let currentBetInfo = document.getElementById('current-bet-info');
let currentBetAmountElement = document.getElementById('current-bet-amount');
let potentialWinElement = document.getElementById('potential-win');
let betsHistoryElement = document.getElementById('bets-history');

btnText.textContent = 'وضع رهان';

async function loadBalance() {
    try {
        const response = await fetch(`/api/player/${playerId}/balance`);
        const data = await response.json();
        calculatedBalanceAmount = data.balance;
        updateUI();
    } catch (error) {
        console.error('Error loading balance:', error);
    }
}

function updateUI() {
    balanceAmount.textContent = calculatedBalanceAmount.toFixed(2) + ' €';
    totalWinsElement.textContent = totalWins.toFixed(2) + ' €';
    totalLossesElement.textContent = totalLosses.toFixed(2) + ' €';
}

loadBalance();

function updateCounterDepo() {
    if (counterDepo.length === 0) {
        lastCounters.innerHTML = '<p style="color: #a0a0a0;">لا توجد جولات سابقة</p>';
        return;
    }
    
    lastCounters.innerHTML = counterDepo.slice(0, 10).map(function (i) {
        let classNameForCounter;
        if ((i < 2.00)) {
            classNameForCounter = 'blueBorder';
        } else if ((i >= 2) && (i < 10)) {
            classNameForCounter = 'purpleBorder';
        } else {
            classNameForCounter = 'burgundyBorder';
        }
        return '<p class="' + classNameForCounter + '">' + i.toFixed(2) + 'x</p>';
    }).join('');
}

function addBetToHistory(bet) {
    betsHistory.unshift(bet);
    if (betsHistory.length > 10) {
        betsHistory.pop();
    }
    updateBetsTable();
}

function updateBetsTable() {
    if (betsHistory.length === 0) {
        betsHistoryElement.innerHTML = '<tr class="no-bets"><td colspan="5">لا توجد رهانات بعد</td></tr>';
        return;
    }
    
    betsHistoryElement.innerHTML = betsHistory.map(bet => {
        const time = new Date(bet.time).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
        const statusClass = bet.status === 'won' ? 'status-won' : 'status-lost';
        const statusText = bet.status === 'won' ? 'ربح' : 'خسارة';
        const multiplierText = bet.multiplier ? bet.multiplier.toFixed(2) + 'x' : '-';
        const winText = bet.status === 'won' ? '+' + bet.win.toFixed(2) + ' €' : '-' + bet.amount.toFixed(2) + ' €';
        
        return `
            <tr>
                <td>${time}</td>
                <td>${bet.amount.toFixed(2)} €</td>
                <td>${multiplierText}</td>
                <td class="${statusClass}">${winText}</td>
                <td class="${statusClass}">${statusText}</td>
            </tr>
        `;
    }).join('');
}

updateCounterDepo();

let invalidChars = ["-", "+", "e"];
inputBox.addEventListener("keydown", function (e) {
    if (invalidChars.includes(e.key)) {
        e.preventDefault();
    }
});

inputBox.addEventListener("input", function() {
    if (currentBetId && gameStatus === 'running') {
        const potentialWin = currentBetAmount * currentMultiplier;
        potentialWinElement.textContent = potentialWin.toFixed(2) + ' €';
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
        
        if (currentBetId && gameStatus === 'running') {
            const potentialWin = currentBetAmount * currentMultiplier;
            potentialWinElement.textContent = potentialWin.toFixed(2) + ' €';
        }
        
        if (gameStatus === 'waiting') {
            gameStatusElement.textContent = 'في انتظار الرهانات...';
            gameStatusElement.style.color = '#a0a0a0';
            
            if (isExploding) {
                return;
            }
            
            if (animationId) {
                cancelAnimationFrame(animationId);
                animationId = null;
            }
            resetAnimation();
        } else if (gameStatus === 'running') {
            gameStatusElement.textContent = '🚀 الطائرة في الجو!';
            gameStatusElement.style.color = '#4caf50';
            if (previousStatus === 'waiting' || !animationId) {
                startAnimation();
            }
        } else if (gameStatus === 'ended') {
            gameStatusElement.textContent = '💥 انفجرت!';
            gameStatusElement.style.color = '#ff0000';
            
            if (data.target_multiplier) {
                counterDepo.unshift(data.target_multiplier);
                updateCounterDepo();
            }
            
            if (!isExploding) {
                isExploding = true;
                console.log('=== EXPLOSION TRIGGERED! ===', 'position:', x, y);
                createExplosion(x, y);
            }
            
            if (currentBetId) {
                const lostAmount = currentBetAmount;
                totalLosses += lostAmount;
                
                addBetToHistory({
                    time: new Date(),
                    amount: currentBetAmount,
                    multiplier: data.target_multiplier,
                    win: 0,
                    status: 'lost'
                });
                
                showMessage('انفجرت! الطائرة طارت عند ' + data.target_multiplier.toFixed(2) + 'x 💥', 'error');
                currentBetId = null;
                currentBetAmount = 0;
                btnText.textContent = 'وضع رهان';
                betButton.classList.remove('cashout');
                currentBetInfo.style.display = 'none';
                updateUI();
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
    explosionParticles = [];
    isExploding = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
}

function createExplosion(centerX, centerY) {
    console.log('Creating explosion at', centerX, centerY);
    explosionParticles = [];
    const particleCount = 80;
    
    for (let i = 0; i < particleCount; i++) {
        const angle = (Math.PI * 2 * i) / particleCount;
        const speed = 3 + Math.random() * 6;
        
        explosionParticles.push({
            x: centerX,
            y: centerY,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed - 2,
            life: 1.0,
            size: 4 + Math.random() * 8,
            color: ['#ff0000', '#ff6b00', '#ffaa00', '#ffff00'][Math.floor(Math.random() * 4)]
        });
    }
    
    if (animationId) {
        cancelAnimationFrame(animationId);
    }
    animationId = requestAnimationFrame(drawExplosion);
}

function drawExplosion() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    const canvasOffsetX = canvas.width / 2 - x;
    const canvasOffsetY = canvas.height / 2 - y;

    ctx.save();
    ctx.translate(canvasOffsetX, canvasOffsetY);
    
    for (let i = 1; i < dotPath.length; i++) {
        ctx.beginPath();
        const gradient = ctx.createLinearGradient(dotPath[i - 1].x, dotPath[i - 1].y, dotPath[i].x, dotPath[i].y);
        gradient.addColorStop(0, '#dc3545');
        gradient.addColorStop(1, '#ff6b6b');
        ctx.strokeStyle = gradient;
        ctx.lineWidth = 4;
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
            particle.vy += 0.15;
            particle.life -= 0.015;
            
            ctx.globalAlpha = particle.life;
            ctx.fillStyle = particle.color;
            ctx.beginPath();
            ctx.arc(particle.x, particle.y, particle.size * particle.life, 0, Math.PI * 2);
            ctx.fill();
            
            ctx.shadowBlur = 15;
            ctx.shadowColor = particle.color;
            ctx.fill();
            ctx.shadowBlur = 0;
        }
    }
    
    ctx.globalAlpha = 1.0;
    
    const explosionSize = Math.max(1 - (explosionParticles[0]?.life || 0), 0.2);
    ctx.font = `bold ${60 * explosionSize}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('💥', x, y);
    
    ctx.font = 'bold 30px Arial';
    ctx.fillStyle = '#ff0000';
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 3;
    ctx.strokeText('BOOM!', x, y + 40);
    ctx.fillText('BOOM!', x, y + 40);
    
    ctx.restore();
    
    if (!allDead) {
        animationId = requestAnimationFrame(drawExplosion);
    } else {
        animationId = null;
        setTimeout(() => {
            isExploding = false;
        }, 100);
    }
}

function startAnimation() {
    console.log('Starting animation, gameStatus:', gameStatus);
    resetAnimation();
    if (!animationId) {
        animationId = requestAnimationFrame(draw);
    }
}

function draw() {
    if (gameStatus !== 'running') {
        animationId = null;
        return;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    x += speedX;
    y = canvas.height / 2 + 50 * Math.cos(x / 100);

    dotPath.push({ x: x, y: y });
    
    if (dotPath.length > 200) {
        dotPath.shift();
    }

    const canvasOffsetX = canvas.width / 2 - x;
    const canvasOffsetY = canvas.height / 2 - y;

    ctx.save();
    ctx.translate(canvasOffsetX, canvasOffsetY);

    for (let i = 1; i < dotPath.length; i++) {
        ctx.beginPath();
        const gradient = ctx.createLinearGradient(dotPath[i - 1].x, dotPath[i - 1].y, dotPath[i].x, dotPath[i].y);
        gradient.addColorStop(0, '#dc3545');
        gradient.addColorStop(1, '#ff6b6b');
        ctx.strokeStyle = gradient;
        ctx.lineWidth = 4;
        ctx.moveTo(dotPath[i - 1].x, dotPath[i - 1].y);
        ctx.lineTo(dotPath[i].x, dotPath[i].y);
        ctx.stroke();
    }

    ctx.beginPath();
    ctx.fillStyle = '#dc3545';
    ctx.arc(x, y, 6, 0, 2 * Math.PI);
    ctx.fill();

    if (image.complete && image.naturalWidth > 0) {
        ctx.drawImage(image, x - 50, y - 50, 100, 50);
    } else {
        ctx.fillStyle = '#FFD700';
        ctx.font = 'bold 30px Arial';
        ctx.fillText('✈', x - 15, y + 10);
    }

    ctx.restore();

    if (gameStatus === 'running') {
        animationId = requestAnimationFrame(draw);
    } else {
        animationId = null;
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
        showMessage('الرجاء إدخال مبلغ رهان صحيح', 'error');
        return;
    }

    if (betAmount > calculatedBalanceAmount) {
        showMessage('الرصيد غير كافٍ', 'error');
        return;
    }

    if (gameStatus !== 'waiting') {
        showMessage('انتظر الجولة التالية', 'info');
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
            
            currentBetAmountElement.textContent = betAmount.toFixed(2) + ' €';
            potentialWinElement.textContent = betAmount.toFixed(2) + ' €';
            currentBetInfo.style.display = 'block';
            
            btnText.textContent = 'سحب النقود';
            betButton.classList.add('cashout');
            showMessage('تم وضع الرهان! انتظر بدء الجولة...', 'success');
            updateUI();
        } else {
            showMessage(data.message || 'فشل وضع الرهان', 'error');
        }
    } catch (error) {
        console.error('Error placing bet:', error);
        showMessage('خطأ في وضع الرهان', 'error');
    }
}

async function cashOut() {
    if (!currentBetId) {
        showMessage('لا يوجد رهان نشط', 'error');
        return;
    }

    if (gameStatus !== 'running') {
        showMessage('لا يمكن السحب الآن', 'error');
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
            const winAmount = data.win_amount;
            const profit = winAmount - currentBetAmount;
            
            calculatedBalanceAmount = data.balance;
            totalWins += profit;
            
            addBetToHistory({
                time: new Date(),
                amount: currentBetAmount,
                multiplier: data.multiplier,
                win: winAmount,
                status: 'won'
            });

            currentBetId = null;
            currentBetAmount = 0;
            btnText.textContent = 'وضع رهان';
            betButton.classList.remove('cashout');
            currentBetInfo.style.display = 'none';
            
            showMessage(`تهانينا! ربحت ${winAmount.toFixed(2)} € عند ${data.multiplier.toFixed(2)}x 🎉`, 'success');
            updateUI();
        } else {
            showMessage(data.message || 'فشل السحب', 'error');
        }
    } catch (error) {
        console.error('Error cashing out:', error);
        showMessage('خطأ في السحب', 'error');
    }
}

function showMessage(text, type) {
    messageField.textContent = text;
    messageField.className = '';
    if (type === 'success') {
        messageField.classList.add('message-success');
    } else if (type === 'error') {
        messageField.classList.add('message-error');
    } else {
        messageField.classList.add('message-info');
    }
}

setInterval(pollGameStatus, 100);

showMessage('جارٍ التحميل...', 'info');
