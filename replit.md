# Aviator Betting Game Clone

## Overview
This is a clone of the popular Aviator betting game. It's a browser-based game where players place bets and must cash out before the plane flies away. The multiplier increases over time, and players win based on when they cash out.

## Project Structure
- `index.html` - Main HTML file with game UI
- `script.js` - Game logic and canvas animation
- `style.css` - Styling for the game interface
- `img/` - Image assets including the plane sprite and background

## Technology Stack
- Pure HTML5, CSS3, and JavaScript
- Canvas API for animations
- No external dependencies or frameworks

## How It Works
1. Players start with a balance of €3000
2. Players can place a bet when the round is not active
3. A plane takes off and a multiplier increases from 1.00x
4. Players must cash out before the plane flies away to win
5. Winnings are calculated as: bet amount × current multiplier
6. Previous round results are displayed at the top

## Current State
- Static frontend game fully functional
- All game logic implemented in client-side JavaScript
- No backend or database (balance is not persisted)

## Recent Changes
- 2025-10-22: Initial project import and setup for Replit environment
- 2025-10-22: Configured Python HTTP server to serve static files on port 5000

## Development
The game runs on a Python HTTP server on port 5000. To start the game:
1. Run the workflow
2. Open the preview in your browser
3. Place bets and enjoy!

## User Preferences
None specified yet.
