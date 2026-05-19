export class FirebaseDB {
    constructor(db) {
        this.db = db;
    }

    async create(path, data, key = null) {
        const dbRef = key ? this.db.ref(`${path}/${key}`) : this.db.ref(path).push();
        await dbRef.set(data);
        return dbRef.key || key;
    }

    async read(path) {
        const snapshot = await this.db.ref(path).get();
        return snapshot.val();
    }

    async update(path, data) {
        await this.db.ref(path).update(data);
    }

    async delete(path) {
        await this.db.ref(path).remove();
    }

    async list(path) {
        const snapshot = await this.db.ref(path).get();
        return snapshot.val() || {};
    }
}

export class TournamentModel {
    constructor(db) {
        this.db = db;
    }

    async create(tournamentData) {
        const existing = await this.db.list('tournaments');
        const nums = Object.keys(existing || {})
            .map(k => { const m = k.match(/^T(\d+)$/); return m ? parseInt(m[1], 10) : 0; })
            .filter(n => n > 0);
        const nextNum = nums.length > 0 ? Math.max(...nums) + 1 : 1;
        const newId = `T${nextNum}`;
        await this.db.create('tournaments', { ...tournamentData, createdAt: Date.now() }, newId);
        return newId;
    }

    async get(id) {
        return await this.db.read(`tournaments/${id}`);
    }

    async getAll() {
        return await this.db.list('tournaments');
    }

    async update(id, data) {
        await this.db.update(`tournaments/${id}`, data);
    }

    async delete(id) {
        await this.db.delete(`tournaments/${id}`);
    }

    async getActiveByGuild(guildId) {
        const tournaments = await this.getAll();
        return Object.entries(tournaments || {})
            .filter(([_, tournament]) => tournament.guildId === guildId && tournament.status !== 'completed')
            .reduce((active, [id, tournament]) => ({ ...active, [id]: tournament }), {});
    }
}

export class SlotListModel {
    constructor(db) {
        this.db = db;
    }

    async create(tournamentId, slotSize, teamsPerGroup = slotSize) {
        const slots = {};
        for (let i = 1; i <= slotSize; i++) {
            const groupIndex = Math.floor((i - 1) / teamsPerGroup);
            const groupName = String.fromCharCode(65 + groupIndex);
            slots[i] = { teamId: null, status: 'open', checkin: false, group: groupName };
        }
        await this.db.create('slotlists', { slots, slotSize, teamsPerGroup }, tournamentId);
    }

    async get(tournamentId) {
        return await this.db.read(`slotlists/${tournamentId}`);
    }

    async update(tournamentId, data) {
        await this.db.update(`slotlists/${tournamentId}`, data);
    }

    async joinSlot(tournamentId, slotNumber, teamId, members = [], teamName = null) {
        await this.db.update(`slotlists/${tournamentId}/slots/${slotNumber}`, {
            teamId,
            status: 'filled',
            checkin: false,
            members: Array.isArray(members) ? members : [],
            teamName: teamName || null
        });
    }

    async leaveSlot(tournamentId, slotNumber) {
        await this.db.update(`slotlists/${tournamentId}/slots/${slotNumber}`, {
            teamId: null,
            status: 'open',
            checkin: false
        });
    }

    async checkin(tournamentId, slotNumber) {
        await this.db.update(`slotlists/${tournamentId}/slots/${slotNumber}`, { checkin: true });
    }

    async reserveSlot(tournamentId, slotNumber, teamId) {
        await this.db.update(`slotlists/${tournamentId}/slots/${slotNumber}`, {
            teamId,
            status: 'reserved',
            checkin: false
        });
    }
}

export class TeamModel {
    constructor(db) {
        this.db = db;
    }

    async create(teamData) {
        return await this.db.create('teams', teamData);
    }

    async get(id) {
        return await this.db.read(`teams/${id}`);
    }

    async getByCaptain(captainId) {
        const teams = await this.db.list('teams');
        return Object.entries(teams || {}).find(([_, team]) => team.captain === captainId)?.[0] || null;
    }

    async update(id, data) {
        await this.db.update(`teams/${id}`, data);
    }
}

export class MatchModel {
    constructor(db) {
        this.db = db;
    }

    async create(matchData) {
        return await this.db.create('matches', matchData);
    }

    async get(id) {
        return await this.db.read(`matches/${id}`);
    }

    async getByTournament(tournamentId) {
        const matches = await this.db.list('matches');
        return Object.entries(matches || {})
            .filter(([_, match]) => match.tournamentId === tournamentId)
            .reduce((result, [id, match]) => ({ ...result, [id]: { id, ...match } }), {});
    }

    async update(id, data) {
        await this.db.update(`matches/${id}`, data);
    }
}

export class PlayerModel {
    constructor(db) {
        this.db = db;
    }

    async create(playerData) {
        return await this.db.create('players', playerData);
    }

    async get(discordId) {
        return await this.db.read(`players/${discordId}`);
    }

    async update(discordId, data) {
        await this.db.update(`players/${discordId}`, data);
    }
}
