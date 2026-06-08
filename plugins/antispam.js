/*****************************************************************************
 *  🛡️ REDXBOT302 — plugins/antispam.js  ★ ULTRA FIXED v4.0 ★
 *
 *  Flood-protection for groups.
 *  Actions: warn (then kick) / kick / mute
 *  Rate-window, max-messages, and warn-count are all configurable.
 *
 *  © 2026 Abdul Rehman Rajpoot — All rights reserved
 *****************************************************************************/

'use strict';

const fs   = require('fs');
const path = require('path');
const store          = require('../lib/lightweight_store');
const { getGroupMeta } = require('../lib/groupUtils');
const { cleanJid, resolveOwnerNumber } = require('../lib/isOwner');

/* ── DB / file detection ─────────────────────────────────────────────────── */
const HAS_DB = !!(process.env.MONGO_URL || process.env.POSTGRES_URL || process.env.MYSQL_URL || process.env.DB_URL);
const CONFIG_FILE = path.join(process.cwd(), 'data', 'antispam.json');

/* ── In-memory trackers ──────────────────────────────────────────────────── */
const tracker   = new Map();   // chatId → Map(userId → {count, firstMessageTime, warns})
const metaCache = new Map();   // chatId → {participants, fetchedAt}
const META_TTL  = 5 * 60 * 1000;

/* ── Defaults ────────────────────────────────────────────────────────────── */
const DEFAULT = {
    enabled: false,
    maxMessages: 5,
    windowSeconds: 5,
    action: 'warn',
    warnCount: 3
};

/* ── Config helpers ──────────────────────────────────────────────────────── */
async function loadAll() {
    try {
        if (HAS_DB) {
            const d = await store.getSetting('global', 'antispam');
            return d || { groups: {} };
        }
        if (!fs.existsSync(CONFIG_FILE)) return { groups: {} };
        return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) || { groups: {} };
    } catch { return { groups: {} }; }
}
async function saveAll(cfg) {
    if (HAS_DB) { await store.saveSetting('global', 'antispam', cfg); return; }
    const dir = path.dirname(CONFIG_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2));
}

/* ── Group metadata with cache ───────────────────────────────────────────── */
async function getCachedParticipants(sock, chatId) {
    const c = metaCache.get(chatId);
    if (c && Date.now() - c.fetchedAt < META_TTL) return c.participants;
    try {
        const meta = await getGroupMeta(sock, chatId);
        const participants = meta?.participants || [];
        metaCache.set(chatId, { participants, fetchedAt: Date.now() });
        return participants;
    } catch { return c?.participants || []; }
}

function participantIsAdmin(participants, jid) {
    const n = cleanJid(jid);
    return participants.some(p => {
        if (!['admin', 'superadmin'].includes(p.admin)) return false;
        return cleanJid(p.id) === n || cleanJid(p.lid || '') === n;
    });
}
function botIsAdmin(participants, sock) {
    const n = cleanJid(sock.user?.id || '');
    return participants.some(p => {
        if (!['admin', 'superadmin'].includes(p.admin)) return false;
        return cleanJid(p.id) === n || cleanJid(p.lid || '') === n;
    });
}

