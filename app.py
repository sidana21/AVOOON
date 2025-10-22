from flask import Flask, render_template, request, jsonify, session, redirect, url_for
from flask_cors import CORS
import sqlite3
from datetime import datetime
import hashlib
import secrets
import os

app = Flask(__name__)
app.secret_key = os.environ.get('SECRET_KEY', secrets.token_hex(32))
CORS(app)

DB_NAME = 'aviator_game.db'

def get_db():
    conn = sqlite3.connect(DB_NAME)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS admins (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS players (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            player_id TEXT UNIQUE NOT NULL,
            balance REAL DEFAULT 3000,
            total_bets INTEGER DEFAULT 0,
            total_wins INTEGER DEFAULT 0,
            total_losses INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            last_active TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS game_rounds (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            multiplier REAL NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS bets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            player_id TEXT NOT NULL,
            round_id INTEGER,
            bet_amount REAL NOT NULL,
            cash_out_multiplier REAL,
            win_amount REAL,
            status TEXT DEFAULT 'pending',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (player_id) REFERENCES players(player_id),
            FOREIGN KEY (round_id) REFERENCES game_rounds(id)
        )
    ''')
    
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS settings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            key TEXT UNIQUE NOT NULL,
            value TEXT NOT NULL
        )
    ''')
    
    cursor.execute("SELECT COUNT(*) as count FROM admins")
    admin_count = cursor.fetchone()['count']
    
    if admin_count == 0:
        password_hash = hashlib.sha256('admin123'.encode()).hexdigest()
        cursor.execute("INSERT INTO admins (username, password) VALUES (?, ?)", ('admin', password_hash))
    
    cursor.execute("SELECT COUNT(*) as count FROM settings WHERE key = 'min_bet'")
    if cursor.fetchone()['count'] == 0:
        cursor.execute("INSERT INTO settings (key, value) VALUES ('min_bet', '1')")
        cursor.execute("INSERT INTO settings (key, value) VALUES ('max_bet', '1000')")
        cursor.execute("INSERT INTO settings (key, value) VALUES ('starting_balance', '3000')")
    
    conn.commit()
    conn.close()

@app.route('/')
def index():
    return render_template('game.html')

@app.route('/admin')
def admin_login():
    if 'admin_logged_in' in session:
        return redirect(url_for('admin_dashboard'))
    return render_template('admin_login.html')

@app.route('/admin/login', methods=['POST'])
def admin_login_post():
    data = request.json
    username = data.get('username')
    password = data.get('password')
    
    if not username or not password:
        return jsonify({'success': False, 'message': 'Username and password required'}), 400
    
    password_hash = hashlib.sha256(password.encode()).hexdigest()
    
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM admins WHERE username = ? AND password = ?", (username, password_hash))
    admin = cursor.fetchone()
    conn.close()
    
    if admin:
        session['admin_logged_in'] = True
        session['admin_username'] = username
        return jsonify({'success': True, 'message': 'Login successful'})
    else:
        return jsonify({'success': False, 'message': 'Invalid credentials'}), 401

@app.route('/admin/logout')
def admin_logout():
    session.pop('admin_logged_in', None)
    session.pop('admin_username', None)
    return redirect(url_for('admin_login'))

@app.route('/admin/dashboard')
def admin_dashboard():
    if 'admin_logged_in' not in session:
        return redirect(url_for('admin_login'))
    return render_template('admin_dashboard.html')

@app.route('/api/stats')
def get_stats():
    if 'admin_logged_in' not in session:
        return jsonify({'error': 'Unauthorized'}), 401
    
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute("SELECT COUNT(*) as count FROM players")
    total_players = cursor.fetchone()['count']
    
    cursor.execute("SELECT COUNT(*) as count FROM bets")
    total_bets = cursor.fetchone()['count']
    
    cursor.execute("SELECT SUM(bet_amount) as total FROM bets")
    total_wagered = cursor.fetchone()['total'] or 0
    
    cursor.execute("SELECT SUM(win_amount) as total FROM bets WHERE status = 'won'")
    total_winnings = cursor.fetchone()['total'] or 0
    
    cursor.execute("SELECT COUNT(*) as count FROM game_rounds")
    total_rounds = cursor.fetchone()['count']
    
    conn.close()
    
    return jsonify({
        'total_players': total_players,
        'total_bets': total_bets,
        'total_wagered': round(total_wagered, 2),
        'total_winnings': round(total_winnings, 2),
        'total_rounds': total_rounds,
        'house_profit': round(total_wagered - total_winnings, 2)
    })

@app.route('/api/players')
def get_players():
    if 'admin_logged_in' not in session:
        return jsonify({'error': 'Unauthorized'}), 401
    
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT player_id, balance, total_bets, total_wins, total_losses, 
               created_at, last_active 
        FROM players 
        ORDER BY last_active DESC
    """)
    players = [dict(row) for row in cursor.fetchall()]
    conn.close()
    
    return jsonify({'players': players})

@app.route('/api/bets')
def get_bets():
    if 'admin_logged_in' not in session:
        return jsonify({'error': 'Unauthorized'}), 401
    
    limit = request.args.get('limit', 50, type=int)
    
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT b.*, gr.multiplier as round_multiplier
        FROM bets b
        LEFT JOIN game_rounds gr ON b.round_id = gr.id
        ORDER BY b.created_at DESC
        LIMIT ?
    """, (limit,))
    bets = [dict(row) for row in cursor.fetchall()]
    conn.close()
    
    return jsonify({'bets': bets})

