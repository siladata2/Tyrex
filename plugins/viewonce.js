/*****************************************************************************
 *  👁️ REDXBOT302 — plugins/viewonce.js  ★ ULTRA v5.0 ★
 *
 *  Commands:
 *    .vv         — retrieve view-once (reply to it) → your DM
 *    .vv group   — resend in the same chat
 *    .vv2        — silent DM + delete command (owner/sudo)
 *    .vvadv      — send to owner DM + linked device inbox
 *    .vvset      — add auto-intercept trigger word/emoji
 *    .vvremove   — remove trigger
 *    .vvlist     — list all triggers
 *    .vvstats    — show intercept stats
 *
 *  Auto-intercept: when anyone in a group replies to a view-once
 *  with a trigger word, bot saves it to the owner's DM silently.
 *
 *  © 2026 Abdul Rehman Rajpoot — All rights reserved
 *****************************************************************************/

'use strict';

const fs   = require('fs');
const path = require('path');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');

/* ── Config ──────────────────────────────────────────────────────────────── */
const DATA_DIR      = path.join(process.cwd(), 'data');
const TRIGGERS_FILE = path.join(DATA_DIR, 'vv_triggers.json');
const STATS_FILE    = path.join(DATA_DIR, 'vv_stats.json');

/* ── Stats helpers ───────────────────────────────────────────────────────── */
function loadStats() {
    try { return JSON.parse(fs.readFileSync(STATS_FILE, 'utf8')); }
    catch { return { intercepted: 0, manual: 0, failed: 0, lastCapture: null }; }
}
function saveStats(s) {
    try { fs.mkdirSync(DATA_DIR, { recursive: true }); fs.writeFileSync(STATS_FILE, JSON.stringify(s, null, 2)); } catch {}
}
function incStat(key) {
    const s = loadStats();
    s[key] = (s[key] || 0) + 1;
    s.lastCapture = new Date().toISOString();
    saveStats(s);
}

/* ── Trigger helpers ─────────────────────────────────────────────────────── */
function loadTriggers() {
    try { return JSON.parse(fs.readFileSync(TRIGGERS_FILE, 'utf8')); }
    catch { return ['👀', 'save', 'vv', '🔥', '😮']; }
}
function saveTriggers(list) {
    try {
        fs.mkdirSync(DATA_DIR, { recursive: true });
        fs.writeFileSync(TRIGGERS_FILE, JSON.stringify(list, null, 2));
        return true;
    } catch { return false; }
}

/* ── JID / number helpers ────────────────────────────────────────────────── */
function cleanNum(jid = '') {
    return String(jid).replace(/^\+/, '').split(':')[0].split('@')[0].trim();
}
function toJid(num) {
    const n = cleanNum(num);
    return n ? n + '@s.whatsapp.net' : null;
}
function getSender(message, context = {}) {
    if (context.sender) return context.sender;
    const jid = message.key?.remoteJid || '';
    return jid.endsWith('@g.us') ? (message.key?.participant || '') : jid;
}
function getSessionJid(sock) {
    const num = cleanNum(sock.user?.id || '');
    return num ? num + '@s.whatsapp.net' : null;
}

/* ── Owner check ─────────────────────────────────────────────────────────── */
function isOwnerOrSudo(sock, senderJid, context = {}) {
    if (context.isOwner)              return true;
    if (context.senderIsOwnerOrSudo)  return true;
    if (context.fromMe)               return true;
    if (!senderJid)                   return false;

    const sNum = cleanNum(senderJid);
    const sessNum = cleanNum(sock.user?.id || '');
    if (sessNum && sNum === sessNum) return true;

    try {
        const cfg = require('../settings');
        if (cleanNum(cfg.ownerNumber) === sNum) return true;
    } catch {}

    const envOwner = cleanNum(process.env.OWNER_NUMBER || '');
    if (envOwner && sNum === envOwner) return true;

    return false;
}

