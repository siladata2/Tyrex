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
 *  BLOCK / UNBLOCK — REDXBOT302 v7.0 ULTRA                                 *
 *                                                                           *
 *  Commands:                                                                *
 *   • .block   — block a user (reply / mention / number)                   *
 *   • .unblock — unblock a user (reply / mention / number)                 *
 *                                                                           *
 *****************************************************************************/

'use strict';

/* ── Config ──────────────────────────────────────────────────────────────── */
const BLOCK_CONFIG = {
    processingEmoji: '⏳',
    successEmoji   : '✅',
    errorEmoji     : '❌',
    denyEmoji      : '🚫',

    blockUsage:
        `╔══════════════════════╗\n` +
        `║   🚫 *Block Command* ║\n` +
        `╚══════════════════════╝\n\n` +
        `*Usage:*\n` +
        `• Reply to a message + \`.block\`\n` +
        `• \`.block @mention\`\n` +
        `• \`.block 923001234567\`\n\n` +
        `_Owner only command_ 👑\n` +
        `_Powered by REDXBOT302_ 🔥`,

    unblockUsage:
        `╔════════════════════════╗\n` +
        `║  🔓 *Unblock Command*  ║\n` +
        `╚════════════════════════╝\n\n` +
        `*Usage:*\n` +
        `• Reply to a message + \`.unblock\`\n` +
        `• \`.unblock @mention\`\n` +
        `• \`.unblock 923001234567\`\n\n` +
        `_Owner only command_ 👑\n` +
        `_Powered by REDXBOT302_ 🔥`,
};

/* ── Helpers ─────────────────────────────────────────────────────────────── */
function getOwnerNum(sock) {
    return sock.user?.id?.split(':')[0] || '';
}

function isOwner(sock, senderJid) {
    return senderJid.includes(getOwnerNum(sock));
}

async function resolveTarget(message, args) {
    const ctx = message.message?.extendedTextMessage?.contextInfo;

    // 1) Quoted message sender
    if (ctx?.participant) return ctx.participant;
    if (ctx?.quotedMessage && ctx?.remoteJid) return ctx.remoteJid;

    // 2) Mentioned JID
    if (ctx?.mentionedJid?.length) return ctx.mentionedJid[0];

    // 3) Number in args
    const rawNum = (args[0] || '').replace(/[^0-9]/g, '').trim();
    if (rawNum.length >= 7) return rawNum + '@s.whatsapp.net';

    // 4) Number in message body
    const body = (
        message.message?.conversation ||
        message.message?.extendedTextMessage?.text || ''
    ).replace(/[^0-9]/g, '').trim();
    if (body.length >= 7) return body + '@s.whatsapp.net';

    return null;
}

/* ══════════════════════════════════════════════════════════════════
   COMMAND: .block
══════════════════════════════════════════════════════════════════ */
const blockCommand = {
    command    : 'block',
    aliases    : ['blk'],
    category   : 'owner',
    description: 'Block a WhatsApp user (reply / mention / number)',
    usage      : '.block @user   |   .block 923001234567',
    ownerOnly  : true,

    async handler(sock, message, args, context = {}) {
        const chatId = context.chatId || message.key.remoteJid;
        const sender = context.senderId || message.key.participant || message.key.remoteJid;

        if (!isOwner(sock, sender)) {
            return await sock.sendMessage(chatId, { react: { text: BLOCK_CONFIG.denyEmoji, key: message.key } });
        }

        const target = await resolveTarget(message, args);
        if (!target) {
            return await sock.sendMessage(chatId,
                { text: BLOCK_CONFIG.blockUsage },
                { quoted: message }
            );
        }

        await sock.sendMessage(chatId, { react: { text: BLOCK_CONFIG.processingEmoji, key: message.key } });

        try {
            await sock.updateBlockStatus(target, 'block');
            const num = target.split('@')[0];
            await sock.sendMessage(chatId, {
                text:
                    `✅ *Blocked Successfully!*\n\n` +
                    `📵 *Number:* +${num}\n` +
                    `🚫 _They can no longer message this bot._\n\n` +
                    `_Powered by REDXBOT302_ 🔥`
            }, { quoted: message });
            await sock.sendMessage(chatId, { react: { text: BLOCK_CONFIG.successEmoji, key: message.key } });

        } catch (e) {
            console.error('[BLOCK ERROR]', e.message);
            await sock.sendMessage(chatId, { react: { text: BLOCK_CONFIG.errorEmoji, key: message.key } });
            await sock.sendMessage(chatId,
                { text: `❌ *Block failed:* \`${e.message}\`` },
                { quoted: message }
            );
        }
    }
};

/* ══════════════════════════════════════════════════════════════════
   COMMAND: .unblock
══════════════════════════════════════════════════════════════════ */
const unblockCommand = {
    command    : 'unblock',
    aliases    : ['unblk'],
    category   : 'owner',
    description: 'Unblock a WhatsApp user (reply / mention / number)',
    usage      : '.unblock @user   |   .unblock 923001234567',
    ownerOnly  : true,

    async handler(sock, message, args, context = {}) {
        const chatId = context.chatId || message.key.remoteJid;
        const sender = context.senderId || message.key.participant || message.key.remoteJid;

        if (!isOwner(sock, sender)) {
            return await sock.sendMessage(chatId, { react: { text: BLOCK_CONFIG.denyEmoji, key: message.key } });
        }

        const target = await resolveTarget(message, args);
        if (!target) {
            return await sock.sendMessage(chatId,
                { text: BLOCK_CONFIG.unblockUsage },
                { quoted: message }
            );
        }

        await sock.sendMessage(chatId, { react: { text: BLOCK_CONFIG.processingEmoji, key: message.key } });

        try {
            await sock.updateBlockStatus(target, 'unblock');
            const num = target.split('@')[0];
            await sock.sendMessage(chatId, {
                text:
                    `✅ *Unblocked Successfully!*\n\n` +
                    `🔓 *Number:* +${num}\n` +
                    `💬 _They can now message this bot again._\n\n` +
                    `_Powered by REDXBOT302_ 🔥`
            }, { quoted: message });
            await sock.sendMessage(chatId, { react: { text: BLOCK_CONFIG.successEmoji, key: message.key } });

        } catch (e) {
            console.error('[UNBLOCK ERROR]', e.message);
            await sock.sendMessage(chatId, { react: { text: BLOCK_CONFIG.errorEmoji, key: message.key } });
            await sock.sendMessage(chatId,
                { text: `❌ *Unblock failed:* \`${e.message}\`` },
                { quoted: message }
            );
        }
    }
};

/* ── Exports ─────────────────────────────────────────────────────────────── */
module.exports = [blockCommand, unblockCommand];
