export default {
    data: {
        name: 'list-tournaments',
        description: 'List active tournaments',
        options: []
    },
    async execute(interaction, db) {
        const tournaments = await db.tournaments.getActiveByGuild(interaction.guildId);

        if (!tournaments || Object.keys(tournaments).length === 0) {
            await interaction.reply({ content: 'No active tournaments found!', flags: 64 });
            return;
        }

        const list = Object.entries(tournaments).map(([id, tournament]) =>
            `\`${id}\` - **${tournament.name}** (${tournament.format}) - ${tournament.status}`
        ).join('\n');

        await interaction.reply({
            content: `Active Tournaments:\n${list}`
        });
    }
};
