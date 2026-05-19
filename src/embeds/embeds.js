import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { config as botConfig } from '../config/bot.js';
import { getRoundName, sortMatches } from '../utils/bracket.js';

const EMPTY = 'None yet';

export const createTournamentEmbed = (title, description, fields = []) => {
    return new EmbedBuilder()
        .setColor(botConfig.bot.color)
        .setTitle(`${botConfig.bot.emoji} ${title}`)
        .setDescription(description)
        .addFields(fields)
        .setFooter({ text: 'ACHILLES ESPORTS | Tournament Bot' })
        .setTimestamp();
};

export const createSlotListEmbed = (tournament, slotlist, waitingList = []) => {
    const slots = Object.entries(slotlist.slots || {});
    const filledCount = slots.filter(([_, slot]) => slot.teamId).length;
    const statusText = tournament.status === 'registration'
        ? 'REGISTRATION OPEN'
        : tournament.status === 'checkin'
            ? 'REGISTRATION CLOSED - CHECK-IN OPEN'
            : tournament.status === 'completed'
                ? 'COMPLETED'
                : 'LIVE';

    const groups = slots.reduce((result, [num, slot]) => {
        const group = slot.group || String.fromCharCode(65 + Math.floor((Number(num) - 1) / (slotlist.teamsPerGroup || slotlist.slotSize || 1)));
        result[group] ||= [];
        const marker = slot.teamId ? (slot.checkin ? 'READY' : 'JOINED') : 'OPEN';
        result[group].push(`${num}. ${slot.teamId ? `<@${slot.teamId}>` : '-'} ${marker}`);
        return result;
    }, {});

    const embed = new EmbedBuilder()
        .setColor(botConfig.bot.color)
        .setTitle(`${tournament.name}`)
        .setDescription([
            `Type: **${tournament.type === 'bracket' ? 'Bracket' : 'Slot List'}**`,
            `Status: **${statusText}**`,
            `Slots: **${filledCount}/${slotlist.slotSize}**`,
            tournament.closesAt ? `Closes: <t:${Math.floor(tournament.closesAt / 1000)}:R>` : null
        ].filter(Boolean).join('\n'))
        .setFooter({ text: 'ACHILLES ESPORTS | Slots update automatically' })
        .setTimestamp();

    for (const [group, rows] of Object.entries(groups).slice(0, 10)) {
        embed.addFields({ name: `Group ${group}`, value: rows.join('\n') || EMPTY, inline: false });
    }

    if (waitingList.length > 0) {
        embed.addFields({ name: 'Waiting List', value: waitingList.map((id, i) => `${i + 1}. <@${id}>`).join('\n'), inline: false });
    }

    return embed;
};

export const createMatchEmbed = (match, tournament) => {
    return new EmbedBuilder()
        .setColor(botConfig.bot.color)
        .setTitle(`Match ${match.id}`)
        .addFields(
            { name: 'Team 1', value: match.team1 ? `<@${match.team1}>` : 'TBD', inline: true },
            { name: 'Team 2', value: match.team2 ? `<@${match.team2}>` : 'TBD', inline: true },
            { name: 'Status', value: match.status || 'pending', inline: true }
        )
        .setFooter({ text: `ACHILLES ESPORTS | ${tournament?.name || ''}` })
        .setTimestamp();
};

export const createStandingsEmbed = (standings, tournament) => {
    const standingsText = standings.slice(0, 20).map((standing, index) =>
        `${index + 1}. <@${standing.teamId}> - ${standing.wins || 0}W ${standing.losses || 0}L`
    ).join('\n');

    return new EmbedBuilder()
        .setColor(botConfig.bot.color)
        .setTitle(`${tournament?.name || 'Tournament'} - Standings`)
        .addFields({ name: 'Rankings', value: standingsText || EMPTY })
        .setFooter({ text: 'ACHILLES ESPORTS | Standings' })
        .setTimestamp();
};

