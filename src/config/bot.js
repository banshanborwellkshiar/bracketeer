export const config = {
    bot: {
        name: 'ACHILLES ESPORTS Tournament Bot',
        version: '2.0.0',
        prefix: '/',
        color: '#FF0000',
        emoji: 'ACHILLES'
    },
    slots: {
        sizes: [12, 24, 48, 100],
        defaultSize: 16,
        waitingListEnabled: true,
        maxWaitingList: 20
    },
    tournament: {
        formats: ['single', 'double', 'swiss', 'round-robin'],
        maxPlayers: 1000,
        minPlayers: 2
    },
    cooldowns: {
        default: 3,
        admin: 1,
        join: 10
    },
    rulebook: {
        url: 'https://www.tmresports.in/rulebook'
    },
    embed: {
        divider: '━━━━━━━━━━━━━━━━━━',
        color: '#FF6600'
    }
};