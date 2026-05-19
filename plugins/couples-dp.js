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
 *  COUPLES DP — REDXBOT302 v7.0 ULTRA                                      *
 *                                                                           *
 *  Commands:                                                                *
 *   • .couplepp — fetch a random male + female couple profile picture pair  *
 *                                                                           *
 *****************************************************************************/

'use strict';

const axios = require('axios');

/* ── Config ──────────────────────────────────────────────────────────────── */
const CPP_CONFIG = {
    processingEmoji: '💑',
    successEmoji   : '✅',
    errorEmoji     : '❌',

    // Tried in order — first success wins
    apis: [
        'https://api.davidcyriltech.my.id/couplepp',
        'https://apis.davidcyriltech.my.id/couplepp',
    ],
    timeout: 15000,

    maleCaption:
        `👨 *Male — Couple DP*\n\n` +
        `_Pair this with the female DP below_ 💑\n\n` +
        `_Powered by REDXBOT302_ 🔥`,

    femaleCaption:
        `👩 *Female — Couple DP*\n\n` +
        `_Set these as your profile pictures together_ 💕\n\n` +
        `_Powered by REDXBOT302_ 🔥`,
};

/* ── Exports (single object — matches original loader format) ────────────── */
module.exports = {
    command    : 'couplepp',
    aliases    : ['couple', 'cpp', 'coupledp'],
    category   : 'image',
    description: 'Get a random male + female couple profile picture pair',
    usage      : '.couplepp',

    async handler(sock, message, args, context = {}) {
        const chatId = context.chatId || message.key.remoteJid;

        await sock.sendMessage(chatId, { react: { text: CPP_CONFIG.processingEmoji, key: message.key } });

        /* ── Fetch from API (with fallback) ───────────────────────────── */
        let data = null;
        for (const apiUrl of CPP_CONFIG.apis) {
            try {
                const res = await axios.get(apiUrl, { timeout: CPP_CONFIG.timeout });
                if (res.data?.success && (res.data.male || res.data.female)) {
                    data = res.data;
                    break;
                }
            } catch (e) {
                console.warn(`[COUPLEPP] API failed (${apiUrl}):`, e.message);
            }
        }

        if (!data) {
            await sock.sendMessage(chatId, { react: { text: CPP_CONFIG.errorEmoji, key: message.key } });
            return await sock.sendMessage(chatId, {
                text: '❌ *Could not fetch couple pictures right now.*\n_Please try again later._ 🔄'
            }, { quoted: message });
        }

        try {
            if (data.male) {
                await sock.sendMessage(chatId, {
                    image  : { url: data.male },
                    caption: CPP_CONFIG.maleCaption,
                }, { quoted: message });
            }

            if (data.female) {
                await sock.sendMessage(chatId, {
                    image  : { url: data.female },
                    caption: CPP_CONFIG.femaleCaption,
                }, { quoted: message });
            }

            await sock.sendMessage(chatId, { react: { text: CPP_CONFIG.successEmoji, key: message.key } });

        } catch (e) {
            console.error('[COUPLEPP ERROR]', e.message);
            await sock.sendMessage(chatId, { react: { text: CPP_CONFIG.errorEmoji, key: message.key } });
            await sock.sendMessage(chatId,
                { text: `❌ *Error fetching couple DP:* \`${e.message}\`` },
                { quoted: message }
            );
        }
    }
};