/* ── View-once detection — covers ALL 4 WhatsApp formats ────────────────── */
function detectViewOnce(quotedMsg) {
    if (!quotedMsg) return null;

    function extract(wrapper) {
        if (!wrapper) return null;
        const m = wrapper.message || wrapper;
        if (m.imageMessage) return { mtype: 'image', msgObj: m.imageMessage };
        if (m.videoMessage) return { mtype: 'video', msgObj: m.videoMessage };
        if (m.audioMessage) return { mtype: 'audio', msgObj: m.audioMessage };
        return null;
    }

    // Format 1-3: viewOnce wrappers
    for (const k of ['viewOnceMessage', 'viewOnceMessageV2', 'viewOnceMessageV2Extension']) {
        const r = extract(quotedMsg[k]);
        if (r) return r;
    }

    // Format 4: viewOnce flag on the media directly
    for (const [k, mtype] of [['imageMessage','image'], ['videoMessage','video'], ['audioMessage','audio']]) {
        if (quotedMsg[k]?.viewOnce === true) return { mtype, msgObj: quotedMsg[k] };
    }

    return null;
}

/* ── Download with retry ─────────────────────────────────────────────────── */
async function downloadToBuffer(msgObj, mtype, retries = 2) {
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            const stream = await downloadContentFromMessage(msgObj, mtype);
            const chunks = [];
            for await (const c of stream) chunks.push(c);
            if (!chunks.length) throw new Error('Empty buffer');
            return Buffer.concat(chunks);
        } catch (e) {
            if (attempt >= retries) throw e;
            await new Promise(r => setTimeout(r, 1200 * (attempt + 1)));
        }
    }
}

/* ── Send media to a JID ─────────────────────────────────────────────────── */
async function sendMedia(sock, targetJid, buf, mtype, msgObj, caption, quotedMsg) {
    const opts = quotedMsg ? { quoted: quotedMsg } : {};
    const fallback = `👁️ *𝗩𝗶𝗲𝘄-𝗢𝗻𝗰𝗲 𝗠𝗲𝗱𝗶𝗮*\n\n_Captured by REDXBOT302_ 🔥`;

    if (mtype === 'image') {
        await sock.sendMessage(targetJid, { image: buf, caption: caption || fallback }, opts);
    } else if (mtype === 'video') {
        await sock.sendMessage(targetJid, { video: buf, mimetype: 'video/mp4', caption: caption || fallback }, opts);
    } else if (mtype === 'audio') {
        await sock.sendMessage(targetJid, {
            audio: buf,
            mimetype: msgObj?.mimetype || (msgObj?.ptt ? 'audio/ogg; codecs=opus' : 'audio/mp4'),
            ptt: !!msgObj?.ptt,
        }, opts);
    }
}

/* ── Auto-intercept (called from messageHandler for EVERY message) ─────────── */
async function handleAutoVV(sock, msg) {
    try {
        const triggers = loadTriggers();
        if (!triggers.length) return;

        const from = msg.key?.remoteJid;
        if (!from) return;

        const body = (
            msg.message?.conversation ||
            msg.message?.extendedTextMessage?.text ||
            msg.message?.imageMessage?.caption ||
            msg.message?.videoMessage?.caption || ''
        ).trim().toLowerCase();

        const matched = triggers.find(t => body === t.toLowerCase() || body.includes(t.toLowerCase()));
        if (!matched) return;

        const contextInfo = msg.message?.extendedTextMessage?.contextInfo;
        if (!contextInfo?.quotedMessage) return;

        const detected = detectViewOnce(contextInfo.quotedMessage);
        if (!detected) return;

        const { mtype, msgObj } = detected;
        const buf = await downloadToBuffer(msgObj, mtype);

        const targetJid = getSessionJid(sock);
        if (!targetJid) return;

        const senderNum = cleanNum(msg.key?.participant || from);
        const caption =
`╭───( 👁️ AUTO VV )───
├ 🤫 *Intercepted View-Once*
├
├ 👤 *From:* @${senderNum}
├ 🔑 *Trigger:* "${matched}"
├ 📍 *In:* ${from.endsWith('@g.us') ? '👥 Group' : '💬 DM'}
╰──────────────────────☉
> 𝑹𝑬𝑫𝑿𝑩𝑶𝑻𝟑𝟎𝟐 🔥`;

        await sendMedia(sock, targetJid, buf, mtype, msgObj, caption);
        incStat('intercepted');
    } catch (e) {
        incStat('failed');
        console.error('[VV-AUTO]', e.message);
    }
}

