import { AttachmentBuilder } from 'discord.js';
import sharp from 'sharp';
import { getRoundName, sortMatches } from './bracket.js';

const esc = (v) => String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const trunc = (s, max = 20) => {
    s = String(s || '');
    return s.length > max ? s.slice(0, max - 1) + '…' : s;
};

// Layout constants
const SLOT_H  = 62;   // vertical px per team slot in round 1
const LBL_W   = 170;  // team name label width
const LBL_H   = 36;   // team name label height
const H_PRE   = 28;   // short horizontal before junction
const H_POST  = 80;   // long horizontal after junction (winner line)
const L_PAD   = 48;
const R_PAD   = 48;
const TOP_PAD = 96;   // space for title + round labels
const BOT_PAD = 52;

// Colors
const C = {
    bg:        '#0d1117',
    box:       '#161b22',
    boxWin:    '#0d1f0d',
    boxTbd:    '#111418',
    brd:       '#FF6600',
    brdWin:    '#00e676',
    brdTbd:    '#30363d',
    conn:      '#30363d',
    connWin:   '#00e676',
    txt:       '#e6edf3',
    txtWin:    '#00e676',
    txtTbd:    '#4d5969',
    round:     '#FF8C00',
    title:     '#facc15',
    sub:       '#6e7681',
    champBox:  '#091a09',
    champBrd:  '#00e676',
};

/** Build a team-name lookup map from a slotlist object. */
export const buildTeamNamesMap = (slotlist) => {
    const map = {};
    for (const slot of Object.values(slotlist?.slots || {})) {
        if (slot.teamId && slot.teamName) map[slot.teamId] = slot.teamName;
    }
    return map;
};

const labelBox = (x, cy, name, { winner = false, tbd = false } = {}) => {
    const fill   = winner ? C.boxWin : tbd ? C.boxTbd : C.box;
    const stroke = winner ? C.brdWin : tbd ? C.brdTbd : C.brd;
    const color  = winner ? C.txtWin : tbd ? C.txtTbd : C.txt;
    const weight = winner ? '700' : '400';
    return `
        <rect x="${x}" y="${cy - LBL_H / 2}" width="${LBL_W}" height="${LBL_H}" rx="6"
            fill="${fill}" stroke="${stroke}" stroke-width="1.5"/>
        <text x="${x + 10}" y="${cy + 5}" fill="${color}" font-size="12"
            font-weight="${weight}" font-family="Arial, sans-serif">${esc(trunc(name, 19))}</text>`;
};

const hline = (x1, y, x2, color = C.conn) =>
    `<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}"
        stroke="${color}" stroke-width="1.5" stroke-linecap="round"/>`;

const vline = (x, y1, y2, color = C.conn) =>
    `<line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}"
        stroke="${color}" stroke-width="1.5" stroke-linecap="round"/>`;

export const renderBracketText = (matches, tournament = {}) => {
    const grouped = sortMatches(matches).reduce((acc, m) => {
        const r = m.round || 1;
        (acc[r] = acc[r] || []).push(m);
        return acc;
    }, {});
    const rounds = Object.keys(grouped).map(Number).sort((a, b) => a - b);
    if (!rounds.length) return 'No bracket matches yet.';
    return rounds.map(r => {
        const title = getRoundName(r, tournament.totalRounds);
        const rows = grouped[r].map((m, i) => {
            const t1 = m.team1 ? `<@${m.team1}>` : 'TBD';
            const t2 = m.team2 ? `<@${m.team2}>` : 'TBD';
            const win = m.winner ? ` → <@${m.winner}>` : '';
            return `${i + 1}. ${t1} vs ${t2}${win}`;
        });
        return `**${title}**\n${rows.join('\n')}`;
    }).join('\n\n');
};

