export async function getDashboardPayload(db, tournamentId) {
    const { createProfessionalSlotListEmbed, createSlotListButtons } = await import('../embeds/embeds.js');
    const tournament = await db.tournaments.get(tournamentId);
    const slotlist = await db.slotlists.get(tournamentId);

    const embed = createProfessionalSlotListEmbed(tournament, slotlist, tournamentId);
    const buttonRow = createSlotListButtons(tournamentId, tournament?.status || 'registration');

    return { embeds: [embed], components: [buttonRow] };
}

export function createRegistrationClosedEmbed(tournament, slotlist) {
    const slotSize = slotlist?.slotSize || 0;
    const filledTeams = Object.values(slotlist?.slots || {}).filter(s => s.teamId).length;
    return {
        embeds: [
            {
                title: '⛔ Registration Closed',
                description: `Registration for **${tournament?.name || 'this tournament'}** is now closed.`,
                color: 0xFF0000,
                fields: [
                    { name: 'Status', value: `${tournament?.status || 'closed'}`, inline: true },
                    { name: 'Slots', value: `${filledTeams} / ${slotSize}`, inline: true },
                    { name: 'Details', value: 'The slot list is full or registration has ended.' }
                ],
                timestamp: new Date().toISOString()
            }
        ]
    };
}

export async function sendRegistrationClosedNotice(client, db, tournamentId) {
    try {
        const tournament = await db.tournaments.get(tournamentId);
        if (!tournament) {
            console.warn(`[notification] Tournament ${tournamentId} not found for closed notice.`);
            return;
        }

        const slotlist = await db.slotlists.get(tournamentId);
        const { EmbedBuilder } = await import('discord.js');

        const closedEmbed = new EmbedBuilder()
            .setColor(0xFF0000)
            .setTitle('⛔ REGISTRATION CLOSED!!')
            .setDescription(
                `**${tournament.name || tournamentId}** registration is now closed.\n` +
                `All slots have been filled. Good luck to all registered teams!`
            )
            .addFields(
                { name: 'Status', value: '🔴 Closed', inline: true },
                { name: 'Slots', value: `${Object.values(slotlist?.slots || {}).filter(s => s.teamId).length} / ${slotlist?.slotSize || '?'}`, inline: true }
            )
            .setFooter({ text: 'ACHILLES ESPORTS Tournament Bot' })
            .setTimestamp();

        // Post to registration channel only
        if (tournament.registrationChannelId) {
            const regChannel = await client.channels.fetch(tournament.registrationChannelId).catch(() => null);
            if (regChannel) {
                await regChannel.send({ embeds: [closedEmbed] });
                console.log(`[notification] Sent registration closed embed to registration channel for ${tournamentId}`);
            }
        }

        // Update the dashboard embed in place
        await safeUpdateTournamentDashboard(client, db, tournamentId);
    } catch (error) {
        console.warn('[notification] Failed to send registration closed notice:', error?.message || error);
    }
}

export async function verifyChannelPermissions(client, channel, required = [
    'ViewChannel',
    'SendMessages',
    'ReadMessageHistory',
    'AddReactions',
    'EmbedLinks',
    'AttachFiles'
]) {
    if (!channel) return { ok: false, missing: required };
    const { PermissionFlagsBits } = await import('discord.js');
    const permsBits = required.map(name => PermissionFlagsBits[name]).filter(Boolean);
    const me = client.user;
    try {
        const channelPerms = channel.permissionsFor(me);
        if (!channelPerms) {
            console.warn(`[permissions] Unable to resolve permissions for bot in channel ${channel.id}`);
            return { ok: false, missing: required };
        }
        const missing = required.filter((name, i) => !channelPerms.has(permsBits[i]));
        if (missing.length > 0) {
            console.warn(`[permissions] Bot missing permissions in channel ${channel.id}: ${missing.join(', ')}`);
            return { ok: false, missing };
        }
        console.log(`[permissions] Channel ${channel.id} has required permissions.`);
        return { ok: true, missing: [] };
    } catch (err) {
        console.warn(`[permissions] Error checking permissions for channel ${channel.id}:`, err?.message || err);
        return { ok: false, missing: required };
    }
}