/* ══════════════════════════════════════
   .vv — everyone can use
══════════════════════════════════════ */
const vvCommand = {
    command    : 'viewonce',
    aliases    : ['vv', 'viewmedia', 'vvget', 'vvopen', 'openonce'],
    category   : 'general',
    description: '👁️ Retrieve a view-once image/video/audio',
    usage      : '.vv (reply to view-once) | .vv group — resend in chat',
    ownerOnly  : false,

    async handler(sock, message, args, context = {}) {
        const chatId    = context.chatId || message.key.remoteJid;
        const senderJid = getSender(message, context);
        const sub       = (Array.isArray(args) ? args[0] : args || '').toLowerCase().trim();

        try { await sock.sendMessage(chatId, { react: { text: '⏳', key: message.key } }); } catch {}

        const contextInfo = message.message?.extendedTextMessage?.contextInfo;
        const quotedMsg   = contextInfo?.quotedMessage;

        if (!quotedMsg) {
            await sock.sendMessage(chatId, { react: { text: '❌', key: message.key } });
            return sock.sendMessage(chatId, {
                text:
`╭───( 👁️ VIEWONCE )───
├ ❌ *No quoted message found!*
├
├ 💡 *How to use:*
├ 1️⃣ Long-press the 👁️ message
├ 2️⃣ Tap *Reply*
├ 3️⃣ Send *.vv*
╰──────────────────────☉`
            }, { quoted: message });
        }

        const detected = detectViewOnce(quotedMsg);
        if (!detected) {
            await sock.sendMessage(chatId, { react: { text: '❌', key: message.key } });
            return sock.sendMessage(chatId, {
                text: `❌ *That's not a view-once message.*\n\nMake sure you replied to a 👁️ view-once image, video, or voice note.`
            }, { quoted: message });
        }

        try {
            const { mtype, msgObj } = detected;
            const buf = await downloadToBuffer(msgObj, mtype);

            let targetJid;
            if (sub === 'group' || sub === 'here') {
                targetJid = chatId;
            } else {
                targetJid = toJid(senderJid) || getSessionJid(sock);
            }

            await sendMedia(sock, targetJid, buf, mtype, msgObj);
            await sock.sendMessage(chatId, { react: { text: '👁️', key: message.key } });

            if (sub !== 'group' && sub !== 'here') {
                await sock.sendMessage(chatId, {
                    text: `📥 *Sent to your DM!* Check your inbox 💬`
                }, { quoted: message });
            }
            incStat('manual');
        } catch (err) {
            incStat('failed');
            console.error('[VV]', err.message);
            await sock.sendMessage(chatId, { react: { text: '❌', key: message.key } });
            await sock.sendMessage(chatId, {
                text: `❌ *Failed to retrieve view-once.*\n> ${err.message}\n\n_The media may have expired._`
            }, { quoted: message });
        }
    }
};

/* ══════════════════════════════════════
   .vv2 — silent DM (owner/sudo only)
══════════════════════════════════════ */
const vv2Command = {
    command    : 'vv2',
    aliases    : ['vvdm', 'vvinbox', 'vvsilent'],
    category   : 'owner',
    description: '🤫 View-once → DM silently, deletes command msg (owner/sudo)',
    usage      : '.vv2 (reply to view-once)',

    async handler(sock, message, args, context = {}) {
        const chatId    = context.chatId || message.key.remoteJid;
        const senderJid = getSender(message, context);

        if (!isOwnerOrSudo(sock, senderJid, context)) {
            return sock.sendMessage(chatId, {
                text: `⛔ *Owner/Sudo only.*`
            }, { quoted: message });
        }

        const contextInfo = message.message?.extendedTextMessage?.contextInfo;
        if (!contextInfo?.quotedMessage) return;
        const detected = detectViewOnce(contextInfo.quotedMessage);
        if (!detected) return;

        try {
            const { mtype, msgObj } = detected;
            const buf = await downloadToBuffer(msgObj, mtype);
            const callerDm = toJid(senderJid) || getSessionJid(sock);

            await sendMedia(sock, callerDm, buf, mtype, msgObj,
                `📥 *𝗩𝗶𝗲𝘄-𝗢𝗻𝗰𝗲 (𝗦𝗶𝗹𝗲𝗻𝘁)*\n\n_REDXBOT302_ 🤫`);

            await sock.sendMessage(chatId, { text: `📥 *Sent silently.* 🤫` }, { quoted: message });
            await new Promise(r => setTimeout(r, 2000));
            try { await sock.sendMessage(chatId, { delete: message.key }); } catch {}
            incStat('manual');
        } catch (e) {
            console.error('[VV2]', e.message);
            await sock.sendMessage(chatId, { text: `❌ Failed: ${e.message}` }, { quoted: message });
        }
    }
};

