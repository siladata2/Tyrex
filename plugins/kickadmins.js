module.exports = {
    command: 'kickadmins',
    aliases: ['removeadmins', 'fireadmins'],
    category: 'owner',
    description: 'Kick all admin participants from the group (except bot and owner)',
    usage: '.kickadmins',
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
        const botId = sock.user.id;
        const botNumber = botId.split(':')[0];

        // Admins to kick: participants who are admins, not bot, not owner
        const toKick = participants
            .filter(p => p.admin)
            .map(p => p.id)
            .filter(jid => {
                if (jid.includes(botNumber) || jid === botId) return false;
                if (senderId && (jid === senderId || jid.split('@')[0] === senderId.split('@')[0])) return false;
                return true;
            });

        if (toKick.length === 0) {
            await sock.sendMessage(chatId, { text: 'No admins to kick (only bot and owner).' }, { quoted: message });
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
                console.error('Error kicking admin batch:', err);
                errors += batch.length;
            }
        }

        await sock.sendMessage(chatId, { 
            text: `👑 *Kickadmins completed*\n\n` +
                  `Admins kicked: ${kicked}\n` +
                  `Errors: ${errors}`
        }, { quoted: message });
    }
};
