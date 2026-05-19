export default {
    data: {
        name: 'reserve-slot',
        description: 'Reserve a slot for a team in the active tournament',
        options: [
            {
                name: 'slot',
                type: 4,
                description: 'Slot number to reserve',
                required: true
            },
            {
                name: 'team',
                type: 6,
                description: 'Team captain',
                required: true
            },
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

        const { resolveTournamentId } = await import('../../services/discordTournament.js');

        const tournamentInput = interaction.options.getString('tournament');
        const slotNumber = interaction.options.getInteger('slot');
        const teamUser = interaction.options.getUser('team');

        const tournamentId = await resolveTournamentId(db, interaction.channelId, interaction.guildId, tournamentInput);
        if (!tournamentId) {
            await interaction.editReply({ content: 'Tournament not found for this channel or server.' });
            return;
        }

        await db.slotlists.reserveSlot(tournamentId, slotNumber, teamUser.id);

        await interaction.editReply({
            content: `Reserved slot ${slotNumber} for ${teamUser.tag}!`
        });
    }
}