const tournamentLockTimers = new Map();

export function cancelTournamentLock(tournamentId) {
    const timer = tournamentLockTimers.get(tournamentId);
    if (timer) {
        clearTimeout(timer);
        tournamentLockTimers.delete(tournamentId);
        console.log(`[schedule] Cancelled lock timer for tournament ${tournamentId}`);
    }
}

export async function scheduleTournamentLock(client, db, tournamentId) {
    const tournament = await db.tournaments.get(tournamentId);
    if (!tournament?.closesAt) return;

    const delay = tournament.closesAt - Date.now();
    console.log(`[schedule] Tournament ${tournamentId} closesAt=${tournament.closesAt} now=${Date.now()} delay=${delay}`);
    if (delay <= 0) {
        console.log(`[schedule] Tournament ${tournamentId} close time already passed; closing now.`);
        await closeRegistration(db, tournamentId, 'scheduled');
        await safeUpdateTournamentDashboard(client, db, tournamentId);
        return;
    }

    const timer = setTimeout(async () => {
        console.log(`[schedule] Closing tournament ${tournamentId} after delay.`);
        tournamentLockTimers.delete(tournamentId);
        await closeRegistration(db, tournamentId, 'scheduled');
        await safeUpdateTournamentDashboard(client, db, tournamentId);
        await sendRegistrationClosedNotice(client, db, tournamentId);
    }, delay);
    tournamentLockTimers.set(tournamentId, timer);
}

export async function closeRegistration(db, tournamentId, reason = 'manual') {
    try {
        await db.tournaments.update(tournamentId, { status: 'closed', lockedAt: Date.now(), lockReason: reason });
        console.log(`[close] Tournament ${tournamentId} closed (reason=${reason})`);
    } catch (err) {
        console.warn(`[close] Failed to close tournament ${tournamentId}:`, err?.message || err);
        throw err;
    }
}

export async function ensureTournamentAutomation(client, db, tournamentId) {
    const tournament = await db.tournaments.get(tournamentId);
    if (!tournament?.automationSetup) {
        const channel = await client.channels.fetch(tournament.registrationChannelId);
        if (channel) {
            await channel.send(`Tournament **${tournamentId}** registration is now open! Use the REGISTER button on the tournament post to enter.`);
        }
        await db.tournaments.update(tournamentId, { automationSetup: true });
    }
}

export async function joinTournamentSlot(db, tournamentId, userId, members = [], teamName = null) {
    const tournament = await db.tournaments.get(tournamentId);
    if (!tournament) throw new Error('Tournament not found.');
    if (tournament.status !== 'registration') {
        throw new Error('Registration is closed. This tournament is no longer accepting new players.');
    }

    const slotlist = await db.slotlists.get(tournamentId);
    if (!slotlist) throw new Error('Tournament slot list not found.');

    const alreadyRegistered = Object.values(slotlist.slots || {}).some(slot =>
        slot.teamId === userId || (Array.isArray(slot.members) && slot.members.includes(userId))
    );
    if (alreadyRegistered) {
        throw new Error('You are already registered in this tournament.');
    }

    const availableSlot = Object.entries(slotlist.slots || {})
        .find(([_, s]) => s.status === 'open' && !s.teamId)?.[0];

    if (!availableSlot) {
        throw new Error('No open slots are available. The tournament is full or all remaining slots are reserved.');
    }

    await db.slotlists.joinSlot(tournamentId, parseInt(availableSlot), userId, members, teamName);
    console.log(`[registration] User ${userId} registered slot ${availableSlot} for tournament ${tournamentId} teamName=${teamName}`);

    const updatedSlotlist = await db.slotlists.get(tournamentId);
    const remainingOpenSlots = Object.entries(updatedSlotlist.slots || {}).filter(([_, s]) => !s.teamId).length;
    if (remainingOpenSlots === 0) {
        await closeRegistration(db, tournamentId, 'full');
        const closedTournament = await db.tournaments.get(tournamentId);
        console.log(`[registration] Tournament ${tournamentId} is full and registration has been closed. status=${closedTournament?.status} registrationChannelId=${closedTournament?.registrationChannelId}`);
    }

    return parseInt(availableSlot);
}

