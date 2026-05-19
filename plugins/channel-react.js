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
 *  CHANNEL REACT — REDXBOT302 v7.0 ULTRA                                   *
 *                                                                           *
 *  Commands:                                                                *
 *   • .chr <channel-link> [text or emoji]                                  *
 *         React to a WhatsApp channel post with stylized text/emoji.       *
 *         If no text given, reacts with 👍 by default.                     *
 *                                                                           *
 *****************************************************************************/

'use strict';

/* ── Config ──────────────────────────────────────────────────────────────── */
const CHR_CONFIG = {
    processingEmoji : '⏳',
    successEmoji    : '✅',
    errorEmoji      : '❌',
    defaultReaction : '👍',

    usageMsg:
        `╔══════════════════════════╗\n` +
        `║  📢 *Channel React*      ║\n` +
        `╚══════════════════════════╝\n\n` +
        `*Usage:*\n` +
        `\`.chr <channel-link> <text>\`\n\n` +
        `*Example:*\n` +
        `\`.chr https://whatsapp.com/channel/0029... hello\`\n\n` +
        `_Text is converted to stylized characters_ 🔤\n` +
        `_Leave text empty to react with 👍 by default_\n\n` +
        `_Powered by REDXBOT302_ 🔥`,
};

/* ── Stylized character map ──────────────────────────────────────────────── */
const stylizedChars = {
    a:'🅐', b:'🅑', c:'🅒', d:'🅓', e:'🅔', f:'🅕', g:'🅖',
    h:'🅗', i:'🅘', j:'🅙', k:'🅚', l:'🅛', m:'🅜', n:'🅝',
    o:'🅞', p:'🅟', q:'🅠', r:'🅡', s:'🅢', t:'🅣', u:'🅤',
    v:'🅥', w:'🅦', x:'🅧', y:'🅨', z:'🅩',
    '0':'⓿', '1':'➊', '2':'➋', '3':'➌', '4':'➍',
    '5':'➎', '6':'➏', '7':'➐', '8':'➑', '9':'➒',
};

function stylize(text) {
    return text.toLowerCase().split('').map(c => {
        if (c === ' ') return '―';
        return stylizedChars[c] || c;
    }).join('');
}

/* ── Owner helper ────────────────────────────────────────────────────────── */
function isOwner(sock, senderJid) {
    const ownerNum = sock.user?.id?.split(':')[0];
    return senderJid.includes(ownerNum);
}

/* ── Parse WhatsApp channel link ─────────────────────────────────────────── */
function parseChannelLink(link) {
    try {
        const url   = new URL(link);
        const parts = url.pathname.split('/').filter(Boolean);
        const chIdx = parts.findIndex(p => p === 'channel');
        if (chIdx === -1 || !parts[chIdx + 1]) return null;
        return {
            inviteCode: parts[chIdx + 1],
            msgId     : parts[chIdx + 2] || null,
        };
    } catch {
        return null;
    }
}

/* ── Exports (single object — matches original loader format) ────────────── */
module.exports = {
    command    : 'chr',
    aliases    : ['creact', 'channelreact'],
    category   : 'owner',
    description: 'React to a WhatsApp channel post with stylized text/emoji',
    usage      : '.chr <channel-link> [text or emoji]',
    ownerOnly  : true,

    async handler(sock, message, args, context = {}) {
        const chatId = context.chatId || message.key.remoteJid;
        const sender = context.senderId || message.key.participant || message.key.remoteJid;

        if (!isOwner(sock, sender)) {
            return await sock.sendMessage(chatId, { react: { text: '🚫', key: message.key } });
        }

        if (!args.length) {
            return await sock.sendMessage(chatId,
                { text: CHR_CONFIG.usageMsg },
                { quoted: message }
            );
        }

        const link      = args[0];
        const inputText = args.slice(1).join(' ').trim();

        if (!link.includes('whatsapp.com/channel/')) {
            return await sock.sendMessage(chatId, {
                text: '❌ *Invalid channel link.*\nMust contain `whatsapp.com/channel/`'
            }, { quoted: message });
        }

        const parsed = parseChannelLink(link);
        if (!parsed) {
            return await sock.sendMessage(chatId, {
                text: '❌ *Could not parse channel ID from link.*\nCheck the URL format.'
            }, { quoted: message });
        }

        const { inviteCode, msgId: urlMsgId } = parsed;
        const reaction = inputText ? stylize(inputText) : CHR_CONFIG.defaultReaction;

        await sock.sendMessage(chatId, { react: { text: CHR_CONFIG.processingEmoji, key: message.key } });

        try {
            const channelMeta = await sock.newsletterMetadata('invite', inviteCode);
            if (!channelMeta?.id) throw new Error('Could not fetch channel metadata.');

            const targetMsgId = urlMsgId || channelMeta.lastMessageId;
            if (!targetMsgId) throw new Error('Could not find a message ID to react to.');

            await sock.newsletterReactMessage(channelMeta.id, targetMsgId, reaction);

            await sock.sendMessage(chatId, { react: { text: CHR_CONFIG.successEmoji, key: message.key } });
            await sock.sendMessage(chatId, {
                text:
                    `✅ *Channel Reaction Sent!*\n\n` +
                    `📢 *Channel:* ${channelMeta.name || inviteCode}\n` +
                    `💬 *Reaction:* ${reaction}\n\n` +
                    `_Powered by REDXBOT302_ 🔥`
            }, { quoted: message });

        } catch (e) {
            console.error('[CHR ERROR]', e.message);
            await sock.sendMessage(chatId, { react: { text: CHR_CONFIG.errorEmoji, key: message.key } });
            await sock.sendMessage(chatId,
                { text: `❌ *Failed:* \`${e.message}\`` },
                { quoted: message }
            );
        }
    }
};