export const createPairingsEmbed = (pairings, tournament, round) => {
    const pairingsText = pairings.map((match, index) => {
        const left = match.team1 ? `<@${match.team1}>` : 'TBD';
        const right = match.team2 ? `<@${match.team2}>` : 'TBD';
        const winner = match.winner ? ` | Winner: <@${match.winner}>` : '';
        return `Match ${index + 1} (${match.id || 'new'}): ${left} vs ${right}${winner}`;
    }).join('\n');

    return new EmbedBuilder()
        .setColor(botConfig.bot.color)
        .setTitle(`${tournament?.name || 'Tournament'} - ${getRoundName(round, tournament?.totalRounds)}`)
        .addFields({ name: 'Matches', value: pairingsText || EMPTY })
        .setFooter({ text: 'ACHILLES ESPORTS | Pairings' })
        .setTimestamp();
};

export const createBracketEmbed = (matches, tournament) => {
    const grouped = sortMatches(matches).reduce((rounds, match) => {
        const round = match.round || 1;
        rounds[round] ||= [];
        rounds[round].push(match);
        return rounds;
    }, {});

    const fields = Object.keys(grouped).map(Number).sort((a, b) => a - b).slice(0, 6).map((round) => {
        const value = grouped[round].map((match, index) => {
            const left = match.team1 ? `<@${match.team1}>` : 'TBD';
            const right = match.team2 ? `<@${match.team2}>` : 'TBD';
            const winner = match.winner ? ` -> <@${match.winner}>` : '';
            return `${index + 1}. ${left} vs ${right}${winner}`;
        }).join('\n');
        return { name: getRoundName(round, tournament?.totalRounds), value: value || EMPTY, inline: false };
    });

    return new EmbedBuilder()
        .setColor(botConfig.bot.color)
        .setTitle(`${tournament?.name || 'Tournament'} - Bracket`)
        .setDescription('Discord-native bracket view. Use `/report-result` or match buttons to progress the tournament.')
        .addFields(fields.length ? fields : [{ name: 'Bracket', value: EMPTY }])
        .setImage('attachment://achilles-bracket.png')
        .setFooter({ text: 'ACHILLES ESPORTS | Bracket' })
        .setTimestamp();
};

export const createTournamentDashboardEmbeds = (tournament, slotlist, matches, standings) => {
    const currentRound = tournament.currentRound || 1;
    const roundMatches = Object.values(matches || {}).filter((match) => match.round === currentRound);
    const embeds = [createSlotListEmbed(tournament, slotlist)];

    if (tournament.type === 'bracket' || roundMatches.length > 0) {
        embeds.push(createPairingsEmbed(roundMatches, tournament, currentRound));
    }

    embeds.push(createStandingsEmbed(standings, tournament));
    return embeds;
};

export const createTournamentButtons = (tournamentId, status = 'registration') => {
    const registrationOpen = status === 'registration';
    const checkinOpen = ['registration', 'checkin'].includes(status);
    return [
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`tournament:join:${tournamentId}`)
                .setLabel('REGISTER')
                .setStyle(ButtonStyle.Success)
                .setDisabled(!registrationOpen),
            new ButtonBuilder()
                .setCustomId(`tournament:leave:${tournamentId}`)
                .setLabel('LEAVE')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(!registrationOpen),
            new ButtonBuilder()
                .setCustomId(`tournament:checkin:${tournamentId}`)
                .setLabel('CHECK-IN')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(!checkinOpen),
            new ButtonBuilder()
                .setCustomId(`tournament:refresh:${tournamentId}`)
                .setLabel('REFRESH')
                .setStyle(ButtonStyle.Secondary)
        )
    ];
};