export async function leaveTournamentSlot(db, tournamentId, userId) {
    const tournament = await db.tournaments.get(tournamentId);
    if (!tournament) throw new Error('Tournament not found.');
    if (!['registration', 'checkin'].includes(tournament.status)) {
        throw new Error('You can only leave during registration or check-in.');
    }

    const slotlist = await db.slotlists.get(tournamentId);
    if (!slotlist) throw new Error('Tournament slot list not found.');

    const slotNumber = Object.entries(slotlist.slots || {})
        .find(([_, s]) => s.teamId === userId || (Array.isArray(s.members) && s.members.includes(userId)))?.[0];

    if (slotNumber) {
        await db.slotlists.update(tournamentId, {
            [`slots/${slotNumber}/teamId`]: null,
            [`slots/${slotNumber}/status`]: 'open',
            [`slots/${slotNumber}/checkin`]: false,
            [`slots/${slotNumber}/members`]: null
        });
        return parseInt(slotNumber);
    }

    throw new Error('You are not registered in this tournament.');
}

export async function checkInTournamentSlot(db, tournamentId, userId) {
    const tournament = await db.tournaments.get(tournamentId);
    if (!tournament) throw new Error('Tournament not found.');
    if (tournament.status !== 'checkin') {
        throw new Error('Check-in is only available during the tournament check-in phase.');
    }

    const slotlist = await db.slotlists.get(tournamentId);
    if (!slotlist) throw new Error('Tournament slot list not found.');

    const slotNumber = Object.entries(slotlist.slots || {})
        .find(([_, s]) => s.teamId === userId || (Array.isArray(s.members) && s.members.includes(userId)))?.[0];

    if (!slotNumber) {
        throw new Error('You are not registered in this tournament.');
    }

    await db.slotlists.checkin(tournamentId, parseInt(slotNumber));
    return parseInt(slotNumber);
}

function isActiveTournament(tournament) {
    return ['registration', 'checkin', 'closed', 'active'].includes(tournament?.status)
        && tournament?.lockReason !== 'superseded';
}

export async function closeActiveTournamentsForChannels(client, db, channelIds = [], type = null) {
    const tournaments = await db.tournaments.getAll();
    const entries = Object.entries(tournaments || {});

    await Promise.all(entries.map(async ([id, tournament]) => {
        const channels = [tournament.registrationChannelId, tournament.slotListChannelId, tournament.resultChannelId];
        if (!channelIds.some(idToMatch => idToMatch && channels.includes(idToMatch))) return;
        if (type && tournament.type !== type) return;

        console.log(`[cleanup] Deleting old tournament ${id} (superseded by new creation)`);

        // Cancel any pending lock timer
        cancelTournamentLock(id);

        // Delete dashboard message from Discord
        if (client && tournament.slotListChannelId && tournament.dashboardMessageId) {
            try {
                const ch = await client.channels.fetch(tournament.slotListChannelId).catch(() => null);
                if (ch) {
                    const msg = await ch.messages.fetch(tournament.dashboardMessageId).catch(() => null);
                    if (msg) await msg.delete().catch(() => null);
                }
            } catch { /* ignore */ }
        }

        // Delete matches for this tournament
        const allMatches = await db.base.list('matches');
        await Promise.all(
            Object.entries(allMatches || {})
                .filter(([, m]) => m.tournamentId === id)
                .map(([matchId]) => db.base.delete(`matches/${matchId}`))
        );

        // Delete slotlist and tournament
        await db.base.delete(`slotlists/${id}`).catch(() => null);
        await db.tournaments.delete(id).catch(() => null);

        console.log(`[cleanup] Deleted tournament ${id} and all associated data.`);
    }));
}

