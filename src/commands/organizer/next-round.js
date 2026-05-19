export default {
    data: {
        name: 'next-round',
        description: 'Advance the active tournament to the next round',
        options: [
            {
                name: 'tournament',
                type: 3,
                description: 'Optional tournament ID or name',
                required: false
            }
        ]
    },
    async execute(interaction, db) {
        await interaction.deferReply({ flags: 64 });
        const { requireOrganizer } = await import('../../utils/permissions.js');
        if (!await requireOrganizer(interaction, db)) return;

        const { TournamentService } = await import('../../services/tournament.js');
        const { resolveTournamentId, updateTournamentDashboard } = await import('../../services/discordTournament.js');
        const { createTournamentEmbed } = await import('../../embeds/embeds.js');
        const service = new TournamentService(db);

        const tournamentInput = interaction.options.getString('tournament');
        const tournamentId = await resolveTournamentId(db, interaction.channelId, interaction.guildId, tournamentInput);

        if (!tournamentId) {
            await interaction.editReply({ content: 'No active tournament found for this channel or server.' });
            return;
        }

        try {
            const result = await service.nextRound(tournamentId);
            await updateTournamentDashboard(interaction.client, db, tournamentId);

            if (result.completed) {
                await interaction.editReply({
                    embeds: [createTournamentEmbed(
                        'Tournament Complete',
                        'All rounds have already been completed.'
                    )]
                });
            } else if (result.advanced) {
                await interaction.editReply({
                    embeds: [createTournamentEmbed(
                        'Next Round Started',
                        'New matches have been generated for the next round.'
                    )]
                });
            } else {
                await interaction.editReply({
                    embeds: [createTournamentEmbed(
                        'Waiting for Results',
                        'The current round is still pending results before advancing.'
                    )]
                });
            }
        } catch (error) {
            await interaction.editReply({ content: `Error: ${error.message}` });
        }
    }
}