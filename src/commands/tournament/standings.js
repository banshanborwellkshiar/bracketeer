export default {
    data: {
        name: 'standings',
        description: 'View standings for the active tournament',
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
        const { TournamentService } = await import('../../services/tournament.js');
        const { createStandingsEmbed } = await import('../../embeds/embeds.js');
        const { resolveTournamentId } = await import('../../services/discordTournament.js');
        const service = new TournamentService(db);

        const tournamentInput = interaction.options.getString('tournament');
        const tournamentId = await resolveTournamentId(db, interaction.channelId, interaction.guildId, tournamentInput);
        if (!tournamentId) {
            await interaction.editReply({ content: 'No active tournament found for this channel or server.' });
            return;
        }

        const tournament = await db.tournaments.get(tournamentId);
        const standings = await service.updateStandings(tournamentId);

        await interaction.editReply({
            embeds: [createStandingsEmbed(standings, tournament)]
        });
    }
}