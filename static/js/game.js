const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

let speedX = 3;
let speedY = 1;

canvas.width = 800;
canvas.height = 250;

let x = 0;
let y = canvas.height;

let animationId = requestAnimationFrame(draw);

let dotPath = [];
let counter = 1.0;
let multiplier = 0;
let counterDepo = [1.01, 18.45, 2.02, 5.21, 1.22, 1.25, 2.03, 4.55, 65.11, 1.03, 1.10, 3.01, 8.85, 6.95, 11.01, 2.07, 4.05, 1.51, 1.02, 1.95, 1.05, 3.99, 2.89, 4.09, 11.20, 2.55];
let randomStop = Math.random() * (10 - 0.1) + 0.8;
let cashedOut = false;
let placedBet = false;
let isFlying = true;

let playerId = localStorage.getItem('aviator_player_id');
if (!playerId) {
    playerId = 'player_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    localStorage.setItem('aviator_player_id', playerId);
}

let currentBetId = null;
let calculatedBalanceAmount = 3000;

const image = new Image();
image.src = '/static/img/aviator_jogo.png';
image.style.minWidth = '100%';
image.style.width = '100%';

let balanceAmount = document.getElementById('balance-amount');
let betButton = document.getElementById('bet-button');
betButton.textContent = 'Bet';

let lastCounters = document.getElementById('last-counters');
let counterItem = lastCounters.getElementsByTagName('p');
let classNameForCounter = '';

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
        if ((i < 2.00)) {
            classNameForCounter = 'blueBorder';
        } else if ((i >= 2) && (i < 10)) {
            classNameForCounter = 'purpleBorder';
        } else classNameForCounter = 'burgundyBorder';

        return '<p' + ' class=' + classNameForCounter + '>' + i + '</p>'
    }).join('');
}

let inputBox = document.getElementById("bet-input");
let invalidChars = ["-", "+", "e"];

inputBox.addEventListener("keydown", function (e) {
    if (invalidChars.includes(e.key)) {
        e.preventDefault();
    }
});

let messageField = document.getElementById('message');
messageField.textContent = 'Wait for the next round';

function draw() {
    counter += 0.001;
    document.getElementById('counter').textContent = counter.toFixed(2) + 'x';

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    updateCounterDepo();

    x += speedX;
    if (counter < randomStop) {
        y -= speedY;
        y = canvas.height / 2 + 50 * Math.cos(x / 100);
        isFlying = true;
    } else {
        x = 0;
        y = 0;
        isFlying = false;
    }

    if (counter >= randomStop) {
        messageField.textContent = 'Place your bet';
        cancelAnimationFrame(animationId);

        const finalMultiplier = parseFloat(counter.toFixed(2));
        counterDepo.unshift(finalMultiplier);

        endRound(finalMultiplier);

        setTimeout(() => {
            randomStop = Math.random() * (10 - 0.1) + 0.8;
            counter = 1.0;
            x = canvas.width / 2;
            y = canvas.height / 2;
            dotPath = [];
            cashedOut = false;
            isFlying = true;
            messageField.textContent = '';

            if (!placedBet && cashedOut) {
                betButton.textContent = 'Bet';
            }

            animationId = requestAnimationFrame(draw);
        }, 8000);

        return;
    }

    dotPath.push({ x: x, y: y });

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

    ctx.drawImage(image, x - 28, y - 78, 185, 85);
    ctx.restore();

    animationId = requestAnimationFrame(draw);
}

draw();

betButton.addEventListener('click', () => {
    if (placedBet) {
        cashOut();
    } else {
        placeBet();
    }
    if (!placedBet && !isFlying) {
        messageField.textContent = 'Place your bet';
    }
});

async function placeBet() {
    const betAmount = parseFloat(inputBox.value);

    if (placedBet || !betAmount || isNaN(betAmount) || betAmount <= 0 || isFlying || betAmount > calculatedBalanceAmount) {
        messageField.textContent = 'Wait for the next round';
        return;
    }

    if ((counter >= randomStop) && !isFlying && (betAmount <= calculatedBalanceAmount)) {
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
                betButton.textContent = 'Cash Out';
                placedBet = true;
                messageField.textContent = 'Placed Bet';
            } else {
                messageField.textContent = data.message || 'Bet failed';
            }
        } catch (error) {
            console.error('Error placing bet:', error);
            messageField.textContent = 'Error placing bet';
        }
    } else {
        if (isFlying) {
            messageField.textContent = 'Wait for the next round';
        }
    }
}

async function cashOut() {
    if (cashedOut || !currentBetId) {
        messageField.textContent = 'Wait for the next round';
        return;
    }

    if ((counter < randomStop)) {
        try {
            const response = await fetch(`/api/bet/${currentBetId}/cashout`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ multiplier: parseFloat(counter.toFixed(2)) })
            });

            const data = await response.json();

            if (data.success) {
                calculatedBalanceAmount = data.balance;
                balanceAmount.textContent = calculatedBalanceAmount.toFixed(2).toString() + '€';

                cashedOut = true;
                placedBet = false;
                currentBetId = null;
                betButton.textContent = 'Bet';
                messageField.textContent = `Bet cashed out: €${data.win_amount.toFixed(2)}`;
            } else {
                messageField.textContent = data.message || 'Cashout failed';
            }
        } catch (error) {
            console.error('Error cashing out:', error);
            messageField.textContent = 'Error cashing out';
        }
    } else {
        messageField.textContent = "Can't cash out now";
    }
}

async function endRound(multiplier) {
    try {
        await fetch('/api/round/end', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ multiplier: multiplier })
        });

        if (placedBet) {
            placedBet = false;
            currentBetId = null;
            betButton.textContent = 'Bet';
            messageField.textContent = 'Round ended - You lost';
            
            await loadBalance();
        }
    } catch (error) {
        console.error('Error ending round:', error);
    }
}
