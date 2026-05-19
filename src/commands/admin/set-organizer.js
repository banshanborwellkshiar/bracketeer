export default {
    data: {
        name: 'set-organizer',
        description: 'Set a role as tournament organizer',
        options: [
            {
                name: 'role',
                type: 8,
                description: 'Role to set as organizer',
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

        await db.base.update(`guilds/${interaction.guildId}/organizers/${role.id}`, { roleId: role.id });

        await interaction.reply({
            content: `✅ Role **${role.name}** is now an organizer!`
        });
    }
}