export default {
    data: {
        name: 'remove-organizer',
        description: 'Remove organizer role',
        options: [
            {
                name: 'role',
                type: 8,
                description: 'Role to remove as organizer',
                required: true
            }
        ]
    },
    async execute(interaction, db) {
        const role = interaction.options.getRole('role');

        if (!interaction.member.permissions.has('Administrator')) {
            await interaction.reply({ content: 'You need Administrator permission!', flags: 64 });
            return;
        }

        await db.base.delete(`guilds/${interaction.guildId}/organizers/${role.id}`);

        await interaction.reply({
            content: `✅ Role **${role.name}** is no longer an organizer!`
        });
    }
}