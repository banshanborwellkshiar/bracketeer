const parseCloseTime = (value) => {
    const match = String(value || '').trim().match(/^(\d+)\s*(m|h|d)?$/i);
    if (!match) throw new Error('Time must look like 30m, 2h, or 1d.');

    const amount = Number(match[1]);
    const unit = (match[2] || 'm').toLowerCase();
    const multiplier = unit === 'd' ? 86400000 : unit === 'h' ? 3600000 : 60000;

    return Date.now() + amount * multiplier;
};

export default {
    data: {
        name: 'create-slotlist',
        description: 'Create a slot list tournament',
        options: [
            {
                name: 'total-slots',
                type: 4,
                description: 'Total slots available',
                required: true
            },
            {
                name: 'teams-per-group',
                type: 4,
                description: 'How many teams each group should contain',
                required: true
            },
            {
                name: 'time',
                type: 3,
                description: 'Registration duration, for example 30m, 2h, or 1d',
                required: true
            },
            {
                name: 'required-players',
                type: 4,
                description: 'Players required per team (0 = no tags needed)',
                required: true,
                min_value: 0
            },
            {
                name: 'registration-channel',
                type: 7,
                description: 'Channel where players register',
                required: true,
                channel_types: [0]
            },
            {
                name: 'slot-list-channel',
                type: 7,
                description: 'Channel where the live slot list dashboard is posted',
                required: true,
                channel_types: [0]
            },
            {
                name: 'result-channel',
                type: 7,
                description: 'Channel where pairings and updates are posted',
                required: true,
                channel_types: [0]
            }
        ]
    },
    async execute(interaction, db) {
        const safeReply = async (response) => {
            try {
                return await interaction.editReply(response);
            } catch (err) {
                console.warn('[create-slotlist] editReply failed, falling back to followUp:', err?.message || err);
                try {
                    return await interaction.followUp(response);
                } catch (followUpErr) {
                    console.warn('[create-slotlist] followUp failed:', followUpErr?.message || followUpErr);
                    return null;
                }
            }
        };

        await interaction.deferReply({ flags: 64 });
        const { requireOrganizer } = await import('../../utils/permissions.js');
        if (!await requireOrganizer(interaction, db)) return;
        const { TournamentService } = await import('../../services/tournament.js');
        const { getDashboardPayload, scheduleTournamentLock, closeActiveTournamentsForChannels } = await import('../../services/discordTournament.js');
        const service = new TournamentService(db);

        const totalSlots = interaction.options.getInteger('total-slots');
        const teamsPerGroup = interaction.options.getInteger('teams-per-group');
        const time = interaction.options.getString('time');
        const requiredPlayers = interaction.options.getInteger('required-players');
        const registrationChannel = interaction.options.getChannel('registration-channel');
        const slotListChannel = interaction.options.getChannel('slot-list-channel');
        const resultChannel = interaction.options.getChannel('result-channel');

        if (totalSlots < 1) {
            await safeReply({ content: 'Total slots must be at least 1 for slot list tournaments.', flags: 64 });
            return;
        }

        if (teamsPerGroup < 1 || teamsPerGroup > totalSlots) {
            await safeReply({ content: 'Teams per group must be between 1 and total slots.', flags: 64 });
            return;
        }

        try {
            const closesAt = parseCloseTime(time);
            await closeActiveTournamentsForChannels(interaction.client, db, [registrationChannel.id, slotListChannel.id, resultChannel.id], 'slot-list');
            const tournamentId = await service.createTournament({
                type: 'slot-list',
                slotSize: totalSlots,
                teamsPerGroup,
                requiredPlayers,
                closesAt,
                guildId: interaction.guildId,
                channelId: registrationChannel.id,
                registrationChannelId: registrationChannel.id,
                slotListChannelId: slotListChannel.id,
                resultChannelId: resultChannel.id,
                createdBy: interaction.user.id
            });

            const payload = await getDashboardPayload(db, tournamentId);
            const message = await slotListChannel.send(payload);

            await db.tournaments.update(tournamentId, {
                dashboardMessageId: message.id,
                dashboardChannelId: slotListChannel.id
            });

            await scheduleTournamentLock(interaction.client, db, tournamentId);

            await registrationChannel.send({
                embeds: [{
                    title: '🏆 Slot List Tournament — Now Live!',
                    description: '> Registration is **open**. Secure your slot before time runs out!',
                    color: 0x57F287,
                    fields: [
                        { name: '📥 Registration', value: `${registrationChannel}`, inline: true },
                        { name: '📋 Slot List', value: `${slotListChannel}`, inline: true },
                        { name: '🏆 Results', value: `${resultChannel}`, inline: true },
                        { name: '⏱ Closes In', value: `\`${time}\``, inline: true },
                    ],
                    footer: { text: 'Good luck to all participants!' },
                    timestamp: new Date().toISOString()
                }]
            });

            await interaction.editReply({
                content: `Tournament created! Registration is open in ${registrationChannel}, and the live dashboard is posted in ${slotListChannel}.`,
            });
        } catch (error) {
            await safeReply({ content: `Error: ${error.message}`, flags: 64 });
        }
    }
};