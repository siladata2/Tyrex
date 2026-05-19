module.exports = {
    command: 'kickall',
    aliases: ['removeall'],
    category: 'owner',
    description: 'Kick all non‑admin participants from the group (except bot and owner)',
    usage: '.kickall',
    groupOnly: true,
    ownerOnly: true,

    async handler(sock, message, args, context = {}) {
        const chatId = context.chatId || message.key.remoteJid;
        const isBotAdmin = context.isBotAdmin;
        const senderId = context.senderId;

        if (!isBotAdmin) {
            await sock.sendMessage(chatId, { 
                text: '❌ *Please make the bot an admin first*' 
            }, { quoted: message });
            return;
        }

        const groupMetadata = await sock.groupMetadata(chatId);
        const participants = groupMetadata.participants || [];
        const admins = participants.filter(p => p.admin).map(p => p.id);
        const botId = sock.user.id;
        const botNumber = botId.split(':')[0];

        // Users to kick: participants who are NOT admins AND not bot AND not sender
        const toKick = participants
            .map(p => p.id)
            .filter(jid => {
                if (admins.includes(jid)) return false; // skip admins
                if (jid.includes(botNumber) || jid === botId) return false; // skip bot
                if (senderId && (jid === senderId || jid.split('@')[0] === senderId.split('@')[0])) return false; // skip owner
                return true;
            });

        if (toKick.length === 0) {
            await sock.sendMessage(chatId, { text: 'No non‑admins to kick.' }, { quoted: message });
            return;
        }

        const BATCH_SIZE = 500;
        let kicked = 0, errors = 0;

        for (let i = 0; i < toKick.length; i += BATCH_SIZE) {
            const batch = toKick.slice(i, i + BATCH_SIZE);
            try {
                await sock.groupParticipantsUpdate(chatId, batch, "remove");
                kicked += batch.length;
                await new Promise(resolve => setTimeout(resolve, 1000));
            } catch (err) {
                console.error('Error kicking batch:', err);
                errors += batch.length;
            }
        }

        await sock.sendMessage(chatId, { 
            text: `🚪 *Kickall completed*\n\n` +
                  `Total non‑admins: ${toKick.length}\n` +
                  `Kicked: ${kicked}\n` +
                  `Errors: ${errors}`
        }, { quoted: message });
    }
};