/* ── Anti-spam check (called from messageHandler for every group message) ─── */
async function handleAntiSpam(sock, chatId, message, senderId, senderIsOwnerOrSudo) {
    try {
        if (message.key.fromMe || senderIsOwnerOrSudo) return false;

        const all  = await loadAll();
        const gcfg = all.groups[chatId];
        if (!gcfg?.enabled) return false;

        const participants = await getCachedParticipants(sock, chatId);
        if (participantIsAdmin(participants, senderId)) return false;
        const isBotAdm = botIsAdmin(participants, sock);

        const ownerNum = resolveOwnerNumber();
        if (ownerNum && cleanJid(senderId) === ownerNum) return false;

        const now       = Date.now();
        const windowMs  = gcfg.windowSeconds * 1000;

        if (!tracker.has(chatId)) tracker.set(chatId, new Map());
        const gTracker = tracker.get(chatId);

        if (!gTracker.has(senderId)) {
            gTracker.set(senderId, { count: 1, firstMessageTime: now, warns: 0 });
            return false;
        }

        const ud = gTracker.get(senderId);
        if (now - ud.firstMessageTime > windowMs) {
            ud.count = 1;
            ud.firstMessageTime = now;
            return false;
        }

        ud.count++;
        if (ud.count <= gcfg.maxMessages) return false;

        // Spam threshold exceeded
        ud.count = 0;
        ud.firstMessageTime = now;

        const num = cleanJid(senderId);
        const maxW = gcfg.warnCount || 3;

        if (gcfg.action === 'kick') {
            if (!isBotAdm) {
                await sock.sendMessage(chatId, {
                    text: `⚠️ @${num} spamming — bot needs admin to kick.`, mentions: [senderId]
                });
            } else {
                await sock.sendMessage(chatId, {
                    text:
`╭───( 🛡️ ANTISPAM )───
├ 🚫 *Kicked for Spamming!*
├ 👤 *User:* @${num}
╰──────────────────────☉`,
                    mentions: [senderId]
                });
                await sock.groupParticipantsUpdate(chatId, [senderId], 'remove');
            }
            return true;
        }

        // 'warn' (default)
        ud.warns++;
        const warnsLeft = maxW - ud.warns;
        if (warnsLeft <= 0) {
            ud.warns = 0;
            if (!isBotAdm) {
                await sock.sendMessage(chatId, {
                    text: `⚠️ @${num} reached max warnings — bot needs admin to remove.`, mentions: [senderId]
                });
            } else {
                await sock.sendMessage(chatId, {
                    text:
`╭───( 🛡️ ANTISPAM )───
├ 🚫 *Removed After Max Warnings!*
├ 👤 *User:* @${num}
╰──────────────────────☉`,
                    mentions: [senderId]
                });
                await new Promise(r => setTimeout(r, 500));
                await sock.groupParticipantsUpdate(chatId, [senderId], 'remove');
            }
        } else {
            await sock.sendMessage(chatId, {
                text:
`╭───( 🛡️ ANTISPAM )───
├ ⚠️ *Warning ${ud.warns}/${maxW}*
├
├ 👤 *User:* @${num}
├ 🚫 Stop spamming!
${warnsLeft <= 1 ? '├ ⛔ *Next = REMOVAL!*' : `├ 📊 ${warnsLeft} more warning(s) before removal.`}
╰──────────────────────☉`,
                mentions: [senderId]
            });
        }
        return true;
    } catch (e) {
        console.error('[ANTISPAM]', e.message);
        return false;
    }
}

function invalidateGroupCache(chatId) {
    metaCache.delete(chatId);
    tracker.delete(chatId);
}

