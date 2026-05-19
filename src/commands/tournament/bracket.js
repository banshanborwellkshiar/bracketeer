export default {
    data: {
        name: 'bracket',
        description: 'View the active tournament bracket',
        options: [
            {
                name: 'tournament',
                type: 3,
                description: 'Optional tournament ID or name',
                required: false
            }
        ]
    },
    async execute(interaction, db) {
        await interaction.deferReply({ flags: 64 });
        const { createBracketAttachment, buildTeamNamesMap } = await import('../../utils/bracketRenderer.js');
        const { resolveTournamentId } = await import('../../services/discordTournament.js');

        const tournamentInput = interaction.options.getString('tournament');
        const tournamentId = await resolveTournamentId(db, interaction.channelId, interaction.guildId, tournamentInput);

        if (!tournamentId) {
            await interaction.editReply({ content: 'No active tournament found for this channel or server.' });
            return;
        }

        const tournament = await db.tournaments.get(tournamentId);
        const matches = await db.matches.getByTournament(tournamentId);

        if (!tournament) {
            await interaction.editReply({ content: 'Tournament not found.' });
            return;
        }

        if (Object.keys(matches || {}).length === 0) {
            const isClosed = ['closed', 'checkin', 'published'].includes(tournament.status);
            if (isClosed) {
                const { EmbedBuilder } = await import('discord.js');
                const closedEmbed = new EmbedBuilder()
                    .setColor(0xFF0000)
                    .setTitle('🔴 Registration Closed')
                    .setDescription(
                        `Registration for **${tournament.name || tournamentId}** is now closed.\n` +
                        `The bracket will be posted here once the tournament starts.`
                    )
                    .setFooter({ text: 'ACHILLES ESPORTS Tournament Bot' });

                const slotListChannel = tournament.slotListChannelId
                    ? await interaction.client.channels.fetch(tournament.slotListChannelId).catch(() => null)
                    : null;
                if (slotListChannel) {
                    await slotListChannel.send({ embeds: [closedEmbed] });
                    await interaction.editReply({ content: `🔴 Registration closed notice posted in ${slotListChannel}.` });
                } else {
                    await interaction.editReply({ embeds: [closedEmbed] });
                }
            } else {
                await interaction.editReply({ content: 'Bracket not generated yet.' });
            }
            return;
        }

        const slotlist = await db.slotlists.get(tournamentId);
        const teamNames = buildTeamNamesMap(slotlist);
        const attachment = await createBracketAttachment(Object.values(matches), { ...tournament, id: tournamentId }, teamNames);

        // Post the bracket image publicly to the slot-list channel so everyone can see it
        const slotListChannel = tournament.slotListChannelId
            ? await interaction.client.channels.fetch(tournament.slotListChannelId).catch(() => null)
            : null;

        if (slotListChannel) {
            await slotListChannel.send({
                content: `🏆 **${tournament.name || tournamentId}** — Bracket`,
                files: [attachment]
            });
            await interaction.editReply({ content: `✅ Bracket posted in ${slotListChannel}.` });
        } else {
            // Fallback: send in the current channel if slot-list channel isn't accessible
            await interaction.editReply({ files: [attachment] });
        }
    }
}
