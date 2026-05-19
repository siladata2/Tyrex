/*****************************************************************************
 *                                                                           *
 *                     Developed By Abdul Rehman Rajpoot                     *
 *                                                                           *
 *  🌐  GitHub   : https://github.com/AbdulRehman19721986/redxbot302          *
 *  ▶️  YouTube  : https://youtube.com/@rootmindtech                         *
 *  💬  WhatsApp : https://whatsapp.com/channel/0029VbCPnYf96H4SNehkev10     *
 *  🔗  Telegram : https://t.me/TeamRedxhacker2                              *
 *                                                                           *
 *    © 2026 Abdul Rehman Rajpoot. All rights reserved.                      *
 *                                                                           *
 *****************************************************************************/

'use strict';

const axios = require('axios');

module.exports = {
    command    : 'alamy',
    aliases    : ['alamydl', 'alamydownload'],
    category   : 'download',
    description: 'Download image or video from Alamy URL',
    usage      : '.alamy <Alamy URL>',

    async handler(sock, message, args, context = {}) {
        const chatId = context.chatId || message.key.remoteJid;
        const url    = args?.[0]?.trim();

        if (!url || !url.startsWith('http')) {
            return await sock.sendMessage(chatId, {
                text:
                    `❌ *Please provide a valid Alamy URL.*\n\n` +
                    `*Usage:* \`.alamy <Alamy URL>\`\n` +
                    `*Example:* \`.alamy https://www.alamy.com/video/beautiful-lake...\``
            }, { quoted: message });
        }

        // Processing reaction
        await sock.sendMessage(chatId, { react: { text: '⏳', key: message.key } });

        try {
            const apiUrl = `https://discardapi.dpdns.org/api/dl/alamy?apikey=guru&url=${encodeURIComponent(url)}`;
            const { data } = await axios.get(apiUrl, { timeout: 15000 });

            if (!data?.status || !data.result?.length) {
                await sock.sendMessage(chatId, { react: { text: '❌', key: message.key } });
                return await sock.sendMessage(chatId, {
                    text: '❌ *Failed to fetch media from the provided Alamy URL.*\n_Make sure the URL is correct and publicly accessible._'
                }, { quoted: message });
            }

            let sent = 0;
            for (const item of data.result) {
                if (item.video) {
                    await sock.sendMessage(chatId, {
                        video  : { url: item.video },
                        caption: `🎬 *Alamy Video*\n\n_Downloaded by REDXBOT302_ 🔥`,
                    }, { quoted: message });
                    sent++;
                }
                if (item.image) {
                    await sock.sendMessage(chatId, {
                        image  : { url: item.image },
                        caption: `🖼️ *Alamy Image*\n\n_Downloaded by REDXBOT302_ 🔥`,
                    }, { quoted: message });
                    sent++;
                }
            }

            if (sent === 0) {
                await sock.sendMessage(chatId, { react: { text: '❌', key: message.key } });
                return await sock.sendMessage(chatId, {
                    text: '❌ *No downloadable media found in the response.*'
                }, { quoted: message });
            }

            await sock.sendMessage(chatId, { react: { text: '✅', key: message.key } });

        } catch (err) {
            console.error('[ALAMY ERROR]', err.message);
            await sock.sendMessage(chatId, { react: { text: '❌', key: message.key } });

            const errText = err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT'
                ? '❌ *Request timed out.* The API may be slow or temporarily unavailable. Try again later.'
                : `❌ *Failed to download media from Alamy URL.*\n_Error:_ \`${err.message}\``;

            await sock.sendMessage(chatId, { text: errText }, { quoted: message });
        }
    }
};
