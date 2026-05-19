export default {
    data: {
        name: 'delete-tournament',
        description: 'Delete an active tournament by ID',
        options: [
            {
                name: 'id',
                type: 3,
                description: 'Tournament ID (e.g. T1, T2, T3)',
                required: true
            }
        ]
    },

    async execute(interaction, db) {
        await interaction.deferReply({ flags: 64 });

        const tournamentId = interaction.options.getString('id').trim().toUpperCase();
        const { requireOrganizer } = await import('../../utils/permissions.js');
        if (!await requireOrganizer(interaction, db)) return;

        try {
            const tournament = await db.tournaments.get(tournamentId);
            if (!tournament) {
                await interaction.editReply({ content: `❌ Tournament \`${tournamentId}\` not found.` });
                return;
            }

            // Cancel any pending scheduled lock timer
            const { cancelTournamentLock } = await import('../../services/discordTournament.js');
            cancelTournamentLock(tournamentId);

            // Delete the dashboard embed message from the slot-list channel
            const dashboardChannelId = tournament.dashboardChannelId || tournament.slotListChannelId;
            if (tournament.dashboardMessageId && dashboardChannelId) {
                try {
                    const channel = await interaction.client.channels.fetch(dashboardChannelId).catch(() => null);
                    if (channel) {
                        const msg = await channel.messages.fetch(tournament.dashboardMessageId).catch(() => null);
                        if (msg) await msg.delete();
                        console.log(`[DELETE] Removed dashboard message ${tournament.dashboardMessageId} for ${tournamentId}`);
                    }
                } catch (err) {
                    console.warn(`[DELETE] Failed to remove dashboard message for ${tournamentId}:`, err?.message || err);
                }
            }

            // Delete matches, slotlist, and tournament from Firebase
            const allMatches = await db.base.list('matches');
            await Promise.all(
                Object.entries(allMatches || {})
                    .filter(([, m]) => m.tournamentId === tournamentId)
                    .map(([matchId]) => db.base.delete(`matches/${matchId}`))
            );
            await db.base.delete(`slotlists/${tournamentId}`);
            await db.tournaments.delete(tournamentId);
            console.log(`[DELETE] Tournament ${tournamentId} deleted by ${interaction.user.tag}`);

            await interaction.editReply({ content: `🗑️ Tournament \`${tournamentId}\` has been deleted and its slot list removed.` });
        } catch (error) {
            console.error(`[DELETE] Error deleting tournament ${tournamentId}:`, error?.message || error);
            await interaction.editReply({ content: `❌ Error: ${error.message}` });
        }
    }
}
