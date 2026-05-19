/*****************************************************************************
 *                                                                           *
 *                     Developed By Abdul Rehman Rajpoot                     *
 *                     & Muzamil Khan                                        *
 *                                                                           *
 *  🌐  GitHub   : https://github.com/AbdulRehman19721986/redxbot302          *
 *  ▶️  YouTube  : https://youtube.com/@rootmindtech                         *
 *  💬  WhatsApp : https://whatsapp.com/channel/0029VbCPnYf96H4SNehkev10     *
 *  🔗  Telegram : https://t.me/TeamRedxhacker2                              *
 *                                                                           *
 *    © 2026 Abdul Rehman Rajpoot. All rights reserved.                      *
 *                                                                           *
 *    Description: Displays a dynamic edit message with emojis for fun.     *
 *****************************************************************************/

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

module.exports = {
    command: 'hot',
    aliases: ['spicy', '🔥'],
    category: 'fun',
    description: 'Displays a dynamic edit message with emojis for fun.',
    usage: '.hot',

    async handler(sock, message, args, context = {}) {
        const chatId = context.chatId || message.key.remoteJid;
        const channelInfo = context.channelInfo || {};

        try {
            // Send initial message
            const initialMsg = await sock.sendMessage(chatId, {
                text: '💋',
                ...channelInfo
            });

            const emojiMessages = [
                "🥵", "❤️", "💋", "😫", "🤤",
                "😋", "🥵", "🥶", "🙊", "😻",
                "🙈", "💋", "🫂", "🫀", "👅",
                "👄", "💋"
            ];

            for (const line of emojiMessages) {
                await delay(1000);
                await sock.relayMessage(
                    chatId,
                    {
                        protocolMessage: {
                            key: initialMsg.key,
                            type: 14,
                            editedMessage: {
                                conversation: line,
                            },
                        },
                    },
                    {}
                );
            }
        } catch (error) {
            console.error('Hot command error:', error);
            await sock.sendMessage(chatId, {
                text: `❌ Error: ${error.message}`,
                ...channelInfo
            }, { quoted: message });
        }
    }
};
