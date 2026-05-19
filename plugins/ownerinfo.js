const settings = require('../settings');

module.exports = {
    command: 'oi',
    aliases: ['ownerinfo', 'coowner'],
    category: 'info',
    description: 'Show owner and co‑owner information with videos',
    usage: '.oi',
    ownerOnly: false, // anyone can use

    async handler(sock, message, args, context = {}) {
        const chatId = context.chatId || message.key.remoteJid;

        // Prepare text message with owner info
        let text = `👑 *OWNER & CO‑OWNER* 👑\n\n`;
        text += `🔹 *Owner:* ${settings.ownerName}\n`;
        text += `📞 *Number:* ${settings.ownerNumber}\n\n`;
        text += `🔸 *Co‑Owner:* ${settings.coOwnerName}\n`;
        text += `📞 *Number:* ${settings.coOwnerNumber}\n\n`;
        text += `📱 *Videos:* Sending...`;

        // Send the text
        await sock.sendMessage(chatId, { text }, { quoted: message });

        // Send owner video
        try {
            await sock.sendMessage(chatId, {
                video: { url: settings.ownerVideo },
                caption: `👑 *${settings.ownerName}* – Owner & Developer`
            }, { quoted: message });
        } catch (err) {
            console.error('Owner video error:', err);
            await sock.sendMessage(chatId, { text: '❌ Failed to send owner video.' }, { quoted: message });
        }

        // Send co‑owner video
        try {
            await sock.sendMessage(chatId, {
                video: { url: settings.coOwnerVideo },
                caption: `🔸 *${settings.coOwnerName}* – Co‑Owner & Developer`
            }, { quoted: message });
        } catch (err) {
            console.error('Co‑owner video error:', err);
            await sock.sendMessage(chatId, { text: '❌ Failed to send co‑owner video.' }, { quoted: message });
        }
    }
};