export async function findChannelTournamentId(db, channelId, options = {}) {
    const tournaments = await db.tournaments.getAll();
    const entries = Object.entries(tournaments || {});
    const searchFields = Array.isArray(options.searchFields) && options.searchFields.length > 0
        ? options.searchFields
        : ['registrationChannelId', 'slotListChannelId', 'resultChannelId'];

    console.log(`[find] Searching tournaments for channel ${channelId}. total tournaments=${entries.length} searchFields=${searchFields.join(',')}`);

    const channelMatches = entries
        .filter(([, tournament]) => isActiveTournament(tournament))
        .filter(([_, tournament]) =>
            searchFields.some(field => tournament[field] === channelId)
        )
        .sort(([, a], [, b]) => (b.createdAt || 0) - (a.createdAt || 0));

    if (channelMatches.length === 0) {
        const inactive = entries.filter(([id, t]) => [t.registrationChannelId, t.slotListChannelId, t.resultChannelId].includes(channelId));
        if (inactive.length > 0) {
            console.log(`[find] Found ${inactive.length} tournament(s) linked to channel ${channelId} but none are active. Details:`);
            for (const [id, t] of inactive) {
                console.log(`  - ${id}: status=${t.status} createdAt=${t.createdAt}`);
            }
        } else {
            console.log('[find] No tournaments linked to this channel.');
        }
    } else {
        console.log(`[find] Found ${channelMatches.length} active tournament(s) for channel ${channelId}, selecting ${channelMatches[0][0]}`);
    }

    return channelMatches[0]?.[0] || null;
}

export async function resolveTournamentId(db, channelId, guildId, tournamentInput = null) {
    const tournaments = await db.tournaments.getAll();
    const entries = Object.entries(tournaments || {});

    if (tournamentInput) {
        const normalized = tournamentInput.trim().toLowerCase();
        const byId = entries.find(([id]) => id === tournamentInput);
        if (byId && isActiveTournament(byId[1])) return byId[0];

        const byName = entries.find(([, tournament]) => tournament?.name?.toLowerCase() === normalized && isActiveTournament(tournament));
        if (byName) return byName[0];
    }

    const channelMatches = entries
        .filter(([, tournament]) => isActiveTournament(tournament))
        .filter(([_, tournament]) =>
            tournament.registrationChannelId === channelId ||
            tournament.slotListChannelId === channelId ||
            tournament.resultChannelId === channelId
        )
        .sort(([, a], [, b]) => (b.createdAt || 0) - (a.createdAt || 0));

    if (channelMatches.length > 0) return channelMatches[0][0];

    const activeTournaments = entries
        .filter(([, tournament]) => tournament?.guildId === guildId && isActiveTournament(tournament))
        .sort(([, a], [, b]) => {
            const score = status => status === 'registration' ? 0 : status === 'active' ? 1 : status === 'checkin' ? 2 : 3;
            return score(a.status) - score(b.status);
        });

    return activeTournaments[0]?.[0] || null;
}

export async function safeUpdateTournamentDashboard(client, db, tournamentId) {
    try {
        const tournament = await db.tournaments.get(tournamentId);
        if (!tournament?.slotListChannelId || !tournament?.dashboardMessageId) return;

        const channel = await client.channels.fetch(tournament.slotListChannelId);
        if (!channel) return;

        const message = await channel.messages.fetch(tournament.dashboardMessageId);
        if (!message) return;

        const payload = await getDashboardPayload(db, tournamentId);
        await message.edit(payload);
        console.log(`[dashboard] Updated dashboard message ${message.id} in channel ${channel.id} for tournament ${tournamentId}`);
    } catch (error) {
        console.warn('Failed to update tournament dashboard:', error?.message || error);
    }
}

export async function updateTournamentDashboard(client, db, tournamentId) {
    await safeUpdateTournamentDashboard(client, db, tournamentId);
}

export async function sendTournamentUpdate(client, db, tournamentId, content, embed = null) {
    const tournament = await db.tournaments.get(tournamentId);
    if (!tournament?.resultChannelId) return;
    const channel = await client.channels.fetch(tournament.resultChannelId);
    if (!channel) return;
    await channel.send({ content, embeds: embed ? [embed] : [] });
}

export async function scheduleExistingTournamentLocks(client, db) {
    const tournaments = await db.tournaments.getAll();
    for (const [id, t] of Object.entries(tournaments || {})) {
        if (t.closesAt && t.status === 'registration') {
            scheduleTournamentLock(client, db, id);
        }
    }
}