/* ── Plugin command handler ──────────────────────────────────────────────── */
module.exports = {
    command    : 'antispam',
    aliases    : ['floodprotect', 'antiflood', 'nospam'],
    category   : 'admin',
    description: '🛡️ Flood protection — auto-warn/kick spammers',
    usage      : '.antispam on/off | .antispam set <msgs> <secs> | .antispam action warn/kick | .antispam warns <n>',
    groupOnly  : true,
    adminOnly  : true,

    async handler(sock, message, args, context = {}) {
        const chatId = context.chatId || message.key.remoteJid;
        const isBotAdmin = context.isBotAdmin || false;

        const all  = await loadAll();
        if (!all.groups[chatId]) all.groups[chatId] = { ...DEFAULT };
        const gcfg = all.groups[chatId];
        const cmd  = (args[0] || '').toLowerCase();

        if (!cmd || cmd === 'status') {
            return sock.sendMessage(chatId, {
                text:
`╭───( 🛡️ ANTISPAM STATUS )───
├
├ ⚡ *Status:*       ${gcfg.enabled ? '✅ ACTIVE' : '❌ OFFLINE'}
├ 📊 *Limit:*       ${gcfg.maxMessages} msgs in ${gcfg.windowSeconds}s
├ 🎯 *Action:*      ${gcfg.action.toUpperCase()}
├ ⚠️ *Warn limit:*  ${gcfg.warnCount} warns before removal
├ 🤖 *Bot admin:*   ${isBotAdmin ? '✅' : '❌ (needed for kick/remove)'}
├
├ ─── 𝗖𝗼𝗺𝗺𝗮𝗻𝗱𝘀 ───
├ • *.antispam on/off*
├ • *.antispam set 5 10*  — 5 msgs/10s
├ • *.antispam action warn|kick*
├ • *.antispam warns 3*
╰──────────────────────☉
> 𝑹𝑬𝑫𝑿𝑩𝑶𝑻𝟑𝟎𝟐 🔥`
            }, { quoted: message });
        }

        if (cmd === 'on' || cmd === 'enable') {
            if (gcfg.enabled) return sock.sendMessage(chatId, { text: '⚠️ Already enabled.' }, { quoted: message });
            gcfg.enabled = true;
            await saveAll(all);
            return sock.sendMessage(chatId, {
                text:
`╭───( 🛡️ ANTISPAM )───
├ ✅ *Enabled!*
├ Limit: ${gcfg.maxMessages} msgs in ${gcfg.windowSeconds}s
├ Action: ${gcfg.action.toUpperCase()}
╰──────────────────────☉`
            }, { quoted: message });
        }

        if (cmd === 'off' || cmd === 'disable') {
            gcfg.enabled = false;
            await saveAll(all);
            return sock.sendMessage(chatId, {
                text: `╭───( 🛡️ ANTISPAM )───\n├ ❌ *Disabled*\n╰──────────────────────☉`
            }, { quoted: message });
        }

        if (cmd === 'set') {
            const maxMsgs = parseInt(args[1]);
            const winSecs = parseInt(args[2]);
            if (isNaN(maxMsgs) || isNaN(winSecs) || maxMsgs < 2 || winSecs < 1) {
                return sock.sendMessage(chatId, { text: '❌ Usage: `.antispam set <messages> <seconds>`\nExample: `.antispam set 5 10`' }, { quoted: message });
            }
            gcfg.maxMessages   = maxMsgs;
            gcfg.windowSeconds = winSecs;
            await saveAll(all);
            return sock.sendMessage(chatId, { text: `✅ Limit: *${maxMsgs} msgs* in *${winSecs}s*` }, { quoted: message });
        }

        if (cmd === 'action') {
            const act = (args[1] || '').toLowerCase();
            if (!['warn', 'kick'].includes(act)) {
                return sock.sendMessage(chatId, { text: '❌ Choose: `warn` or `kick`' }, { quoted: message });
            }
            if (act !== 'warn' && !isBotAdmin) {
                await sock.sendMessage(chatId, { text: `⚠️ Action set to *${act.toUpperCase()}* but bot needs admin rights to execute it.` }, { quoted: message });
            }
            gcfg.action = act;
            await saveAll(all);
            return sock.sendMessage(chatId, { text: `✅ Action: *${act.toUpperCase()}*` }, { quoted: message });
        }

        if (cmd === 'warns') {
            const n = parseInt(args[1]);
            if (isNaN(n) || n < 1) return sock.sendMessage(chatId, { text: '❌ Example: `.antispam warns 3`' }, { quoted: message });
            gcfg.warnCount = n;
            await saveAll(all);
            return sock.sendMessage(chatId, { text: `✅ Warn limit: *${n}* before removal.` }, { quoted: message });
        }

        return sock.sendMessage(chatId, { text: '❌ Unknown. Use `.antispam status` for help.' }, { quoted: message });
    },

    handleAntiSpam,
    invalidateGroupCache,
};

module.exports.handleAntiSpam      = handleAntiSpam;
module.exports.invalidateGroupCache = invalidateGroupCache;
