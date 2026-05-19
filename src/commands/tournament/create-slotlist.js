export default {
    data: {
        name: 'update-slotlist',
        description: 'Create or refresh the slot list for a tournament',
        options: [
            {
                name: 'tournament',
                type: 3,
                description: 'Tournament ID or name',
                required: true
            }
        ]
    },
    async execute(interaction, db) {
        await interaction.deferReply({ flags: 64 });
        const { getDashboardPayload } = await import('../../services/discordTournament.js');

        const safeReply = async (response) => {
            try {
                if (interaction.replied || interaction.deferred) {
                    return await interaction.followUp(response);
                }
                return await interaction.reply(response);
            } catch (err) {
                console.warn('[create-slotlist] safeReply caught error:', err?.message || err);
                try {
                    return await interaction.followUp(response);
                } catch (followUpErr) {
                    console.warn('[create-slotlist] safeReply followUp failed:', followUpErr?.message || followUpErr);
                    return null;
                }
            }
        };

        const { requireOrganizer } = await import('../../utils/permissions.js');
        if (!await requireOrganizer(interaction, db)) return;

        const tournamentId = interaction.options.getString('tournament');
        const tournament = await db.tournaments.get(tournamentId);
        const slotlist = await db.slotlists.get(tournamentId);

        if (!tournament || !slotlist) {
            await safeReply({ content: 'Tournament not found!', flags: 64 });
            return;
        }

        const { verifyChannelPermissions } = await import('../../services/discordTournament.js');
        const perms = await verifyChannelPermissions(interaction.client, interaction.channel);
        if (!perms.ok) {
            await safeReply({ content: `❌ Bot missing required permissions in this channel: ${perms.missing.join(', ')}`, flags: 64 });
            return;
        }

        const payload = await getDashboardPayload(db, tournamentId);
        const message = await interaction.channel.send(payload);

        await db.tournaments.update(tournamentId, {
            slotMessageId: message.id,
            dashboardMessageId: message.id,
            dashboardChannelId: interaction.channelId,
            slotListChannelId: interaction.channelId
        });

        await safeReply({ content: 'Discord-native tournament dashboard created.', flags: 64 });
    }
}