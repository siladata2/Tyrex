/*****************************************************************************
 *  plugins/antistatus.js — TYREX_KSH MD
 *  Anti-Status Mention System
 *  - Inazuia watu kutuma "status mentions" kwenye group
 *  - Actions: delete | warn | kick
 *  - Warn limit inaweza kubadilishwa
 *  Powered By TYREX_KSH TECH
 *****************************************************************************/

'use strict';

const fs   = require('fs');
const path = require('path');

const DATA_DIR       = path.join(__dirname, '..', 'data');
const SETTINGS_FILE  = path.join(DATA_DIR, 'antistatus.json');
const WARNS_FILE     = path.join(DATA_DIR, 'antistatus_warns.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

/* ─── Random Insults for Admins ─────────────────────────────────────────── */
const ADMIN_INSULTS = [
    '🤦‍♀️ *Seriously admin?* You know better than this!',
    '🧠 *Use your brain cells!* Status mentions are forbidden!',
    '👑 *Admin?* Never mind. Just don\'t do that again!',
    '💀 *Even admins can\'t status mention here!*',
    '🤡 *Admin caught in 4K!* Status mentions are a no-no!',
];
const getRandomInsult = () => ADMIN_INSULTS[Math.floor(Math.random() * ADMIN_INSULTS.length)];

/* ─── File Helpers ──────────────────────────────────────────────────────── */
function readJson(file, fallback = {}) {
    try {
        if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {}
    return fallback;
}
function writeJson(file, data) {
    try { fs.writeFileSync(file, JSON.stringify(data, null, 2)); return true; }
    catch { return false; }
}

/* ─── Settings ──────────────────────────────────────────────────────────── */
async function getAntiStatusSettings(groupId) {
    const data = readJson(SETTINGS_FILE, {});
    return data[groupId] || { enabled: false, action: 'delete', warnLimit: 3 };
}

async function saveAntiStatusSettings(groupId, settings) {
    const data = readJson(SETTINGS_FILE, {});
    data[groupId] = settings;
    return writeJson(SETTINGS_FILE, data);
}

/* ─── Warnings ──────────────────────────────────────────────────────────── */
async function addAntiStatusWarn(groupId, userId) {
    const key  = `${groupId}|${userId}`;
    const data = readJson(WARNS_FILE, {});
    data[key]  = (data[key] || 0) + 1;
    writeJson(WARNS_FILE, data);
    return data[key];
}

async function resetAntiStatusWarns(groupId, userId) {
    const key  = `${groupId}|${userId}`;
    const data = readJson(WARNS_FILE, {});
    delete data[key];
    writeJson(WARNS_FILE, data);
    return true;
}

/* ─── Message Formatter ─────────────────────────────────────────────────── */
function formatStatusMsg(text, botName = 'TYREX_KSH MD') {
    return (
        `*╭┈┈┄⊰ ${botName} - ANTI STATUS ⊱┄┄┄◈*\n\n` +
        `${text}\n` +
        `*╰┄┄┄┄┄┈┈┈┈┄┄┄◈*\n` +
        `> © 𝐏𝐎𝐖𝐄𝐑𝐄𝐃 𝐁𝐘 𝐓𝐘𝐑𝐄𝐗-𝐊𝐒𝐇-𝐓𝐄𝐂𝐇`
    );
}

/* ─── Helper: Check if sender is admin of group ─────────────────────────── */
function isSenderAdmin(groupMeta, senderJid) {
    if (!groupMeta?.participants) return false;
    const clean = (j) => (j || '').split(':')[0].split('@')[0];
    const sNum  = clean(senderJid);
    for (const p of groupMeta.participants) {
        if (p.admin !== 'admin' && p.admin !== 'superadmin') continue;
        if (clean(p.id) === sNum || clean(p.lid) === sNum || clean(p.phoneNumber) === sNum) return true;
    }
    return false;
}

function isBotAdmin(groupMeta, botJid) {
    if (!groupMeta?.participants) return false;
    const clean = (j) => (j || '').split(':')[0].split('@')[0];
    const bNum  = clean(botJid);
    for (const p of groupMeta.participants) {
        if (p.admin !== 'admin' && p.admin !== 'superadmin') continue;
        if (clean(p.id) === bNum || clean(p.lid) === bNum || clean(p.phoneNumber) === bNum) return true;
    }
    return false;
}

/* ═════════════════════════════════════════════════════════════════════════
 *  MAIN HANDLER — Status Mention Detection
 *  Hii inaitwa kwenye kila message inayoingia kutoka index.js
 * ═════════════════════════════════════════════════════════════════════════ */
async function handleStatusMention(conn, msg, opts = {}) {
    try {
        const from   = msg.key?.remoteJid || '';
        const sender = msg.key?.participant || msg.key?.remoteJid;

        // Lazima iwe group
        if (!from.endsWith('@g.us')) return false;

        // Angalia kama ni status mention
        const isStatusMention =
            msg.message?.groupStatusMentionMessage ||
            msg.message?.extendedTextMessage?.contextInfo?.remoteJid === 'status@broadcast' ||
            msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.includes('status@broadcast');

        if (!isStatusMention) return false;

        const settings = await getAntiStatusSettings(from);
        if (!settings.enabled) return false;

        // Ruhusu owner/sudo
        if (opts.isOwner || opts.isSudo) return false;

        // Pata group meta
        let groupMeta = null;
        try { groupMeta = await conn.groupMetadata(from); } catch {}

        const botJid    = conn.user?.id || '';
        const senderAdm = isSenderAdmin(groupMeta, sender);
        const botAdm    = isBotAdmin(groupMeta, botJid);
        const botName   = opts.botName || 'TYREX_KSH MD';
        const shortNum  = (sender || '').split('@')[0].split(':')[0];

        // Admin akituma status mention → mwambie aache, usifute
        if (senderAdm) {
            await conn.sendMessage(from, {
                text: formatStatusMsg(`${getRandomInsult()}\n> └ @${shortNum}`, botName),
                mentions: [sender],
            }, { quoted: msg });
            return true;
        }

        // Futa ujumbe wa status mention
        try { await conn.sendMessage(from, { delete: msg.key }); } catch {}

        const action = settings.action || 'delete';

        /* ─── ACTION: KICK ─── */
        if (action === 'kick') {
            if (!botAdm) {
                await conn.sendMessage(from, {
                    text: formatStatusMsg(
                        `@${shortNum} sent status mention.\n> Make me admin to kick! 😤`,
                        botName
                    ),
                    mentions: [sender],
                }, { quoted: msg });
                return true;
            }
            try { await conn.groupParticipantsUpdate(from, [sender], 'remove'); } catch {}
            await conn.sendMessage(from, {
                text: formatStatusMsg(`🚫 @${shortNum} KICKED for status mention!`, botName),
                mentions: [sender],
            });
            return true;
        }

        /* ─── ACTION: WARN ─── */
        if (action === 'warn') {
            const maxWarns  = settings.warnLimit || 3;
            const warnCount = await addAntiStatusWarn(from, sender);
            const remaining = maxWarns - warnCount;

            if (warnCount >= maxWarns) {
                await resetAntiStatusWarns(from, sender);
                if (botAdm) {
                    try { await conn.groupParticipantsUpdate(from, [sender], 'remove'); } catch {}
                    await conn.sendMessage(from, {
                        text: formatStatusMsg(
                            `🚨 @${shortNum} KICKED!\n> Warns: ${warnCount}/${maxWarns}`,
                            botName
                        ),
                        mentions: [sender],
                    });
                }
                return true;
            }

            await conn.sendMessage(from, {
                text: formatStatusMsg(
                    `⚠️ @${shortNum} WARNED!\n> Warns: ${warnCount}/${maxWarns}\n> ${remaining} more and you're GONE!`,
                    botName
                ),
                mentions: [sender],
            });
            return true;
        }

        /* ─── ACTION: DELETE (default) ─── */
        if (action === 'delete') {
            await conn.sendMessage(from, {
                text: formatStatusMsg(
                    `📵 @${shortNum}, status mentions are NOT allowed here!\n> Message deleted.`,
                    botName
                ),
                mentions: [sender],
            });
            return true;
        }

        return true;
    } catch (e) {
        console.error('[antistatus] handleStatusMention error:', e.message);
        return false;
    }
}

/* ═════════════════════════════════════════════════════════════════════════
 *  COMMAND: .antistatus  (on | off | action | warnlimit | status)
 * ═════════════════════════════════════════════════════════════════════════ */
module.exports = {
    command: 'antistatus',
    aliases: ['antistat', 'astatus'],
    category: 'group',
    description: 'Anti-Status mention protection (delete / warn / kick)',
    usage: '.antistatus on | off | action delete|warn|kick | warnlimit 1-10 | status',

    async handler(sock, message, args, context = {}) {
        const chatId   = context.chatId || message.key.remoteJid;
        const sender   = message.key.participant || message.key.remoteJid;
        const isOwner  = context.isOwner || false;
        const isAdmin  = context.isAdmin || false;
        const pfx      = context.prefix || '.';
        const botName  = context.botName || 'TYREX_KSH MD';
        const shortNum = sender.split('@')[0].split(':')[0];

        // Group only
        if (!chatId.endsWith('@g.us')) {
            return sock.sendMessage(chatId, {
                text: '❌ *This command can only be used in groups!*',
                mentions: [sender],
            }, { quoted: message });
        }

        // Authorization: owner/sudo/admin
        if (!isOwner && !isAdmin) {
            return sock.sendMessage(chatId, {
                text: '❌ *Only group admins and bot owner can use this command!*',
                mentions: [sender],
            }, { quoted: message });
        }

        const cfg    = await getAntiStatusSettings(chatId);
        const action = (args[0] || '').toLowerCase();

        const reply = (text) => sock.sendMessage(chatId, {
            text,
            mentions: [sender],
        }, { quoted: message });

        /* ─── No args → show status ─── */
        if (!action || action === 'status') {
            return reply(
                `*╭┈┈┄⊰ ${botName} - ANTI-STATUS ⊱┄┄┄◈*\n\n` +
                `*┋ •> 🔒 Status:* ${cfg.enabled ? '✅ ENABLED' : '❌ DISABLED'}\n` +
                `*┋ •> ⚡ Action:* ${cfg.action}\n` +
                `*┋ •> 📛 Warn Limit:* ${cfg.warnLimit}\n` +
                `*┋*\n` +
                `*┋ •> 📋 Usage:*\n` +
                `*┋ •> ${pfx}antistatus on/off\n` +
                `*┋ •> ${pfx}antistatus action delete/warn/kick\n` +
                `*┋ •> ${pfx}antistatus warnlimit <number>\n` +
                `*╰┄┄┄┄┄┈┈┈┈┄┄┄◈*\n` +
                `> © 𝐏𝐎𝐖𝐄𝐑𝐄𝐃 𝐁𝐘 𝐓𝐘𝐑𝐄𝐗-𝐊𝐒𝐇-𝐓𝐄𝐂𝐇`
            );
        }

        /* ─── ON ─── */
        if (action === 'on' || action === 'enable') {
            cfg.enabled = true;
            await saveAntiStatusSettings(chatId, cfg);
            return reply(
                `*╭┈┈┄⊰ ${botName} - ANTI-STATUS ⊱┄┄┄◈*\n\n` +
                `*┋ •> 🔒 Anti-status has been* *ENABLED*\n` +
                `*┋ •> 👤 Enabled by:* @${shortNum}\n` +
                `*╰┄┄┄┄┄┈┈┈┈┄┄┄◈*`
            );
        }

        /* ─── OFF ─── */
        if (action === 'off' || action === 'disable') {
            cfg.enabled = false;
            await saveAntiStatusSettings(chatId, cfg);
            return reply(
                `*╭┈┈┄⊰ ${botName} - ANTI-STATUS ⊱┄┄┄◈*\n\n` +
                `*┋ •> 🔓 Anti-status has been* *DISABLED*\n` +
                `*┋ •> 👤 Disabled by:* @${shortNum}\n` +
                `*╰┄┄┄┄┄┈┈┈┈┄┄┄◈*`
            );
        }

        /* ─── ACTION ─── */
        if (action === 'action') {
            const newAction = (args[1] || '').toLowerCase();
            if (!['delete', 'warn', 'kick'].includes(newAction)) {
                return reply(`❌ Invalid action! Use: ${pfx}antistatus action delete/warn/kick`);
            }
            cfg.action = newAction;
            await saveAntiStatusSettings(chatId, cfg);
            return reply(
                `*╭┈┈┄⊰ ${botName} - ANTI-STATUS ⊱┄┄┄◈*\n\n` +
                `*┋ •> ⚡ Action set to:* *${newAction.toUpperCase()}*\n` +
                `*┋ •> 👤 Changed by:* @${shortNum}\n` +
                `*╰┄┄┄┄┄┈┈┈┈┄┄┄◈*`
            );
        }

        /* ─── WARN LIMIT ─── */
        if (action === 'warnlimit') {
            const n = parseInt(args[1], 10);
            if (isNaN(n) || n < 1 || n > 10) {
                return reply('❌ Invalid limit! Use a number between 1 and 10.');
            }
            cfg.warnLimit = n;
            await saveAntiStatusSettings(chatId, cfg);
            return reply(
                `*╭┈┈┄⊰ ${botName} - ANTI-STATUS ⊱┄┄┄◈*\n\n` +
                `*┋ •> 📛 Warn limit set to:* *${n}*\n` +
                `*┋ •> 👤 Changed by:* @${shortNum}\n` +
                `*╰┄┄┄┄┄┈┈┈┈┄┄┄◈*`
            );
        }

        return reply(`❌ *Invalid option!*\n\nUse: ${pfx}antistatus <on/off/action/warnlimit/status>`);
    },

    // Exported for index.js
    handleStatusMention,
    getAntiStatusSettings,
    saveAntiStatusSettings,
};