/*****************************************************************************
 *  🤬 REDXBOT302 — plugins/antibadword.js  ★ ULTRA FIXED v4.0 ★
 *
 *  Bad-word filter with delete / warn / kick actions.
 *  Custom word list per group + built-in global list.
 *  Admins, owner, and sudo always exempt.
 *
 *  © 2026 Abdul Rehman Rajpoot — All rights reserved
 *****************************************************************************/

'use strict';

const store          = require('../lib/lightweight_store');
const { getGroupMeta } = require('../lib/groupUtils');
const { cleanJid, resolveOwnerNumber } = require('../lib/isOwner');

/* ── Built-in bad word list (global baseline) ────────────────────────────── */
const BUILTIN_BADWORDS = [
    'gandu','madarchod','bhosdike','bsdk','fucker','bhosda','lauda','laude',
    'betichod','chutiya','randi','chuchi','maa ki chut','behenchod','lund',
    'fuck','dick','bitch','bastard','asshole','shit','cunt','pussy','cock',
    'motherfucker','twat','wanker','douchebag','jackass','moron','retard',
    'scumbag','skank','nigga','slut','whore','prick','faggot','spic','chink',
    'kike','paki','blowjob','handjob','cum','cumshot','jizz','porn','xxx',
    'harami','haramzada','chutiye','gaand','chodne','sala kutta','kamina',
    'fck','fckr','f*ck','b!tch','d!ck','a$$','f@ck',
];

/* ── DB helpers ──────────────────────────────────────────────────────────── */
async function loadConfig(chatId) {
    const cfg = await store.getSetting(chatId, 'antibadword');
    return cfg || { enabled: false, action: 'delete', customWords: [] };
}
async function saveConfig(chatId, cfg) {
    await store.saveSetting(chatId, 'antibadword', cfg);
}

/* ── Warning counter ─────────────────────────────────────────────────────── */
async function incWarning(chatId, userId) {
    const key  = 'antibadword_warnings';
    const data = (await store.getSetting(chatId, key)) || {};
    data[userId] = (data[userId] || 0) + 1;
    await store.saveSetting(chatId, key, data);
    return data[userId];
}
async function resetWarning(chatId, userId) {
    const key  = 'antibadword_warnings';
    const data = (await store.getSetting(chatId, key)) || {};
    delete data[userId];
    await store.saveSetting(chatId, key, data);
}

/* ── Check message text for bad words ───────────────────────────────────── */
function containsBadWord(text, customWords = []) {
    const clean  = text.toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
    const words  = [...BUILTIN_BADWORDS, ...customWords.map(w => w.toLowerCase())];
    const msgArr = clean.split(' ');

    for (const bw of words) {
        if (bw.includes(' ')) {
            if (clean.includes(bw)) return bw;
        } else if (msgArr.includes(bw)) {
            return bw;
        }
    }
    return null;
}

/* ── Admin / bot check ───────────────────────────────────────────────────── */
async function isAdminOrExempt(sock, chatId, senderId) {
    try {
        const meta    = await getGroupMeta(sock, chatId);
        const sNum    = cleanJid(senderId);
        const ownerN  = resolveOwnerNumber();
        if (ownerN && sNum === ownerN) return true;

        const p = meta.participants.find(p =>
            cleanJid(p.id) === sNum || cleanJid(p.lid || '') === sNum
        );
        if (p?.admin) return true;

        // Bot itself exempt
        const botNum = cleanJid(sock.user?.id || '');
        if (botNum && sNum === botNum) return true;
    } catch {}
    return false;
}

/* ── Passive check (called from messageHandler for every group message) ───── */
async function checkAntiBadword(sock, message) {
    const chatId = message.key.remoteJid;
    if (!chatId.endsWith('@g.us')) return false;

    const cfg = await loadConfig(chatId);
    if (!cfg.enabled) return false;
    if (message.key.fromMe) return false;

    const text = (
        message.message?.conversation ||
        message.message?.extendedTextMessage?.text ||
        message.message?.imageMessage?.caption ||
        message.message?.videoMessage?.caption || ''
    );
    if (!text) return false;

    const hitWord = containsBadWord(text, cfg.customWords);
    if (!hitWord) return false;

    const senderId = message.key.participant || message.key.remoteJid;
    if (await isAdminOrExempt(sock, chatId, senderId)) return false;

    const senderNum = cleanJid(senderId);

    // Check bot is admin
    const meta   = await getGroupMeta(sock, chatId).catch(() => ({ participants: [] }));
    const botNum = cleanJid(sock.user?.id || '');
    const bot    = meta.participants.find(p => cleanJid(p.id) === botNum);
    if (!bot?.admin) return false; // can't act without admin

    // Delete message
    try { await sock.sendMessage(chatId, { delete: message.key }); } catch {}

    const action = cfg.action || 'delete';

    if (action === 'kick') {
        try {
            await sock.groupParticipantsUpdate(chatId, [senderId], 'remove');
            await sock.sendMessage(chatId, {
                text:
`╭───( 🤬 ANTIBADWORD )───
├ 🚫 *User Kicked!*
├
├ 👤 *User:* @${senderNum}
├ ❌ *Reason:* Bad language
╰──────────────────────☉`,
                mentions: [senderId]
            });
        } catch {}

    } else if (action === 'warn') {
        const warns = await incWarning(chatId, senderId);
        if (warns >= 3) {
            try {
                await sock.groupParticipantsUpdate(chatId, [senderId], 'remove');
                await resetWarning(chatId, senderId);
                await sock.sendMessage(chatId, {
                    text:
`╭───( 🤬 ANTIBADWORD )───
├ 🚫 *Kicked After 3 Warnings!*
├
├ 👤 *User:* @${senderNum}
╰──────────────────────☉`,
                    mentions: [senderId]
                });
            } catch {}
        } else {
            await sock.sendMessage(chatId, {
                text:
`╭───( 🤬 ANTIBADWORD )───
├ ⚠️ *Warning ${warns}/3*
├
├ 👤 *User:* @${senderNum}
├ ❌ Bad language is not allowed!
${warns >= 2 ? '├ ⛔ *Next = KICK!*' : ''}
╰──────────────────────☉`,
                mentions: [senderId]
            });
        }

    } else {
        // action === 'delete'
        await sock.sendMessage(chatId, {
            text:
`╭───( 🤬 ANTIBADWORD )───
├ 🗑️ *Message Deleted*
├
├ 👤 *User:* @${senderNum}
├ ❌ Bad language is not allowed here!
╰──────────────────────☉`,
            mentions: [senderId]
        });
    }

    return true;
}

