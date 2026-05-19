export default {
    data: {
        name: 'checkin',
        description: 'Check in for the active tournament in this registration channel',
        options: []
    },
    async execute(interaction, db) {
        await interaction.deferReply({ flags: 64 });
        const { checkInTournamentSlot, findChannelTournamentId, updateTournamentDashboard } = await import('../../services/discordTournament.js');
        const tournamentId = await findChannelTournamentId(db, interaction.channelId);

        if (!tournamentId) {
            await interaction.editReply({ content: 'No active tournament dashboard is attached to this channel. Use the CHECK-IN button on the tournament post.' });
            return;
        }

        try {
            const slotNumber = await checkInTournamentSlot(db, tournamentId, interaction.user.id);
            await updateTournamentDashboard(interaction.client, db, tournamentId);
            await interaction.editReply({ content: `Checked in for slot ${slotNumber}.` });
        } catch (error) {
            await interaction.editReply({ content: error.message });
        }
    }
};