/* ══════════════════════════════════════
   .vvadv — send to owner + linked device
══════════════════════════════════════ */
const vvAdvCommand = {
    command    : 'vvadv',
    aliases    : ['vvforward', 'vvall', 'vvboth'],
    category   : 'owner',
    description: '📥 Advanced VV: send to all owner inboxes',
    usage      : '.vvadv (reply to view-once)',

    async handler(sock, message, args, context = {}) {
        const chatId    = context.chatId || message.key.remoteJid;
        const senderJid = getSender(message, context);

        if (!isOwnerOrSudo(sock, senderJid, context)) {
            return sock.sendMessage(chatId, { text: '⛔ *Owner/Sudo only.*' }, { quoted: message });
        }

        const contextInfo = message.message?.extendedTextMessage?.contextInfo;
        if (!contextInfo?.quotedMessage) {
            return sock.sendMessage(chatId, { text: '❌ Reply to a view-once first.' }, { quoted: message });
        }
        const detected = detectViewOnce(contextInfo.quotedMessage);
        if (!detected) return sock.sendMessage(chatId, { text: '❌ Not a view-once.' }, { quoted: message });

        try {
            const { mtype, msgObj } = detected;
            const buf = await downloadToBuffer(msgObj, mtype);

            const sessionJid = getSessionJid(sock);
            if (sessionJid) await sendMedia(sock, sessionJid, buf, mtype, msgObj, `📥 *𝗩𝗩 𝗔𝗱𝘃𝗮𝗻𝗰𝗲𝗱*\n_REDXBOT302_ 👁️`);

            const callerJid = toJid(senderJid);
            if (callerJid && callerJid !== sessionJid) {
                await sendMedia(sock, callerJid, buf, mtype, msgObj, `📥 *𝗩𝗩 𝗔𝗱𝘃𝗮𝗻𝗰𝗲𝗱*\n_REDXBOT302_ 👁️`);
            }

            await sock.sendMessage(chatId, { react: { text: '👁️', key: message.key } });
            await sock.sendMessage(chatId, {
                text: `📥 *Sent to all owner inboxes!* ✅`
            }, { quoted: message });
            incStat('manual');
        } catch (e) {
            console.error('[VVADV]', e.message);
            await sock.sendMessage(chatId, { text: `❌ Error: ${e.message}` }, { quoted: message });
        }
    }
};

/* ══════════════════════════════════════
   .vvset — add auto-intercept trigger
══════════════════════════════════════ */
const vvSetCommand = {
    command    : 'vvset',
    aliases    : ['vvadd', 'vvtrigger', 'vvtrig'],
    category   : 'owner',
    description: '➕ Add an auto-intercept trigger word/emoji',
    usage      : '.vvset <word or emoji>',

    async handler(sock, message, args, context = {}) {
        const chatId  = context.chatId || message.key.remoteJid;
        const trigger = (Array.isArray(args) ? args.join(' ') : args || '').trim();
        const all     = loadTriggers();

        if (!trigger) {
            return sock.sendMessage(chatId, {
                text:
`╭───( 👁️ VV TRIGGERS )───
├ 📌 *Active Triggers:*
├ ${all.map(t => `• \`${t}\``).join('\n├ ') || '• (none)'}
├
├ *Usage:* .vvset <word>
├ *Example:* .vvset 👀
╰──────────────────────☉`
            }, { quoted: message });
        }

        if (all.some(t => t.toLowerCase() === trigger.toLowerCase())) {
            return sock.sendMessage(chatId, {
                text: `✅ \`${trigger}\` is already a trigger.`
            }, { quoted: message });
        }

        all.push(trigger);
        saveTriggers(all);
        return sock.sendMessage(chatId, {
            text:
`╭───( 👁️ VV TRIGGER )───
├ ✅ *Trigger Added!*
├ 🔑 Word: \`${trigger}\`
├ 📊 Total: ${all.length}
╰──────────────────────☉`
        }, { quoted: message });
    }
};