export const createSlotListButtons = (tournamentId, status = 'registration') => {
    const registrationOpen = status === 'registration';
    const canStart = status !== 'registration';
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`tournament:publish:${tournamentId}`)
            .setLabel('📢 Publish')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(!registrationOpen),
        new ButtonBuilder()
            .setCustomId(`tournament:info:${tournamentId}`)
            .setLabel('ℹ️ Info')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId(`tournament:edit:${tournamentId}`)
            .setLabel('✏️ Edit')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId(`tournament:start:${tournamentId}`)
            .setLabel('🏆 Start Tournament')
            .setStyle(ButtonStyle.Success)
            .setDisabled(!canStart)
    );
};

export const createProfessionalSlotListEmbed = (tournament, slotlist, tournamentId) => {
    const total = slotlist?.slotSize || 0;
    const filled = Object.values(slotlist?.slots || {}).filter(s => s.status === 'filled' || s.teamId).length;
    const open = total - filled;

    const statusConfig = {
        registration: { label: '🟢  REGISTRATION OPEN',    color: 0x57F287 },
        closed:       { label: '🔴  REGISTRATION CLOSED',  color: 0xED4245 },
        checkin:      { label: '🟡  CHECK-IN PHASE',       color: 0xFEE75C },
        active:       { label: '⚔️  TOURNAMENT LIVE',      color: 0xEB459E },
        completed:    { label: '🏁  TOURNAMENT COMPLETED', color: 0x5865F2 },
    };
    const { label: statusLabel, color } = statusConfig[tournament?.status] || { label: '⬜  Unknown', color: 0x95A5A6 };

    const slotLines = [];
    for (let i = 1; i <= total; i++) {
        const slot = slotlist?.slots?.[String(i)];
        const num = String(i).padStart(2, '0');
        const name = slot?.teamName || (slot?.teamId ? `<@${slot.teamId}>` : null);
        slotLines.push(`${name ? '✅' : '⬜'} \`${num}\`  ${name || '*Open*'}`);
    }

    const chunkSize = 10;
    const chunks = [];
    for (let i = 0; i < slotLines.length; i += chunkSize) {
        chunks.push(slotLines.slice(i, i + chunkSize));
    }

    const descLines = [
        `> ${statusLabel}`,
        `> \`ID:\` **${tournamentId}**  ·  \`Filled:\` **${filled} / ${total}**  ·  \`Open:\` **${open}**`,
    ];
    if (tournament?.closesAt) {
        descLines.push(`> \`Closes:\` <t:${Math.floor(tournament.closesAt / 1000)}:R>`);
    }

    const footerText = tournament?.footerText || 'ACHILLES ESPORTS • Slot list updates live';

    const embed = new EmbedBuilder()
        .setColor(color)
        .setTitle(`🏆  ${tournament?.name || tournamentId}`)
        .setDescription(descLines.join('\n'))
        .setFooter({ text: footerText })
        .setTimestamp();

    for (let i = 0; i < chunks.length; i++) {
        const label = chunks.length === 1
            ? '🎮  Slot List'
            : `🎮  Slots ${i * chunkSize + 1}–${Math.min((i + 1) * chunkSize, total)}`;
        embed.addFields({ name: label, value: chunks[i].join('\n'), inline: chunks.length > 1 });
    }

    if (tournament?.belowSlotsMessage) {
        embed.addFields({ name: '​', value: tournament.belowSlotsMessage, inline: false });
    }

    return embed;
};

export const createMatchResultButtons = (pairings) => {
    const buttons = [];

    for (const [index, match] of pairings.entries()) {
        if (match.status === 'completed' || !match.team1 || !match.team2) continue;
        if (buttons.length >= 10) break;

        buttons.push(
            new ButtonBuilder()
                .setCustomId(`match:win:${match.id}:${match.team1}`)
                .setLabel(`M${index + 1} Team 1`)
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId(`match:win:${match.id}:${match.team2}`)
                .setLabel(`M${index + 1} Team 2`)
                .setStyle(ButtonStyle.Secondary)
        );
    }

    const rows = [];
    for (let i = 0; i < buttons.length; i += 5) {
        rows.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + 5)));
    }

    return rows;
};
