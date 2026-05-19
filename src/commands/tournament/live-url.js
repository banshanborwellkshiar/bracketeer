export default {
    data: {
        name: 'live-url',
        description: 'Get live tournament viewer URL',
        options: [
            {
                name: 'tournament',
                type: 3,
                description: 'Tournament ID or name',
                required: true
            }
        ]
    },
    async execute(interaction, _db) {
        const tournamentId = interaction.options.getString('tournament');
        const viewerUrl = `https://your-viewer-url.com?data=${tournamentId}`;

        await interaction.reply({
            content: `Live Tournament Viewer:\n${viewerUrl}\n\nThe Discord dashboard is the primary tournament view; this URL is optional for public viewing or archives.`
        });
    }
};
