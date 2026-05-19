export const formatTime = (timestamp) => {
    const d = new Date(timestamp);
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString();
};

export const shuffleTeams = (teams) => [...teams].sort(() => Math.random() - 0.5);

export const pairTeams = (teams) => {
    const matches = [];
    for (let i = 0; i < teams.length; i += 2) {
        matches.push({
            team1: teams[i]?.id || null,
            team2: teams[i + 1]?.id || null,
            status: teams[i + 1] ? 'pending' : 'completed',
            winner: teams[i + 1] ? null : teams[i]?.id || null
        });
    }
    return matches;
};

export const generateBracket = (teams, format = 'single') => {
    if (format !== 'single') {
        return [pairTeams(shuffleTeams(teams))];
    }

    return [pairTeams(shuffleTeams(teams))];
};

export const getRoundName = (round, totalRounds = null) => {
    if (totalRounds && round === totalRounds) return 'Finals';
    if (totalRounds && round === totalRounds - 1) return 'Semi Finals';
    if (totalRounds && round === totalRounds - 2) return 'Quarter Finals';
    return `Round ${round}`;
};

export const sortMatches = (matches) => Object.values(matches || {})
    .sort((a, b) => (a.round || 0) - (b.round || 0) || (a.position || 0) - (b.position || 0) || String(a.id).localeCompare(String(b.id)));
