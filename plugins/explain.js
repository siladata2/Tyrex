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
 *****************************************************************************/

const axios = require('axios');

module.exports = {
    command: 'explain',
    aliases: ['codeexplain', 'whatis'],
    category: 'ai',
    description: 'Explain a piece of code or a concept',
    usage: '.explain <code or concept>',

    async handler(sock, message, args, context) {
        const { chatId, channelInfo } = context;

        const quoted = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        const quotedText = quoted?.conversation || quoted?.extendedTextMessage?.text || '';
        const input = args.join(' ') || quotedText;

        if (!input) {
            await sock.sendMessage(chatId, {
                text: `🔍 *AI EXPLAINER*\n\n` +
                      `*Usage:* \`.explain <code or concept>\` or reply to a message\n` +
                      `*Example:* \`.explain async/await in JavaScript\``,
                ...channelInfo
            }, { quoted: message });
            return;
        }

        try {
            await sock.sendMessage(chatId, {
                react: { text: '🔍', key: message.key }
            });

            const apis = [
                `https://api.agatz.xyz/api/gpt?message=Explain%20this%20in%20simple%20terms%3A%20${encodeURIComponent(input)}`,
                `https://api.giftedtech.my.id/api/ai/gpt4?apikey=gifted&q=Explain%20this%20clearly%3A%20${encodeURIComponent(input)}`
            ];

            let explanation = '';
            for (const api of apis) {
                try {
                    const { data } = await axios.get(api, { timeout: 15000 });
                    explanation = data.result || data.message || data.data || data.answer || data.response;
                    if (explanation) break;
                } catch (e) { /* ignore */ }
            }

            if (!explanation) throw new Error('No API response');

            await sock.sendMessage(chatId, {
                text: `*🔍 Explanation:*\n\n${explanation}`,
                ...channelInfo
            }, { quoted: message });

        } catch (error) {
            console.error('[EXPLAIN] Error:', error);
            await sock.sendMessage(chatId, {
                text: '❌ Failed to explain. Try again later.',
                ...channelInfo
            }, { quoted: message });
        }
    }
};
