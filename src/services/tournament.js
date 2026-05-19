import { generateBracket, pairTeams, shuffleTeams } from '../utils/bracket.js';

export class TournamentService {
    constructor(db) {
        this.db = db;
    }

    async createTournament(data) {
        const tournamentType = data.type || 'slot-list';
        const slotSize = data.slotSize || 16;
        const teamsPerGroup = data.teamsPerGroup || slotSize;
        const closesAt = data.closesAt || null;
        const tournament = {
            name: data.name || `ACHILLES ${tournamentType === 'bracket' ? 'Bracket' : 'Slot List'}`,
            description: data.description || '',
            type: tournamentType,
            format: tournamentType === 'bracket' ? 'single' : 'slot-list',
            guildId: data.guildId,
            channelId: data.channelId,
            registrationChannelId: data.registrationChannelId || data.channelId,
            slotListChannelId: data.slotListChannelId || data.registrationChannelId || data.channelId,
            resultChannelId: data.resultChannelId || data.channelId,
            slotSize,
            teamsPerGroup,
            requiredPlayers: data.requiredPlayers ?? 1,
            status: 'registration',
            currentRound: 1,
            totalRounds: null,
            champion: null,
            closesAt,
            lockedAt: null,
            lockReason: null,
            createdAt: Date.now(),
            createdBy: data.createdBy,
            settings: data.settings || {}
        };

        const id = await this.db.tournaments.create(tournament);
        await this.initializeSlotList(id, tournament.slotSize, tournament.teamsPerGroup);
        return id;
    }

    async initializeSlotList(tournamentId, slotSize, teamsPerGroup = slotSize) {
        await this.db.slotlists.create(tournamentId, slotSize, teamsPerGroup);
    }

    getRegisteredTeams(slotlist) {
        return Object.entries(slotlist?.slots || {})
            .filter(([_, slot]) => slot.teamId)
            .map(([slotNumber, slot]) => ({ id: slot.teamId, slotNumber: Number(slotNumber) }));
    }

    async startTournament(tournamentId) {
        const tournament = await this.db.tournaments.get(tournamentId);
        const slotlist = await this.db.slotlists.get(tournamentId);

        if (!tournament || !slotlist) throw new Error('Tournament not found');
        if (!['registration', 'checkin', 'closed'].includes(tournament.status)) throw new Error('Tournament has already started');
        if (tournament.type !== 'bracket') throw new Error('This tournament is a slot list and does not need a bracket');

        const teams = this.getRegisteredTeams(slotlist);
        if (teams.length < (tournament.settings?.minTeams || 2)) {
            throw new Error('Not enough teams to start tournament');
        }

        const shuffledTeams = shuffleTeams(teams);
        const bracket = generateBracket(shuffledTeams, tournament.format);
        const totalRounds = Math.ceil(Math.log2(teams.length));
        const firstRound = await this.createMatches(tournamentId, bracket[0], 1);

        await this.db.tournaments.update(tournamentId, {
            status: tournament.status === 'checkin' ? 'checkin' : 'active',
            bracket,
            currentRound: 1,
            totalRounds,
            startedAt: Date.now()
        });

        await this.advanceIfRoundComplete(tournamentId, 1);
        return firstRound;
    }

    async lockRegistration(tournamentId, reason = 'manual') {
        const tournament = await this.db.tournaments.get(tournamentId);
        const slotlist = await this.db.slotlists.get(tournamentId);

        if (!tournament || !slotlist) throw new Error('Tournament not found');
        if (tournament.status !== 'registration') {
            return { locked: false, reason: tournament.lockReason || reason, matches: [] };
        }

        await this.db.tournaments.update(tournamentId, {
            status: 'checkin',
            lockedAt: Date.now(),
            lockReason: reason
        });

        let matches = [];
        if (tournament.type === 'bracket' && this.getRegisteredTeams(slotlist).length >= (tournament.settings?.minTeams || 2)) {
            matches = await this.startTournament(tournamentId);
        }

        return { locked: true, reason, matches };
    }

