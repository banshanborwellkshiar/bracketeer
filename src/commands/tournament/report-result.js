export default {
    data: {
        name: 'report-result',
        description: 'Report match result',
        options: [
            {
                name: 'match',
                type: 3,
                description: 'Match ID',
                required: true
            },
            {
                name: 'winner',
                type: 6,
                description: 'Winning player/team',
                required: true
            },
            {
                name: 'score',
                type: 3,
                description: 'Score (optional)',
                required: false
            }
        ]
    },
    async execute(interaction, db) {
        await interaction.deferReply({ flags: 64 });
        const { requireOrganizer } = await import('../../utils/permissions.js');
        if (!await requireOrganizer(interaction, db)) return;

        const { TournamentService } = await import('../../services/tournament.js');
        const { createTournamentEmbed } = await import('../../embeds/embeds.js');
        const service = new TournamentService(db);

        const matchId = interaction.options.getString('match');
        const winner = interaction.options.getUser('winner');
        const score = interaction.options.getString('score');

        try {
            await service.reportResult(matchId, winner.id, score ? { raw: score } : {});

            await interaction.editReply({
                embeds: [createTournamentEmbed(
                    'Result Reported',
                    `Match **${matchId}** winner: ${winner.tag}`
                )]
            });
        } catch (error) {
            await interaction.editReply({ content: `Error: ${error.message}` });
        }
    }
}