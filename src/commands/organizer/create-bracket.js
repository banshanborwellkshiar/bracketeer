const parseCloseTime = (value) => {
    const match = String(value || '').trim().match(/^(\d+)\s*(m|h|d)?$/i);

    if (!match) {
        throw new Error('Time must look like 30m, 2h, or 1d.');
    }

    const amount = Number(match[1]);
    const unit = (match[2] || 'm').toLowerCase();

    const multiplier =
        unit === 'd'
            ? 86400000
            : unit === 'h'
            ? 3600000
            : 60000;

    return Date.now() + amount * multiplier;
};

export default {
    data: {
        name: 'create-bracket',
        description: 'Create a bracket tournament',
        options: [
            {
                name: 'name',
                type: 3,
                description: 'Tournament name (e.g. TMR T3 • 3PM)',
                required: true
            },
            {
                name: 'total-slots',
                type: 4,
                description: 'Total slots available',
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
                description: 'Players required per team (0 = no tags needed, just a team name)',
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
        await interaction.deferReply({ flags: 64 });
        const { requireOrganizer } = await import('../../utils/permissions.js');
        if (!await requireOrganizer(interaction, db)) return;

        try {
            const { TournamentService } = await import('../../services/tournament.js');
            const {
                getDashboardPayload,
                scheduleTournamentLock,
                closeActiveTournamentsForChannels
            } = await import('../../services/discordTournament.js');

            const service = new TournamentService(db);

            const tournamentName = interaction.options.getString('name');
            const totalSlots = interaction.options.getInteger('total-slots');
            const time = interaction.options.getString('time');
            const requiredPlayers = interaction.options.getInteger('required-players');
            const registrationChannel = interaction.options.getChannel('registration-channel');
            const slotListChannel = interaction.options.getChannel('slot-list-channel');
            const resultChannel = interaction.options.getChannel('result-channel');

            if (totalSlots < 2) {
                await interaction.editReply({
                    content: 'Total slots must be at least 2.'
                });
                return;
            }

            const closesAt = parseCloseTime(time);
            await closeActiveTournamentsForChannels(interaction.client, db, [registrationChannel.id, slotListChannel.id, resultChannel.id], 'bracket');

            // Verify bot has necessary permissions in the chosen channels
            const { verifyChannelPermissions } = await import('../../services/discordTournament.js');
            const regPerms = await verifyChannelPermissions(interaction.client, registrationChannel);
            const slotPerms = await verifyChannelPermissions(interaction.client, slotListChannel);
            const resultPerms = await verifyChannelPermissions(interaction.client, resultChannel);
            if (!regPerms.ok || !slotPerms.ok || !resultPerms.ok) {
                const missing = [
                    ...(!regPerms.ok ? regPerms.missing.map(m => `registration:${m}`) : []),
                    ...(!slotPerms.ok ? slotPerms.missing.map(m => `slotlist:${m}`) : []),
                    ...(!resultPerms.ok ? resultPerms.missing.map(m => `result:${m}`) : [])
                ];
                await interaction.editReply({ content: `❌ Missing required bot permissions: ${missing.join(', ')}` });
                return;
            }

            const tournamentId = await service.createTournament({
                name: tournamentName,
                type: 'bracket',
                slotSize: totalSlots,
                teamsPerGroup: null,
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
            const dashboardMessage = await slotListChannel.send(payload);

            await db.tournaments.update(tournamentId, {
                dashboardMessageId: dashboardMessage.id,
                dashboardChannelId: slotListChannel.id
            });

            await scheduleTournamentLock(interaction.client, db, tournamentId);

            const { EmbedBuilder } = await import('discord.js');
            const instructionsEmbed = new EmbedBuilder()
                .setColor(0xFF6600)
                .setTitle('📝 Registration Open!')
                .setDescription([
                    `**Tournament ID:** \`${tournamentId}\``,
                    `**Slots:** ${totalSlots}${requiredPlayers > 0 ? ` | **Required per team:** ${requiredPlayers} player${requiredPlayers === 1 ? '' : 's'}` : ''}`,
                    `**Closes:** <t:${Math.floor(closesAt / 1000)}:R>`,
                    '',
                    '**How to register:**',
                    requiredPlayers > 0
                        ? `Tag all ${requiredPlayers} player${requiredPlayers === 1 ? '' : 's'} + your team name in one message.`
                        : 'Just send your team name to register — no tags needed.',
                    '',
                    '**Example:**',
                    requiredPlayers > 0
                        ? `\`@player1${requiredPlayers > 1 ? ' @player2' : ''}${requiredPlayers > 2 ? ' @player3' : ''}${requiredPlayers > 3 ? ' @player4' : ''} Team Name\``
                        : '`Team Name`',
                    '',
                    '✅ = Registered | ❌ = Invalid format'
                ].join('\n'))
                .setFooter({ text: 'ACHILLES ESPORTS | One registration per team' });
            await registrationChannel.send({ embeds: [instructionsEmbed] });

            await interaction.editReply({
                content: `Tournament created! Registration is open in ${registrationChannel}, and the live dashboard is posted in ${slotListChannel}.`,
            });
        } catch (error) {
            console.error(error);
            await interaction.editReply({
                content: `❌ Error: ${error.message}`
            });
        }
    }
};