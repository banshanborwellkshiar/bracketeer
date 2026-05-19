export default {
    data: {
        name: 'start-tournament',
        description: 'Start the active tournament for this server or channel',
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

        const tournament = await db.tournaments.get(tournamentId);
        try {
            if (tournament.type === 'slot-list') {
                const result = await service.lockRegistration(tournamentId);
                await updateTournamentDashboard(interaction.client, db, tournamentId);
                await interaction.editReply({
                    embeds: [createTournamentEmbed(
                        'Tournament Locked',
                        `Registration locked for **${tournament.name || tournamentId}**. The tournament is now in check-in mode.`
                    )]
                });
                return;
            }

            const bracket = await service.startTournament(tournamentId);
            await updateTournamentDashboard(interaction.client, db, tournamentId);

            await interaction.editReply({
                embeds: [createTournamentEmbed(
                    'Tournament Started',
                    `Tournament **${tournament.name || tournamentId}** has started!\nRound 1 pairings are now live.`
                )]
            });
        } catch (error) {
            await interaction.editReply({ content: `Error: ${error.message}` });
        }
    }
}