    async shouldLockRegistration(tournamentId) {
        const tournament = await this.db.tournaments.get(tournamentId);
        const slotlist = await this.db.slotlists.get(tournamentId);

        if (!tournament || !slotlist || tournament.status !== 'registration') return null;

        const filledSlots = Object.values(slotlist.slots || {}).filter((slot) => slot.teamId).length;
        const requiredPlayers = tournament.requiredPlayers || slotlist.slotSize;
        
        if (filledSlots >= requiredPlayers) return 'required-players';
        if (filledSlots >= slotlist.slotSize) return 'slots-full';
        if (tournament.closesAt && Date.now() >= tournament.closesAt) return 'time-expired';

        return null;
    }

    async createMatches(tournamentId, roundMatches, round) {
        const created = [];

        for (const [index, match] of roundMatches.entries()) {
            const matchId = await this.db.matches.create({
                tournamentId,
                round,
                position: index + 1,
                team1: match.team1,
                team2: match.team2,
                winner: match.winner || null,
                score: {},
                status: match.status || 'pending',
                createdAt: Date.now()
            });
            created.push({ id: matchId, ...match, round, position: index + 1 });
        }

        return created;
    }

    async reportResult(matchId, winnerId, score = {}) {
        const match = await this.db.matches.get(matchId);
        if (!match) throw new Error('Match not found');
        if (![match.team1, match.team2].includes(winnerId)) throw new Error('Winner must be one of the match teams');

        await this.db.matches.update(matchId, {
            winner: winnerId,
            score,
            status: 'completed',
            completedAt: Date.now()
        });

        const progression = await this.advanceIfRoundComplete(match.tournamentId, match.round);
        const standings = await this.updateStandings(match.tournamentId);
        return { standings, ...progression };
    }

    async advanceIfRoundComplete(tournamentId, round) {
        const tournament = await this.db.tournaments.get(tournamentId);
        const matches = await this.db.matches.getByTournament(tournamentId);
        const roundMatches = Object.values(matches || {})
            .filter((match) => match.round === round)
            .sort((a, b) => (a.position || 0) - (b.position || 0));

        if (!roundMatches.length || roundMatches.some((match) => match.status !== 'completed' || !match.winner)) {
            return { advanced: false, completed: false, champion: null, matches: [] };
        }

        const nextRoundExists = Object.values(matches || {}).some((match) => match.round === round + 1);
        if (nextRoundExists) {
            return { advanced: false, completed: false, champion: null, matches: [] };
        }

        const winners = roundMatches.map((match) => ({ id: match.winner }));
        if (winners.length === 1) {
            await this.db.tournaments.update(tournamentId, {
                status: 'completed',
                champion: winners[0].id,
                completedAt: Date.now()
            });
            return { advanced: false, completed: true, champion: winners[0].id, matches: [] };
        }

        const nextRoundMatches = pairTeams(winners);
        const created = await this.createMatches(tournamentId, nextRoundMatches, round + 1);

        await this.db.tournaments.update(tournamentId, {
            currentRound: round + 1,
            totalRounds: Math.max(tournament?.totalRounds || 0, round + 1)
        });

        await this.advanceIfRoundComplete(tournamentId, round + 1);
        return { advanced: true, completed: false, champion: null, matches: created };
    }

    async updateStandings(tournamentId) {
        const matches = await this.db.matches.getByTournament(tournamentId);
        const tournament = await this.db.tournaments.get(tournamentId);
        const slotlist = await this.db.slotlists.get(tournamentId);
        const standings = {};

        for (const team of this.getRegisteredTeams(slotlist)) {
            standings[team.id] = { wins: 0, losses: 0 };
        }

        Object.values(matches || {}).forEach((match) => {
            if (match.status !== 'completed' || !match.winner) return;

            standings[match.winner] ||= { wins: 0, losses: 0 };
            standings[match.winner].wins += 1;

            const loser = match.team1 === match.winner ? match.team2 : match.team1;
            if (loser) {
                standings[loser] ||= { wins: 0, losses: 0 };
                standings[loser].losses += 1;
            }
        });

        const sorted = Object.entries(standings)
            .sort((a, b) => b[1].wins - a[1].wins || a[1].losses - b[1].losses)
            .map(([teamId, stats]) => ({ teamId, ...stats, champion: tournament?.champion === teamId }));

        return sorted;
    }

    async nextRound(tournamentId) {
        const tournament = await this.db.tournaments.get(tournamentId);
        if (!tournament) throw new Error('Tournament not found');
        return await this.advanceIfRoundComplete(tournamentId, tournament.currentRound || 1);
    }
}
