export default {
    data: {
        name: 'leave',
        description: 'Leave the active tournament in this registration channel',
        options: []
    },
    async execute(interaction, db) {
        await interaction.deferReply({ flags: 64 });
        const { findChannelTournamentId, leaveTournamentSlot, updateTournamentDashboard } = await import('../../services/discordTournament.js');
        const tournamentId = await findChannelTournamentId(db, interaction.channelId);

        if (!tournamentId) {
            await interaction.editReply({ content: 'No active tournament dashboard is attached to this channel.' });
            return;
        }

        try {
            await leaveTournamentSlot(db, tournamentId, interaction.user.id);
            await updateTournamentDashboard(interaction.client, db, tournamentId);
            await interaction.editReply({ content: 'You left the tournament.' });
        } catch (error) {
            await interaction.editReply({ content: error.message });
        }
    }
};