/* ── Plugin command handler ──────────────────────────────────────────────── */
module.exports = {
    command    : 'antibadword',
    aliases    : ['abw', 'badword', 'antibad', 'badfilter'],
    category   : 'admin',
    description: '🤬 Filter and delete bad/inappropriate words in groups',
    usage      : '.antibadword on|off|add|remove|list|action|status',
    groupOnly  : true,
    adminOnly  : true,

    async handler(sock, message, args, context = {}) {
        const chatId = context.chatId || message.key.remoteJid;
        const cfg    = await loadConfig(chatId);
        const action = (args[0] || '').toLowerCase().trim();
        const val    = args.slice(1).join(' ').toLowerCase().trim();

        if (!action || action === 'status') {
            return sock.sendMessage(chatId, {
                text:
`╭───( 🤬 ANTIBADWORD )───
├
├ ⚡ *Status:*   ${cfg.enabled ? '✅ ACTIVE' : '❌ OFFLINE'}
├ 🎯 *Action:*  ${(cfg.action || 'delete').toUpperCase()}
├ 📝 *Custom Words:* ${cfg.customWords?.length || 0}
├ 🔤 *Built-in:* ${BUILTIN_BADWORDS.length} words
├
├ ─── 𝗖𝗼𝗺𝗺𝗮𝗻𝗱𝘀 ───
├ • *.antibadword on/off*
├ • *.antibadword action delete|warn|kick*
├ • *.antibadword add <word>*
├ • *.antibadword remove <word>*
├ • *.antibadword list*
╰──────────────────────☉
> 𝑹𝑬𝑫𝑿𝑩𝑶𝑻𝟑𝟎𝟐 🔥`
            }, { quoted: message });
        }

        if (action === 'on') {
            cfg.enabled = true;
            await saveConfig(chatId, cfg);
            return sock.sendMessage(chatId, {
                text: `╭───( 🤬 ANTIBADWORD )───\n├ ✅ *Enabled!* Action: ${cfg.action || 'delete'}\n╰──────────────────────☉`
            }, { quoted: message });
        }

        if (action === 'off') {
            cfg.enabled = false;
            await saveConfig(chatId, cfg);
            return sock.sendMessage(chatId, {
                text: `╭───( 🤬 ANTIBADWORD )───\n├ ❌ *Disabled*\n╰──────────────────────☉`
            }, { quoted: message });
        }

        if (action === 'action') {
            if (!['delete', 'warn', 'kick'].includes(val)) {
                return sock.sendMessage(chatId, { text: '❌ Choose: delete / warn / kick' }, { quoted: message });
            }
            cfg.action = val;
            await saveConfig(chatId, cfg);
            return sock.sendMessage(chatId, { text: `✅ Action set to: *${val.toUpperCase()}*` }, { quoted: message });
        }

        if (action === 'add') {
            if (!val) return sock.sendMessage(chatId, { text: '❌ Usage: .antibadword add <word>' }, { quoted: message });
            if (!cfg.customWords) cfg.customWords = [];
            if (cfg.customWords.includes(val)) return sock.sendMessage(chatId, { text: `❌ \`${val}\` already in list.` }, { quoted: message });
            cfg.customWords.push(val);
            await saveConfig(chatId, cfg);
            return sock.sendMessage(chatId, { text: `✅ Added: \`${val}\`\nTotal custom: ${cfg.customWords.length}` }, { quoted: message });
        }

        if (action === 'remove' || action === 'del') {
            if (!val) return sock.sendMessage(chatId, { text: '❌ Usage: .antibadword remove <word>' }, { quoted: message });
            if (!cfg.customWords?.includes(val)) return sock.sendMessage(chatId, { text: `❌ \`${val}\` not in list.` }, { quoted: message });
            cfg.customWords = cfg.customWords.filter(w => w !== val);
            await saveConfig(chatId, cfg);
            return sock.sendMessage(chatId, { text: `✅ Removed: \`${val}\`\nRemaining: ${cfg.customWords.length}` }, { quoted: message });
        }

        if (action === 'list') {
            const cw = cfg.customWords || [];
            if (!cw.length) {
                return sock.sendMessage(chatId, { text: `📝 *No custom words added.*\nUse \`.antibadword add <word>\` to add.` }, { quoted: message });
            }
            const list = cw.map((w, i) => `  *${i + 1}.* \`${w}\``).join('\n');
            return sock.sendMessage(chatId, {
                text: `╭───( 🤬 CUSTOM WORDS )───\n${list}\n├\n├ Total: ${cw.length}\n╰──────────────────────☉`
            }, { quoted: message });
        }

        return sock.sendMessage(chatId, { text: '❌ Unknown. Use `.antibadword status` for help.' }, { quoted: message });
    },

    checkAntiBadword,
};

module.exports.checkAntiBadword = checkAntiBadword;
