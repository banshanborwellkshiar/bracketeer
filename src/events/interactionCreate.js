import { Events } from 'discord.js';

const createDb = async (client) => {
    const { FirebaseDB, TournamentModel, SlotListModel, MatchModel, TeamModel, PlayerModel } = await import('../database/firebase.js');
    return {
        base: new FirebaseDB(client.db),
        tournaments: new TournamentModel(new FirebaseDB(client.db)),
        slotlists: new SlotListModel(new FirebaseDB(client.db)),
        matches: new MatchModel(new FirebaseDB(client.db)),
        teams: new TeamModel(new FirebaseDB(client.db)),
        players: new PlayerModel(new FirebaseDB(client.db))
    };
};

export default {
    name: Events.InteractionCreate,
    async execute(interaction) {
        const db = await createDb(interaction.client);

        if (interaction.isButton() && interaction.customId.startsWith('tournament:')) {
            const parts = interaction.customId.split(':');
            const action = parts[1];
            const tournamentId = parts[2];

            // Reject malformed or path-traversal tournament IDs
            if (!tournamentId || !/^T\d+$/.test(tournamentId)) {
                await interaction.reply({ content: '❌ Invalid tournament reference.', flags: 64 });
                return;
            }

            console.log(`[BUTTON] action="${action}" tournament=${tournamentId} user=${interaction.user?.tag || interaction.user?.id}`);

            const ORGANIZER_ACTIONS = new Set(['publish', 'info', 'edit', 'refresh', 'start']);

            try {
                const {
                    joinTournamentSlot,
                    leaveTournamentSlot,
                    checkInTournamentSlot,
                    updateTournamentDashboard,
                    closeRegistration,
                    sendRegistrationClosedNotice
                } = await import('../services/discordTournament.js');

                // Only organizer-facing buttons require the organizer role
                if (ORGANIZER_ACTIONS.has(action)) {
                    const { isOrganizer } = await import('../utils/permissions.js');
                    if (!await isOrganizer(interaction, db)) {
                        await interaction.reply({ content: '❌ Only tournament organizers can use this button.', flags: 64 });
                        return;
                    }
                }

                if (action === 'publish') {
                    await interaction.deferReply({ flags: 64 });
                    const tournament = await db.tournaments.get(tournamentId);
                    if (!tournament) { await interaction.editReply({ content: '❌ Tournament not found.' }); return; }
                    if (tournament.status !== 'registration') { await interaction.editReply({ content: '❌ Registration is not currently open.' }); return; }
                    await closeRegistration(db, tournamentId, 'published');
                    await updateTournamentDashboard(interaction.client, db, tournamentId);
                    await sendRegistrationClosedNotice(interaction.client, db, tournamentId);
                    console.log(`[BUTTON] Tournament ${tournamentId} published/locked by ${interaction.user.id}`);
                    await interaction.editReply({ content: '📢 Registration locked and slot list published!' });
                    return;
                }

                if (action === 'info') {
                    await interaction.deferReply({ flags: 64 });
                    const tournament = await db.tournaments.get(tournamentId);
                    if (!tournament) { await interaction.editReply({ content: '❌ Tournament not found.' }); return; }
                    const slotlist = await db.slotlists.get(tournamentId);
                    const filled = Object.values(slotlist?.slots || {}).filter(s => s.teamId).length;
                    const { EmbedBuilder } = await import('discord.js');
                    const infoEmbed = new EmbedBuilder()
                        .setColor(0xFF6600)
                        .setTitle(`ℹ️ Tournament Info — ${tournamentId}`)
                        .addFields(
                            { name: 'Name', value: tournament.name || tournamentId, inline: true },
                            { name: 'Status', value: tournament.status || 'unknown', inline: true },
                            { name: 'Slots', value: `${filled} / ${slotlist?.slotSize || '?'}`, inline: true },
                            { name: 'Required Players', value: String(tournament.requiredPlayers ?? 0), inline: true },
                            { name: 'Type', value: tournament.type || 'bracket', inline: true },
                            { name: 'Closes', value: tournament.closesAt ? `<t:${Math.floor(tournament.closesAt / 1000)}:R>` : 'Manual', inline: true }
                        )
                        .setFooter({ text: 'ACHILLES ESPORTS Tournament Bot' });
                    await interaction.editReply({ embeds: [infoEmbed] });
                    return;
                }

                if (action === 'edit') {
                    const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder: ModalRowBuilder } = await import('discord.js');
                    const tournament = await db.tournaments.get(tournamentId);
                    if (!tournament) { await interaction.reply({ content: '❌ Tournament not found.', flags: 64 }); return; }
                    const slotlist = await db.slotlists.get(tournamentId);

                    const modal = new ModalBuilder()
                        .setCustomId(`edit-tournament:${tournamentId}`)
                        .setTitle('✏️ Edit Tournament');

                    modal.addComponents(
                        new ModalRowBuilder().addComponents(
                            new TextInputBuilder()
                                .setCustomId('name')
                                .setLabel('Tournament Name')
                                .setStyle(TextInputStyle.Short)
                                .setValue(tournament.name || '')
                                .setRequired(true)
                        ),
                        new ModalRowBuilder().addComponents(
                            new TextInputBuilder()
                                .setCustomId('slotSize')
                                .setLabel('Total Slots')
                                .setStyle(TextInputStyle.Short)
                                .setValue(String(slotlist?.slotSize || tournament.slotSize || ''))
                                .setRequired(true)
                        ),
                        new ModalRowBuilder().addComponents(
                            new TextInputBuilder()
                                .setCustomId('teamsPerGroup')
                                .setLabel('Teams Per Group')
                                .setStyle(TextInputStyle.Short)
                                .setValue(String(tournament.teamsPerGroup || ''))
                                .setRequired(true)
                        ),
                        new ModalRowBuilder().addComponents(
                            new TextInputBuilder()
                                .setCustomId('footerText')
                                .setLabel('Footer Message')
                                .setStyle(TextInputStyle.Short)
                                .setValue(tournament.footerText || 'ACHILLES ESPORTS • Slot list updates live')
                                .setRequired(false)
                        ),
                        new ModalRowBuilder().addComponents(
                            new TextInputBuilder()
                                .setCustomId('belowSlotsMessage')
                                .setLabel('Message Below Slots')
                                .setStyle(TextInputStyle.Paragraph)
                                .setValue(tournament.belowSlotsMessage || '')
                                .setRequired(false)
                                .setMaxLength(500)
                        )
                    );

                    await interaction.showModal(modal);
                    return;
                }

                if (action === 'refresh') {
                    await interaction.deferReply({ flags: 64 });
                    await updateTournamentDashboard(interaction.client, db, tournamentId);
                    console.log(`[BUTTON] refresh dashboard for tournament ${tournamentId} by ${interaction.user.id}`);
                    const { getDashboardPayload } = await import('../services/discordTournament.js');
                    const updatedPayload = await getDashboardPayload(db, tournamentId);
                    await interaction.editReply({ content: '', ...updatedPayload });
                    return;
                }

                if (action === 'start') {
                    await interaction.deferReply({ flags: 64 });
                    const tournament = await db.tournaments.get(tournamentId);
                    if (!tournament) { await interaction.editReply({ content: '❌ Tournament not found.' }); return; }
                    if (tournament.status === 'registration') {
                        await interaction.editReply({ content: '❌ Lock registration first using 📢 Publish before starting.' });
                        return;
                    }
                    if (tournament.status === 'active' || tournament.status === 'completed') {
                        await interaction.editReply({ content: `❌ Tournament is already ${tournament.status}.` });
                        return;
                    }
                    const { TournamentService } = await import('../services/tournament.js');
                    const { createBracketAttachment, buildTeamNamesMap } = await import('../utils/bracketRenderer.js');
                    const { sendTournamentUpdate } = await import('../services/discordTournament.js');

                    const service = new TournamentService(db);
                    await service.startTournament(tournamentId);

                    const allMatches = await db.matches.getByTournament(tournamentId);
                    const matchList = Object.values(allMatches || {});

                    const slotlist = await db.slotlists.get(tournamentId);
                    const teamNames = buildTeamNamesMap(slotlist);

                    const attachment = await createBracketAttachment(matchList, { ...tournament, id: tournamentId }, teamNames);

                    // Post bracket to slot-list channel (primary — visible to all registrants)
                    const freshTournament = await db.tournaments.get(tournamentId);
                    const slotListChannel = freshTournament?.slotListChannelId
                        ? await interaction.client.channels.fetch(freshTournament.slotListChannelId).catch(() => null)
                        : null;
                    if (slotListChannel) {
                        await slotListChannel.send({
                            content: `🏆 **${freshTournament.name || tournamentId}** — Tournament Bracket`,
                            files: [attachment]
                        });
                    }

                    // Also announce in result channel
                    await sendTournamentUpdate(interaction.client, db, tournamentId, `🏆 **Tournament ${tournamentId} has started!** Bracket posted in the slot-list channel.`);

                    await updateTournamentDashboard(interaction.client, db, tournamentId);
                    console.log(`[BUTTON] Tournament ${tournamentId} started by ${interaction.user.id}`);
                    await interaction.editReply({ content: '🏆 Tournament started! Bracket posted in the slot-list channel.' });
                    return;
                }

                if (action === 'join') {
                    await interaction.deferReply({ flags: 64 });
                    const slotNumber = await joinTournamentSlot(db, tournamentId, interaction.user.id);
                    await updateTournamentDashboard(interaction.client, db, tournamentId);
                    await interaction.editReply({ content: `You joined slot ${slotNumber}.` });
                    return;
                }

                if (action === 'leave') {
                    await interaction.deferReply({ flags: 64 });
                    const slotNumber = await leaveTournamentSlot(db, tournamentId, interaction.user.id);
                    await updateTournamentDashboard(interaction.client, db, tournamentId);
                    await interaction.editReply({ content: `You left slot ${slotNumber}.` });
                    return;
                }

                if (action === 'checkin') {
                    await interaction.deferReply({ flags: 64 });
                    const slotNumber = await checkInTournamentSlot(db, tournamentId, interaction.user.id);
                    await updateTournamentDashboard(interaction.client, db, tournamentId);
                    await interaction.editReply({ content: `Checked in for slot ${slotNumber}.` });
                    return;
                }

            } catch (error) {
                if (error.code === 10062 || error.code === 40060) return;
                console.error(`[BUTTON] Error for action "${action}" on ${tournamentId}:`, error?.message || error);
                if (interaction.deferred || interaction.replied) {
                    await interaction.editReply({ content: `❌ ${error.message}` }).catch(() => null);
                } else {
                    await interaction.reply({ content: `❌ ${error.message}`, flags: 64 }).catch(() => null);
                }
                return;
            }
        }

        if (interaction.isButton() && interaction.customId.startsWith('match:')) {
            const { TournamentService } = await import('../services/tournament.js');
            const { sendTournamentUpdate, updateTournamentDashboard } = await import('../services/discordTournament.js');
            const [, action, matchId, winnerId] = interaction.customId.split(':');

            if (action !== 'win') return;

            // Validate matchId (Firebase push key) and winnerId (Discord snowflake)
            if (!matchId || !/^[a-zA-Z0-9_-]+$/.test(matchId) || !winnerId || !/^\d+$/.test(winnerId)) {
                await interaction.reply({ content: '❌ Invalid match reference.', flags: 64 });
                return;
            }

            const { isOrganizer } = await import('../utils/permissions.js');
            if (!await isOrganizer(interaction, db)) {
                await interaction.reply({ content: '❌ Only tournament organizers can report match results.', flags: 64 });
                return;
            }

            try {
                await interaction.deferReply({ flags: 64 });
                const service = new TournamentService(db);
                const result = await service.reportResult(matchId, winnerId);
                const match = await db.matches.get(matchId);
                const tid = match.tournamentId;

                await updateTournamentDashboard(interaction.client, db, tid);

                const extra = result.completed
                    ? ` 🏆 Champion: <@${result.champion}>!`
                    : result.advanced
                        ? ' Next round generated.'
                        : '';

                await sendTournamentUpdate(interaction.client, db, tid, `✅ Match result: <@${winnerId}> won match \`${matchId}\`.${extra}`);

                // Re-post updated bracket image to slot-list channel
                try {
                    const { createBracketAttachment, buildTeamNamesMap } = await import('../utils/bracketRenderer.js');
                    const tournament = await db.tournaments.get(tid);
                    const allMatches = await db.matches.getByTournament(tid);
                    const slotlist = await db.slotlists.get(tid);
                    const teamNames = buildTeamNamesMap(slotlist);
                    const attachment = await createBracketAttachment(Object.values(allMatches || {}), { ...tournament, id: tid }, teamNames);
                    const slotListChannel = tournament?.slotListChannelId
                        ? await interaction.client.channels.fetch(tournament.slotListChannelId).catch(() => null)
                        : null;
                    if (slotListChannel) await slotListChannel.send({ content: `📊 **Updated Bracket:**`, files: [attachment] });
                } catch (bracketErr) {
                    console.warn('[MATCH] Failed to re-post bracket:', bracketErr?.message || bracketErr);
                }

                console.log(`[MATCH] Winner ${winnerId} for match ${matchId}${extra}`);
                await interaction.editReply({ content: `Result saved for match ${matchId}.${extra}` });
                return;
            } catch (error) {
                if (error.code === 10062 || error.code === 40060) return;
                if (interaction.deferred) {
                    await interaction.editReply({ content: `❌ ${error.message}` }).catch(() => null);
                } else {
                    await interaction.reply({ content: `❌ ${error.message}`, flags: 64 }).catch(() => null);
                }
                return;
            }
        }

        if (interaction.isModalSubmit() && interaction.customId.startsWith('edit-tournament:')) {
            const tournamentId = interaction.customId.split(':')[1];
            await interaction.deferReply({ flags: 64 });

            const { isOrganizer } = await import('../utils/permissions.js');
            if (!await isOrganizer(interaction, db)) {
                await interaction.editReply({ content: '❌ Only organizers can edit tournaments.' });
                return;
            }

            const name = interaction.fields.getTextInputValue('name').trim();
            const slotSize = parseInt(interaction.fields.getTextInputValue('slotSize'), 10);
            const teamsPerGroup = parseInt(interaction.fields.getTextInputValue('teamsPerGroup'), 10);
            const footerText = interaction.fields.getTextInputValue('footerText').trim();
            const belowSlotsMessage = interaction.fields.getTextInputValue('belowSlotsMessage').trim();

            if (!name || name.length > 100) { await interaction.editReply({ content: '❌ Tournament name must be 1–100 characters.' }); return; }
            if (isNaN(slotSize) || slotSize < 1 || slotSize > 500) { await interaction.editReply({ content: '❌ Total slots must be between 1 and 500.' }); return; }
            if (isNaN(teamsPerGroup) || teamsPerGroup < 1 || teamsPerGroup > slotSize) {
                await interaction.editReply({ content: '❌ Teams per group must be between 1 and total slots.' }); return;
            }
            if (footerText.length > 2048) { await interaction.editReply({ content: '❌ Footer message must be 2048 characters or fewer.' }); return; }

            const slotlist = await db.slotlists.get(tournamentId);
            const oldSlotSize = slotlist?.slotSize || 0;

            await db.tournaments.update(tournamentId, {
                name, slotSize, teamsPerGroup, status: 'registration',
                footerText: footerText || null,
                belowSlotsMessage: belowSlotsMessage || null
            });

            const slotUpdates = { slotSize, teamsPerGroup };
            if (slotSize > oldSlotSize) {
                for (let i = oldSlotSize + 1; i <= slotSize; i++) {
                    slotUpdates[`slots/${i}`] = { status: 'open', teamId: null, checkin: false, members: null };
                }
            }
            await db.slotlists.update(tournamentId, slotUpdates);

            const { updateTournamentDashboard, getDashboardPayload } = await import('../services/discordTournament.js');
            await updateTournamentDashboard(interaction.client, db, tournamentId);
            const payload = await getDashboardPayload(db, tournamentId);
            console.log(`[MODAL] Tournament ${tournamentId} edited by ${interaction.user.id} — name="${name}" slots=${slotSize} teamsPerGroup=${teamsPerGroup}`);
            await interaction.editReply({ content: '✅ Tournament updated! Registration is re-opened — use **📢 Publish** when ready.', ...payload });
            return;
        }

        if (!interaction.isChatInputCommand()) return;
        const command = interaction.client.commands.get(interaction.commandName);

        if (!command) {
            console.error(`No command matching ${interaction.commandName} was found.`);
            return;
        }

        const { cooldowns } = interaction.client;
        if (!cooldowns.has(command.data.name)) {
            cooldowns.set(command.data.name, new Map());
        }

        const now = Date.now();
        const timestamps = cooldowns.get(command.data.name);
        const cooldownAmount = (command.cooldown || 3) * 1000;

        if (timestamps.has(interaction.user.id) && now < timestamps.get(interaction.user.id) + cooldownAmount) {
            const expirationTime = timestamps.get(interaction.user.id) + cooldownAmount;
            const expiredTimestamp = Math.round(expirationTime / 1000);
            return interaction.reply({ content: `Please wait, you are on a cooldown for \`${command.data.name}\`. You can use it again <t:${expiredTimestamp}:R>.`, flags: 64 });
        }

        timestamps.set(interaction.user.id, now);
        setTimeout(() => timestamps.delete(interaction.user.id), cooldownAmount);

        try {
            await command.execute(interaction, db);
        } catch (error) {
            if (error.code === 10062 || error.code === 40060) return;
            console.error(error);
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ content: 'There was an error while executing this command!', flags: 64 }).catch(() => null);
            } else {
                await interaction.reply({ content: 'There was an error while executing this command!', flags: 64 }).catch(() => null);
            }
            return;
        }
    }
};