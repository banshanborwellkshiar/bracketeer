import { Events } from 'discord.js';

const createDb = async (client) => {
    const { FirebaseDB, TournamentModel, SlotListModel, MatchModel, TeamModel, PlayerModel } = await import('../database/firebase.js');
    return {
        base: new FirebaseDB(client.db),
        tournaments: new TournamentModel(new FirebaseDB(client.db)),
        slotlists: new SlotListModel(new FirebaseDB(client.db)),
        matches: new MatchModel(new FirebaseDB(client.db)),
        teams: new TeamModel(new FirebaseDB(client.db)),
        players: new PlayerModel(new FirebaseDB(client.db))
    };
};

export default {
    name: Events.ClientReady,
    once: true,
    async execute(client) {
        const { scheduleExistingTournamentLocks } = await import('../services/discordTournament.js');
        const db = await createDb(client);

        console.log(`${client.user.tag} is ready!`);
        client.user.setActivity('/create-tournament', { type: 'Watching' });
        await scheduleExistingTournamentLocks(client, db);
    }
};