export const createBracketAttachment = async (matches, tournament = {}, teamNames = {}) => {
    const sorted = sortMatches(matches);
    const grouped = sorted.reduce((acc, m) => {
        const r = m.round || 1;
        (acc[r] = acc[r] || []).push(m);
        return acc;
    }, {});

    const roundNumbers = Object.keys(grouped).map(Number).sort((a, b) => a - b);

    if (!roundNumbers.length) {
        const svg = `<svg width="600" height="200" xmlns="http://www.w3.org/2000/svg">
            <rect width="100%" height="100%" fill="${C.bg}"/>
            <text x="300" y="105" text-anchor="middle" fill="${C.txtTbd}"
                font-size="18" font-family="Arial, sans-serif">No bracket matches yet.</text>
        </svg>`;
        return new AttachmentBuilder(await sharp(Buffer.from(svg)).png().toBuffer(), { name: 'bracket.png' });
    }

    const numRounds   = roundNumbers.length;
    const r0Matches   = grouped[roundNumbers[0]].length;
    const numLeafSlots = r0Matches * 2;   // 2 team slots per round-1 match

    const resolve = (id) => id ? (teamNames[id] || `…${String(id).slice(-5)}`) : null;

    // ── Layout helpers ────────────────────────────────────────────────────────

    // X of the left edge of team-name labels for round r (0-indexed)
    const colX  = (r) => L_PAD + r * (LBL_W + H_PRE + H_POST);
    // X of the vertical junction bar for round r
    const juncX = (r) => colX(r) + LBL_W + H_PRE;

    // Center Y of a round-0 team slot (leaf index i = 0 .. numLeafSlots-1)
    const leafY = (i) => TOP_PAD + i * SLOT_H + SLOT_H / 2;

    // Pre-compute junction Y for every round and match index
    // juncY[r][j] = vertical midpoint between the two input teams of match j in round r
    const juncY = [];

    // Round 0: between the two leaf slots of each match
    juncY.push(
        Array.from({ length: r0Matches }, (_, j) =>
            (leafY(j * 2) + leafY(j * 2 + 1)) / 2
        )
    );

    // Subsequent rounds: midpoint between the two input junctions from previous round
    for (let r = 1; r < numRounds; r++) {
        const prev = juncY[r - 1];
        const cnt  = grouped[roundNumbers[r]].length;
        juncY.push(
            Array.from({ length: cnt }, (_, j) => {
                const y0 = prev[j * 2]     ?? prev[prev.length - 1];
                const y1 = prev[j * 2 + 1] ?? y0;
                return (y0 + y1) / 2;
            })
        );
    }

    // SVG dimensions
    const svgW = colX(numRounds) + LBL_W + R_PAD;
    const svgH = TOP_PAD + numLeafSlots * SLOT_H + BOT_PAD;

    // ── Build SVG elements ────────────────────────────────────────────────────

    let boxes = '', lines = '', labels = '';

    for (let ri = 0; ri < numRounds; ri++) {
        const round   = roundNumbers[ri];
        const ms      = grouped[round];
        const cx      = colX(ri);
        const jx      = juncX(ri);
        const nextCx  = colX(ri + 1);
        const isLast  = ri === numRounds - 1;

        // ── Round label pill ──────────────────────────────────────────────────
        const lblPillY = TOP_PAD - 42;
        labels += `
            <rect x="${cx}" y="${lblPillY}" width="${LBL_W}" height="24" rx="5"
                fill="${C.bg}" stroke="${C.brd}" stroke-width="1" stroke-opacity="0.45"/>
            <text x="${cx + LBL_W / 2}" y="${lblPillY + 16}" text-anchor="middle"
                fill="${C.round}" font-size="11" font-weight="700"
                font-family="Arial, sans-serif">${esc(getRoundName(round, tournament.totalRounds))}</text>`;

        for (let mi = 0; mi < ms.length; mi++) {
            const match = ms[mi];
            const t1id  = match.team1;
            const t2id  = match.team2;
            const winId = match.winner;

            // Y centers of the two input team labels
            let t1Y, t2Y;
            if (ri === 0) {
                t1Y = leafY(mi * 2);
                t2Y = leafY(mi * 2 + 1);
            } else {
                const prev = juncY[ri - 1];
                t1Y = prev[mi * 2]     ?? prev[prev.length - 1];
                t2Y = prev[mi * 2 + 1] ?? t1Y;
            }

            const jy = juncY[ri][mi];

            // ── Draw team name boxes (round 0 only; others drawn as outputs) ─
            if (ri === 0) {
                const n1   = resolve(t1id);
                const n2   = resolve(t2id);
                boxes += labelBox(cx, t1Y, n1 || 'TBD', { winner: winId === t1id && !!t1id, tbd: !t1id });
                boxes += labelBox(cx, t2Y, n2 || 'TBD', { winner: winId === t2id && !!t2id, tbd: !t2id });
            }

            // ── Connector lines ───────────────────────────────────────────────
            const t1Won = !!(winId && winId === t1id);
            const t2Won = !!(winId && winId === t2id);
            lines += hline(cx + LBL_W, t1Y, jx, t1Won ? C.connWin : C.conn);
            lines += hline(cx + LBL_W, t2Y, jx, t2Won ? C.connWin : C.conn);
            lines += vline(jx, t1Y, t2Y);

            // ── Output line + next-round winner label ─────────────────────────
            const winName  = resolve(winId);
            const hasWin   = !!winId;

            if (!isLast) {
                lines += hline(jx, jy, nextCx, hasWin ? C.connWin : C.conn);
                boxes += labelBox(nextCx, jy, winName || 'TBD', { winner: hasWin, tbd: !hasWin });
            } else {
                // Last round → champion box
                const champX = colX(numRounds);
                lines += hline(jx, jy, champX, hasWin ? C.connWin : C.conn);

                if (hasWin) {
                    labels += `
                        <rect x="${champX}" y="${jy - 26}" width="${LBL_W}" height="52" rx="8"
                            fill="${C.champBox}" stroke="${C.champBrd}" stroke-width="2"/>
                        <text x="${champX + LBL_W / 2}" y="${jy - 8}" text-anchor="middle"
                            fill="${C.txtWin}" font-size="10" font-weight="700"
                            font-family="Arial, sans-serif">CHAMPION</text>
                        <text x="${champX + LBL_W / 2}" y="${jy + 13}" text-anchor="middle"
                            fill="${C.txtWin}" font-size="13" font-weight="700"
                            font-family="Arial, sans-serif">${esc(trunc(winName, 18))}</text>`;
                } else {
                    labels += `
                        <rect x="${champX}" y="${jy - 26}" width="${LBL_W}" height="52" rx="8"
                            fill="${C.box}" stroke="${C.brd}" stroke-width="1.5"/>
                        <text x="${champX + LBL_W / 2}" y="${jy - 8}" text-anchor="middle"
                            fill="${C.round}" font-size="10" font-weight="700"
                            font-family="Arial, sans-serif">CHAMPION</text>
                        <text x="${champX + LBL_W / 2}" y="${jy + 13}" text-anchor="middle"
                            fill="${C.txtTbd}" font-size="13"
                            font-family="Arial, sans-serif">TBD</text>`;
                }
            }
        }
    }

    // Title header separator
    const sepY = TOP_PAD - 56;

    const svg = `<svg width="${svgW}" height="${svgH}" viewBox="0 0 ${svgW} ${svgH}"
        xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" fill="${C.bg}"/>

        <!-- Title -->
        <text x="${svgW / 2}" y="28" text-anchor="middle" fill="${C.title}"
            font-size="18" font-weight="900" font-family="Arial, sans-serif">${esc(tournament.name || 'Tournament Bracket')}</text>
        <text x="${svgW / 2}" y="46" text-anchor="middle" fill="${C.sub}"
            font-size="11" font-family="Arial, sans-serif">ACHILLES ESPORTS${tournament.id ? ' • ' + tournament.id : ''}</text>
        <line x1="${L_PAD}" y1="${sepY}" x2="${svgW - R_PAD}" y2="${sepY}"
            stroke="${C.brd}" stroke-width="0.5" stroke-opacity="0.4"/>

        <!-- Connector lines (drawn first, underneath boxes) -->
        ${lines}

        <!-- Team name boxes and labels -->
        ${boxes}
        ${labels}
    </svg>`;

    const png = await sharp(Buffer.from(svg)).png().toBuffer();
    return new AttachmentBuilder(png, { name: 'bracket.png' });
};
