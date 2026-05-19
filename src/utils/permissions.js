export async function isOrganizer(interaction, db) {
    if (!interaction.member) return false;
    if (interaction.member.permissions.has('Administrator')) return true;
    const organizerRoles = await db.base.read(`guilds/${interaction.guildId}/organizers`);
    return Object.keys(organizerRoles || {}).some(roleId =>
        interaction.member.roles.cache.has(roleId)
    );
}

export async function requireOrganizer(interaction, db) {
    const allowed = await isOrganizer(interaction, db);
    if (!allowed) {
        await interaction.editReply({ content: '❌ Only tournament organizers can use this command. Ask an admin to run `/set-organizer` to assign the organizer role.' });
    }
    return allowed;
}
