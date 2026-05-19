const processingUsers = new Set();

export default {
    name: 'messageCreate',

    async execute(message) {
        if (message.author?.bot) return;

        if (message.partial) {
            try {
                await message.fetch();
            } catch (err) {
                console.warn('[messageCreate] failed to fetch partial message:', err?.message || err);
                return;
            }
        }

        if (!message.content && !message.author?.bot) {
            console.warn('[messageCreate] empty message content — check Message Content Intent in Discord Developer Portal.');
            return;
        }

        const { FirebaseDB, TournamentModel, SlotListModel, MatchModel, TeamModel, PlayerModel } = await import('../database/firebase.js');
        const db = {
            base: new FirebaseDB(message.client.db),
            tournaments: new TournamentModel(new FirebaseDB(message.client.db)),
            slotlists: new SlotListModel(new FirebaseDB(message.client.db)),
            matches: new MatchModel(new FirebaseDB(message.client.db)),
            teams: new TeamModel(new FirebaseDB(message.client.db)),
            players: new PlayerModel(new FirebaseDB(message.client.db))
        };

        const userKey = `${message.author.id}:${message.channel.id}`;
        if (processingUsers.has(userKey)) return;
        processingUsers.add(userKey);

        try {
            const { findChannelTournamentId, joinTournamentSlot, updateTournamentDashboard, closeRegistration, sendRegistrationClosedNotice } = await import('../services/discordTournament.js');

            let searchChannelId = message.channel.id;
            let tournamentId = await findChannelTournamentId(db, searchChannelId, { searchFields: ['registrationChannelId'] });

            if (!tournamentId && typeof message.channel.isThread === 'function' && message.channel.isThread() && message.channel.parentId) {
                searchChannelId = message.channel.parentId;
                tournamentId = await findChannelTournamentId(db, searchChannelId, { searchFields: ['registrationChannelId'] });
            }

            if (!tournamentId) return;

            const tournament = await db.tournaments.get(tournamentId);
            if (!tournament || tournament.status !== 'registration') return;

            // Check slots availability before processing
            const slotlist = await db.slotlists.get(tournamentId);
            const availableSlot = Object.entries(slotlist?.slots || {}).find(([_, s]) => s.status === 'open' && !s.teamId);
            if (!availableSlot) {
                console.log(`[REGISTER] Tournament ${tournamentId} full — closing registration.`);
                await closeRegistration(db, tournamentId, 'full');
                await updateTournamentDashboard(message.client, db, tournamentId);
                await sendRegistrationClosedNotice(message.client, db, tournamentId);
                return;
            }

            // Extract mentioned user IDs (non-bot)
            let mentionIds = Array.from(message.mentions.users.values())
                .filter(u => !u.bot)
                .map(u => u.id);

            // Fallback: parse raw mention tokens if Discord didn't populate the collection
            if (mentionIds.length === 0) {
                const regex = /<@!?(\d+)>/g;
                let m;
                while ((m = regex.exec(message.content))) mentionIds.push(m[1]);
                mentionIds = [...new Set(mentionIds)];
            }

            // Team name: everything after stripping mention tokens; fallback to author display name
            const cleanedContent = message.content.replace(/<@!?(\d+)>/g, '').replace(/\s+/g, ' ').trim();
            const rawTeamName = cleanedContent || message.member?.displayName || message.author.username;
            const teamName = rawTeamName.slice(0, 100);

            console.log(`[REGISTER] User=${message.author.tag} channel=${searchChannelId} tournament=${tournamentId} mentions=${mentionIds.length} teamName="${teamName}"`);

            const registrationMembers = mentionIds.length > 0
                ? [...new Set(mentionIds)]
                : [];

            // Check for duplicate registration
            const existingSlot = Object.values(slotlist?.slots || {}).find(slot =>
                slot.teamId === message.author.id ||
                (Array.isArray(slot.members) && slot.members.some(id => registrationMembers.includes(id)))
            );
            if (existingSlot) {
                console.log(`[REGISTER] Duplicate — user ${message.author.id} or a member already registered in ${tournamentId}`);
                await message.react('❌').catch(() => null);
                await message.reply('❌ You or one of your team members are already registered in this tournament.').catch(() => null);
                return;
            }

            const slotNumber = await joinTournamentSlot(db, tournamentId, message.author.id, registrationMembers, teamName);
            console.log(`[REGISTER] ✅ "${teamName}" → Slot ${slotNumber} in ${tournamentId}`);

            await message.react('✅').catch(async () => {
                await message.reply(`✅ **${teamName}** registered in Slot ${slotNumber}!`).catch(() => null);
            });

            await updateTournamentDashboard(message.client, db, tournamentId).catch(err => {
                console.warn('[REGISTER] Dashboard update failed:', err?.message || err);
            });

            const updatedTournament = await db.tournaments.get(tournamentId);
            if (updatedTournament?.status === 'closed') {
                console.log(`[REGISTER] Tournament ${tournamentId} is now full — sending closed notice.`);
                await sendRegistrationClosedNotice(message.client, db, tournamentId);
            }
        } catch (error) {
            console.error('[REGISTER] Error:', error?.message || error);
            await message.react('❌').catch(() => null);
        } finally {
            processingUsers.delete(userKey);
        }
    }
};