/* ══════════════════════════════════════
   .vvremove — remove trigger
══════════════════════════════════════ */
const vvRemoveCommand = {
    command    : 'vvremove',
    aliases    : ['vvdel', 'vvunset', 'vvrm'],
    category   : 'owner',
    description: '🗑️ Remove a view-once auto-intercept trigger',
    usage      : '.vvremove <word>',

    async handler(sock, message, args, context = {}) {
        const chatId  = context.chatId || message.key.remoteJid;
        const trigger = (Array.isArray(args) ? args.join(' ') : args || '').trim();
        if (!trigger) return sock.sendMessage(chatId, { text: `*Usage:* \`.vvremove <trigger>\`` }, { quoted: message });

        let triggers = loadTriggers();
        const idx    = triggers.findIndex(t => t.toLowerCase() === trigger.toLowerCase());
        if (idx === -1) {
            return sock.sendMessage(chatId, {
                text: `❌ \`${trigger}\` not found.\nUse *.vvlist* to see all triggers.`
            }, { quoted: message });
        }

        triggers.splice(idx, 1);
        saveTriggers(triggers);
        return sock.sendMessage(chatId, {
            text: `🗑️ Removed: \`${trigger}\`\n📊 Remaining: ${triggers.length}`
        }, { quoted: message });
    }
};

/* ══════════════════════════════════════
   .vvlist — list triggers
══════════════════════════════════════ */
const vvListCommand = {
    command    : 'vvlist',
    aliases    : ['vvtriggers'],
    category   : 'owner',
    description: '📋 List all active view-once auto-intercept triggers',
    usage      : '.vvlist',

    async handler(sock, message, args, context = {}) {
        const chatId   = context.chatId || message.key.remoteJid;
        const triggers = loadTriggers();

        if (!triggers.length) {
            return sock.sendMessage(chatId, {
                text: `📋 *VV Triggers*\n\n_No triggers set._\nUse *.vvset <word>* to add one.`
            }, { quoted: message });
        }

        const list = triggers.map((t, i) => `  *${i + 1}.* \`${t}\``).join('\n');
        return sock.sendMessage(chatId, {
            text:
`╭───( 👁️ VV TRIGGERS )───
├ 📋 *Active Triggers (${triggers.length})*
├
${list}
├
├ Reply to any view-once with one of these → bot saves it 👁️
╰──────────────────────☉`
        }, { quoted: message });
    }
};

/* ══════════════════════════════════════
   .vvstats — statistics
══════════════════════════════════════ */
const vvStatsCommand = {
    command    : 'vvstats',
    aliases    : ['vvcount', 'vvinfo'],
    category   : 'owner',
    description: '📊 View-once intercept statistics',
    usage      : '.vvstats',

    async handler(sock, message, args, context = {}) {
        const chatId = context.chatId || message.key.remoteJid;
        const s      = loadStats();
        const last   = s.lastCapture ? new Date(s.lastCapture).toLocaleString() : 'Never';

        return sock.sendMessage(chatId, {
            text:
`╭───( 👁️ VV STATS )───
├ 👁️ *Auto-intercepted:* ${s.intercepted || 0}
├ 📥 *Manual (.vv):*    ${s.manual     || 0}
├ ❌ *Failed:*          ${s.failed     || 0}
├ 🕒 *Last capture:*   ${last}
╰──────────────────────☉`
        }, { quoted: message });
    }
};

/* ── Exports ─────────────────────────────────────────────────────────────── */
module.exports = [vvCommand, vv2Command, vvAdvCommand, vvSetCommand, vvRemoveCommand, vvListCommand, vvStatsCommand];
module.exports.handleAutoVV = handleAutoVV;
