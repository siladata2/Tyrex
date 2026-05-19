const settings = require('../settings');

module.exports = {
    command: 'oi',
    aliases: ['ownerinfo'],
    category: 'info',
    description: 'Show owner information with video',
    usage: '.oi',
    ownerOnly: false, // anyone can use

    async handler(sock, message, args, context = {}) {
        const chatId = context.chatId || message.key.remoteJid;

        // Prepare text message with owner info
        let text = `👑 *OWNER INFO* 👑\n\n`;
        text += `🔹 *Owner:* ${settings.ownerName}\n`;
        text += `📞 *Number:* ${settings.ownerNumber}\n\n`;
        text += `📱 *Video:* Sending...`;

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
    }
};
