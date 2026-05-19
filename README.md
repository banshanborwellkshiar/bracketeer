# ACHILLES ESPORTS Tournament Bot

A professional Discord tournament bot for ACHILLES ESPORTS with slot list management, bracket generation, and live tournament tracking.

## Features

- ✅ Tournament creation system (Single/Double Elimination, Swiss, Round Robin)
- ✅ Automatic slot list system like Quotient Bot
- ✅ Team registration system
- ✅ Player check-in system
- ✅ Automatic bracket generation
- ✅ Match reporting
- ✅ Live standings and pairings
- ✅ Reservation system
- ✅ Waiting list support
- ✅ Firebase realtime database integration

## Commands

### Admin Commands
- `/set-organizer` - Set a role as tournament organizer
- `/remove-organizer` - Remove organizer role

### Organizer Commands
- `/create-slotlist` - Create a slot list tournament (requires teams-per-group)
- `/create-bracket` - Create a bracket tournament (no teams-per-group required)
- `/delete-tournament` - Delete an active tournament
- `/reserve-slot` - Reserve a slot for a team
- `/start-tournament` - Start tournament and generate bracket
- `/next-round` - Advance to next round

### Player Commands
- `/join` - Join a tournament
- `/leave` - Leave a tournament
- `/checkin` - Check in for tournament
- `/report-result` - Report match result
- `/standings` - View tournament standings
- `/pairings` - View current round pairings
- `/bracket` - View tournament bracket
- `/live-url` - Get live viewer URL

## Setup

### Prerequisites
- Node.js 18 or higher
- Discord Bot Token
- Firebase Project

### Installation

1. Clone the repository:
```bash
git clone https://github.com/achilles-esports/tournament-bot.git
cd tournament-bot
```

2. Install dependencies:
```bash
npm install
```

3. Copy `.env.example` to `.env` and fill in your credentials:
```bash
copy .env.example .env
```

4. Edit `.env` with your Discord token and Firebase credentials

5. Start the bot:
```bash
npm start
```

### Discord Setup

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a new application and bot
3. Copy the token to your `.env` file
4. Add the bot to your server with `applications.commands` and `bot` scopes
5. Required permissions: Manage Messages, Embed Links, Read Message History, View Channels

### Firebase Setup

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create a new project
3. Enable Realtime Database
4. Generate a service account key
5. Copy credentials to `.env`

## Project Structure

```
src/
├── commands/
│   ├── admin/           # Admin commands
│   ├── tournament/      # Player tournament commands
│   └── organizer/       # Organizer commands
├── database/            # Firebase database layer
├── embeds/              # Discord embed templates
├── events/              # Discord event handlers
├── services/            # Business logic
├── utils/               # Utility functions
└── index.js             # Bot entry point
```

## Deployment

### VPS (Linux)

1. Set up Node.js 18+
2. Clone and install
3. Use PM2 for process management:
```bash
npm install -g pm2
pm2 start src/index.js --name tournament-bot
pm2 save
pm2 startup
```

### Docker

```bash
docker build -t achilles-tournament-bot .
docker run -d --restart unless-stopped --name tournament-bot achilles-tournament-bot
```

## Tournament Viewer Integration

The bot integrates with the Bracketeer viewer for live standings and pairings:

1. Deploy `viewer.html` to your web server
2. Configure Firebase database rules
3. Access via live-url command

## License

MIT License - ACHILLES ESPORTS