@app.route('/api/rounds')
def get_rounds():
    if 'admin_logged_in' not in session:
        return jsonify({'error': 'Unauthorized'}), 401
    
    limit = request.args.get('limit', 50, type=int)
    
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT * FROM game_rounds 
        ORDER BY created_at DESC 
        LIMIT ?
    """, (limit,))
    rounds = [dict(row) for row in cursor.fetchall()]
    conn.close()
    
    return jsonify({'rounds': rounds})

@app.route('/api/player/<player_id>/balance', methods=['GET'])
def get_player_balance(player_id):
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute("SELECT balance FROM players WHERE player_id = ?", (player_id,))
    player = cursor.fetchone()
    
    if not player:
        cursor.execute("SELECT value FROM settings WHERE key = 'starting_balance'")
        starting_balance = float(cursor.fetchone()['value'])
        cursor.execute("INSERT INTO players (player_id, balance) VALUES (?, ?)", (player_id, starting_balance))
        conn.commit()
        balance = starting_balance
    else:
        balance = player['balance']
    
    conn.close()
    return jsonify({'balance': balance})

@app.route('/api/player/<player_id>/bet', methods=['POST'])
def place_bet(player_id):
    data = request.json
    bet_amount = data.get('bet_amount')
    
    if not bet_amount or bet_amount <= 0:
        return jsonify({'success': False, 'message': 'Invalid bet amount'}), 400
    
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute("SELECT balance FROM players WHERE player_id = ?", (player_id,))
    player = cursor.fetchone()
    
    if not player or player['balance'] < bet_amount:
        conn.close()
        return jsonify({'success': False, 'message': 'Insufficient balance'}), 400
    
    new_balance = player['balance'] - bet_amount
    cursor.execute("UPDATE players SET balance = ?, last_active = CURRENT_TIMESTAMP WHERE player_id = ?", 
                   (new_balance, player_id))
    
    cursor.execute("INSERT INTO bets (player_id, bet_amount, status) VALUES (?, ?, 'active')",
                   (player_id, bet_amount))
    bet_id = cursor.lastrowid
    
    cursor.execute("UPDATE players SET total_bets = total_bets + 1 WHERE player_id = ?", (player_id,))
    
    conn.commit()
    conn.close()
    
    return jsonify({'success': True, 'balance': new_balance, 'bet_id': bet_id})

@app.route('/api/bet/<int:bet_id>/cashout', methods=['POST'])
def cashout_bet(bet_id):
    data = request.json
    multiplier = data.get('multiplier')
    
    if not multiplier or multiplier < 1:
        return jsonify({'success': False, 'message': 'Invalid multiplier'}), 400
    
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute("SELECT * FROM bets WHERE id = ? AND status = 'active'", (bet_id,))
    bet = cursor.fetchone()
    
    if not bet:
        conn.close()
        return jsonify({'success': False, 'message': 'Bet not found or already cashed out'}), 404
    
    win_amount = bet['bet_amount'] * multiplier
    
    cursor.execute("UPDATE bets SET cash_out_multiplier = ?, win_amount = ?, status = 'won' WHERE id = ?",
                   (multiplier, win_amount, bet_id))
    
    cursor.execute("UPDATE players SET balance = balance + ?, total_wins = total_wins + 1 WHERE player_id = ?",
                   (win_amount, bet['player_id']))
    
    cursor.execute("SELECT balance FROM players WHERE player_id = ?", (bet['player_id'],))
    new_balance = cursor.fetchone()['balance']
    
    conn.commit()
    conn.close()
    
    return jsonify({'success': True, 'win_amount': win_amount, 'balance': new_balance})

@app.route('/api/round/end', methods=['POST'])
def end_round():
    data = request.json
    multiplier = data.get('multiplier')
    
    if not multiplier or multiplier < 1:
        return jsonify({'success': False, 'message': 'Invalid multiplier'}), 400
    
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute("INSERT INTO game_rounds (multiplier) VALUES (?)", (multiplier,))
    round_id = cursor.lastrowid
    
    cursor.execute("UPDATE bets SET status = 'lost', round_id = ? WHERE status = 'active'", (round_id,))
    
    cursor.execute("SELECT player_id FROM bets WHERE status = 'lost' AND round_id = ?", (round_id,))
    lost_players = cursor.fetchall()
    
    for player in lost_players:
        cursor.execute("UPDATE players SET total_losses = total_losses + 1 WHERE player_id = ?", 
                       (player['player_id'],))
    
    conn.commit()
    conn.close()
    
    return jsonify({'success': True, 'round_id': round_id})

if __name__ == '__main__':
    init_db()
    app.run(host='0.0.0.0', port=3000, debug=True)
