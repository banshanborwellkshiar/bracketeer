export default {
    data: {
        name: 'pairings',
        description: 'View current round pairings for the active tournament',
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
        const { createMatchResultButtons, createPairingsEmbed } = await import('../../embeds/embeds.js');
        const { resolveTournamentId } = await import('../../services/discordTournament.js');

        const tournamentInput = interaction.options.getString('tournament');
        const tournamentId = await resolveTournamentId(db, interaction.channelId, interaction.guildId, tournamentInput);

        if (!tournamentId) {
            await interaction.editReply({ content: 'No active tournament found for this channel or server.' });
            return;
        }

        const tournament = await db.tournaments.get(tournamentId);
        const matches = await db.matches.getByTournament(tournamentId);
        const currentRound = tournament?.currentRound || 1;
        const roundMatches = Object.values(matches || {}).filter(m => m.round === currentRound);

        if (roundMatches.length === 0) {
            await interaction.editReply({ content: 'No pairings are available yet.' });
            return;
        }

        await interaction.editReply({
            embeds: [createPairingsEmbed(roundMatches, tournament, currentRound)],
            components: createMatchResultButtons(roundMatches)
        });
    }
}
