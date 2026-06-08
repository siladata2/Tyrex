'use strict';
/*****************************************************************************
 *  REDXBOT302 — VIEWONCE / VV ULTRA v4.0
 *
 *  Commands:
 *    .vv        — reply to any view-once → send to YOUR DM (everyone can use)
 *    .vv group  — resend in same chat
 *    .vv2       — silent DM + delete command msg (owner/sudo only)
 *    .vvset     — add auto-intercept trigger word/emoji (owner/sudo)
 *    .vvremove  — remove trigger (owner/sudo)
 *    .vvlist    — list all triggers (owner/sudo)
 *    .vvstats   — show intercept stats (owner/sudo)
 *
 *  Auto-intercept: if any group member replies to a view-once with a trigger
 *  word, bot forwards the media to the PAIRED USER'S DM (owner of this instance).
 *
 *  Advanced VV:
 *    - Covers all 4 WhatsApp view-once formats
 *    - Retry logic on download failure
 *    - Forward to linked device inbox
 *    - Stats tracking
 *****************************************************************************/

const fs   = require('fs');
const path = require('path');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');

/* ─── Config ──────────────────────────────────────────────────────────────── */
const TRIGGERS_FILE = path.join(__dirname, '../data/vv_triggers.json');
const STATS_FILE    = path.join(__dirname, '../data/vv_stats.json');

/* ─── Stats ────────────────────────────────────────────────────────────────── */
function loadStats() {
    try { return JSON.parse(fs.readFileSync(STATS_FILE, 'utf8')); }
    catch { return { intercepted: 0, manual: 0, failed: 0, lastCapture: null }; }
}
function saveStats(s) {
    try { fs.mkdirSync(path.dirname(STATS_FILE), { recursive: true }); fs.writeFileSync(STATS_FILE, JSON.stringify(s, null, 2)); } catch {}
}
function incStat(key) {
    const s = loadStats(); s[key] = (s[key] || 0) + 1; s.lastCapture = new Date().toISOString(); saveStats(s);
}

/* ─── Triggers ────────────────────────────────────────────────────────────── */
function loadTriggers() {
    try { return JSON.parse(fs.readFileSync(TRIGGERS_FILE, 'utf8')); }
    catch { return ['👀', 'save', 'vv', '🔥', '😮']; } // sensible defaults
}
function saveTriggers(list) {
    try { fs.mkdirSync(path.dirname(TRIGGERS_FILE), { recursive: true }); fs.writeFileSync(TRIGGERS_FILE, JSON.stringify(list, null, 2)); return true; }
    catch { return false; }
}

/* ─── JID helpers ─────────────────────────────────────────────────────────── */
function normaliseNum(jid = '') {
    return String(jid).replace(/^\+/, '').split(':')[0].split('@')[0].trim();
}
function toJid(num) {
    const n = normaliseNum(num);
    return n ? n + '@s.whatsapp.net' : null;
}
function getSender(message, context = {}) {
    if (context.sender) return context.sender;
    const jid = message.key?.remoteJid || '';
    return jid.endsWith('@g.us') ? (message.key?.participant || '') : jid;
}

/* ─── Session/owner JID ───────────────────────────────────────────────────── */
function getSessionJid(sock) {
    // The paired number = owner of this bot instance
    const num = normaliseNum(sock.user?.id || sock.user?.lid || '');
    return num ? num + '@s.whatsapp.net' : null;
}

function isOwnerOrSudo(sock, senderJid, context = {}) {
    if (context.isOwner) return true;
    if (context.senderIsOwnerOrSudo) return true;
    if (context.fromMe) return true;

    const senderNum = normaliseNum(senderJid);
    if (!senderNum) return false;

    // Paired session = owner
    const sessionNum = normaliseNum(sock.user?.id || '');
    if (sessionNum && senderNum === sessionNum) return true;

    // Env owner
    const ownerEnv = normaliseNum(process.env.OWNER_NUMBER || '');
    if (ownerEnv && senderNum === ownerEnv) return true;

    try {
        const s = require('../settings');
        if (normaliseNum(s.ownerNumber) === senderNum) return true;
    } catch {}

    return false;
}

/* ─── View-once detection (all 4 WA formats) ────────────────────────────── */
function detectViewOnce(quotedMsg) {
    if (!quotedMsg) return null;

    function extract(wrapper) {
        if (!wrapper) return null;
        const m = wrapper.message || wrapper;
        if (m.imageMessage) return { mtype: 'image', msgObj: m.imageMessage, inner: m };
        if (m.videoMessage) return { mtype: 'video', msgObj: m.videoMessage, inner: m };
        if (m.audioMessage) return { mtype: 'audio', msgObj: m.audioMessage, inner: m };
        return null;
    }

    // Formats 1-3
    for (const k of ['viewOnceMessage', 'viewOnceMessageV2', 'viewOnceMessageV2Extension']) {
        const r = extract(quotedMsg[k]);
        if (r) return r;
    }

    // Format 4: direct flag
    for (const [k, mtype] of [['imageMessage','image'],['videoMessage','video'],['audioMessage','audio']]) {
        if (quotedMsg[k]?.viewOnce === true) return { mtype, msgObj: quotedMsg[k], inner: quotedMsg };
    }

    return null;
}

/* ─── Download with retry ─────────────────────────────────────────────────── */
async function downloadToBuffer(msgObj, mtype, retries = 2) {
    const typeMap = { image: 'image', video: 'video', audio: 'audio', sticker: 'sticker' };
    const ct = typeMap[mtype] || mtype;

    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            const stream = await downloadContentFromMessage(msgObj, ct);
            const chunks = [];
            for await (const chunk of stream) chunks.push(chunk);
            if (!chunks.length) throw new Error('Empty buffer');
            return Buffer.concat(chunks);
        } catch (e) {
            if (attempt >= retries) throw e;
            await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
        }
    }
}

/* ─── Send media ──────────────────────────────────────────────────────────── */
async function sendMedia(sock, targetJid, buf, mtype, msgObj, caption, quotedMsg) {
    const opts = quotedMsg ? { quoted: quotedMsg } : {};
    const defaultCaption = `👁️ *View-Once Media*\n\n_Captured by REDXBOT302_ 🔥`;

    if (mtype === 'image') {
        await sock.sendMessage(targetJid, { image: buf, caption: caption || defaultCaption }, opts);
    } else if (mtype === 'video') {
        await sock.sendMessage(targetJid, { video: buf, mimetype: 'video/mp4', caption: caption || defaultCaption }, opts);
    } else if (mtype === 'audio') {
        const isPtt = msgObj?.ptt === true;
        await sock.sendMessage(targetJid, {
            audio: buf,
            mimetype: msgObj?.mimetype || (isPtt ? 'audio/ogg; codecs=opus' : 'audio/mp4'),
            ptt: isPtt,
        }, opts);
    }
}

/* ─── Auto-intercept (called from messageHandler on every message) ─────────── */
async function handleAutoVV(sock, msg) {
    try {
        const triggers = loadTriggers();
        if (!triggers.length) return;

        const from = msg.key?.remoteJid;
        if (!from) return;

        const body = (
            msg.message?.conversation                ||
            msg.message?.extendedTextMessage?.text   ||
            msg.message?.imageMessage?.caption       ||
            msg.message?.videoMessage?.caption       || ''
        ).trim().toLowerCase();

        const matched = triggers.find(t => body === t.toLowerCase() || body.includes(t.toLowerCase()));
        if (!matched) return;

        const contextInfo = msg.message?.extendedTextMessage?.contextInfo;
        if (!contextInfo?.quotedMessage) return;

        const detected = detectViewOnce(contextInfo.quotedMessage);
        if (!detected) return;

        const { mtype, msgObj } = detected;
        const buf = await downloadToBuffer(msgObj, mtype);

        // Send to paired user (session = owner of this instance)
        const targetJid = getSessionJid(sock);
        if (!targetJid) return;

        const senderNum = (msg.key?.participant || from).split('@')[0];
        const caption   = `🤫 *Auto VV Intercept*\n\nFrom: @${senderNum}\nTrigger: *"${matched}"*\nIn: ${from.endsWith('@g.us') ? 'Group' : 'DM'}\n\n_REDXBOT302_ 👁️`;

        await sendMedia(sock, targetJid, buf, mtype, msgObj, caption);
        incStat('intercepted');
    } catch (e) {
        incStat('failed');
        console.error('[VV-AUTO]', e.message);
    }
}

/* ════════════════════════════════════
   .vv — everyone can use
════════════════════════════════════ */
const vvCommand = {
    command    : 'viewonce',
    aliases    : ['vv', 'viewmedia', 'vvget', 'vvopen'],
    category   : 'general',
    description: 'Retrieve a view-once image/video/audio — sends to your DM',
    usage      : '.vv — reply to a view-once | .vv group — resend in chat',
    ownerOnly  : false,

    async handler(sock, message, args, context = {}) {
        const chatId    = context.chatId || message.key.remoteJid;
        const senderJid = getSender(message, context);
        const sub       = (Array.isArray(args) ? args[0] : args || '').toLowerCase().trim();

        try { await sock.sendMessage(chatId, { react: { text: '⏳', key: message.key } }); } catch {}

        try {
            const contextInfo = message.message?.extendedTextMessage?.contextInfo;
            const quotedMsg   = contextInfo?.quotedMessage;

            if (!quotedMsg) {
                await sock.sendMessage(chatId, { react: { text: '❌', key: message.key } });
                return sock.sendMessage(chatId, {
                    text: `❌ *Reply to a view-once first, then send .vv*\n\n💡 Tip: Long-press the 👁️ message → Reply → send *.vv*`
                }, { quoted: message });
            }

            const detected = detectViewOnce(quotedMsg);
            if (!detected) {
                await sock.sendMessage(chatId, { react: { text: '❌', key: message.key } });
                return sock.sendMessage(chatId, {
                    text: `❌ *That's not a view-once message.*\n\nMake sure you replied to a 👁️ view-once image, video, or voice note.`
                }, { quoted: message });
            }

            const { mtype, msgObj } = detected;
            const buf = await downloadToBuffer(msgObj, mtype);

            let targetJid;
            if (sub === 'group' || sub === 'here') {
                targetJid = chatId;
            } else {
                // Send to caller's own DM
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
            console.error('[VV ERROR]', err.message);
            await sock.sendMessage(chatId, { react: { text: '❌', key: message.key } });
            await sock.sendMessage(chatId, {
                text: `❌ *Failed to retrieve view-once.*\nReason: ${err.message}\n\n> View-once may have expired or been deleted.`
            }, { quoted: message });
        }
    }
};

/* ════════════════════════════════════
   .vv2 — silent DM (owner/sudo only)
════════════════════════════════════ */
const vv2Command = {
    command    : 'vv2',
    aliases    : ['vvdm', 'vvinbox', 'vvsilent'],
    category   : 'owner',
    description: 'View-once → your DM silently, deletes command msg (owner/sudo)',
    usage      : '.vv2 — reply to a view-once',

    async handler(sock, message, args, context = {}) {
        const chatId    = context.chatId || message.key.remoteJid;
        const senderJid = getSender(message, context);

        if (!isOwnerOrSudo(sock, senderJid, context)) {
            return sock.sendMessage(chatId, {
                text: `❌ *Owner/Sudo only.*`
            }, { quoted: message });
        }

        try {
            const contextInfo = message.message?.extendedTextMessage?.contextInfo;
            if (!contextInfo?.quotedMessage) return;
            const detected = detectViewOnce(contextInfo.quotedMessage);
            if (!detected) return;

            const { mtype, msgObj } = detected;
            const buf = await downloadToBuffer(msgObj, mtype);
            const callerDm = toJid(senderJid) || getSessionJid(sock);

            await sendMedia(sock, callerDm, buf, mtype, msgObj, `📥 *View-Once (Silent)*\n\n_REDXBOT302_ 🤫`);

            // Quick ack then delete own command message
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

/* ════════════════════════════════════
   .vvadv — advanced: send to multiple
════════════════════════════════════ */
const vvAdvCommand = {
    command    : 'vvadv',
    aliases    : ['vvforward', 'vvall'],
    category   : 'owner',
    description: 'Advanced VV: send intercepted media to owner DM + linked device',
    usage      : '.vvadv — reply to a view-once',

    async handler(sock, message, args, context = {}) {
        const chatId    = context.chatId || message.key.remoteJid;
        const senderJid = getSender(message, context);

        if (!isOwnerOrSudo(sock, senderJid, context)) {
            return sock.sendMessage(chatId, { text: '❌ *Owner/Sudo only.*' }, { quoted: message });
        }

        try {
            const contextInfo = message.message?.extendedTextMessage?.contextInfo;
            if (!contextInfo?.quotedMessage) {
                return sock.sendMessage(chatId, { text: '❌ Reply to a view-once first.' }, { quoted: message });
            }
            const detected = detectViewOnce(contextInfo.quotedMessage);
            if (!detected) return sock.sendMessage(chatId, { text: '❌ Not a view-once.' }, { quoted: message });

            const { mtype, msgObj } = detected;
            const buf = await downloadToBuffer(msgObj, mtype);

            // Send to session (paired user = owner)
            const sessionJid = getSessionJid(sock);
            if (sessionJid) await sendMedia(sock, sessionJid, buf, mtype, msgObj, `📥 *VV Advanced*\n_REDXBOT302_ 👁️`);

            // Also send to caller if different
            const callerJid = toJid(senderJid);
            if (callerJid && callerJid !== sessionJid) {
                await sendMedia(sock, callerJid, buf, mtype, msgObj, `📥 *VV Advanced*\n_REDXBOT302_ 👁️`);
            }

            await sock.sendMessage(chatId, { react: { text: '👁️', key: message.key } });
            await sock.sendMessage(chatId, { text: `📥 *Sent to all owner inboxes!*` }, { quoted: message });
            incStat('manual');
        } catch (e) {
            console.error('[VVADV]', e.message);
            await sock.sendMessage(chatId, { text: `❌ Error: ${e.message}` }, { quoted: message });
        }
    }
};

/* ════════════════════════════════════
   .vvset — add trigger
════════════════════════════════════ */
const vvSetCommand = {
    command    : 'vvset',
    aliases    : ['vvadd', 'vvtrigger'],
    category   : 'owner',
    description: 'Add an auto-intercept trigger word/emoji',
    usage      : '.vvset <word or emoji>',

    async handler(sock, message, args, context = {}) {
        const chatId  = context.chatId || message.key.remoteJid;
        const trigger = (Array.isArray(args) ? args.join(' ') : args || '').trim();

        if (!trigger) {
            const all = loadTriggers();
            return sock.sendMessage(chatId, {
                text: `📌 *VV Auto-Intercept Triggers*\n\nCurrent: ${all.map(t => `*${t}*`).join(', ') || 'none'}\n\nUsage: *.vvset <word>*\nExample: *.vvset 👀* or *.vvset save*\n\n_When anyone replies to a view-once with your trigger, bot auto-saves it to your DM._`
            }, { quoted: message });
        }

        const triggers = loadTriggers();
        if (triggers.some(t => t.toLowerCase() === trigger.toLowerCase())) {
            return sock.sendMessage(chatId, { text: `✅ *"${trigger}"* already a trigger.` }, { quoted: message });
        }

        triggers.push(trigger);
        saveTriggers(triggers);

        return sock.sendMessage(chatId, {
            text: `✅ *Trigger Added!*\n\n🔑 Word: \`${trigger}\`\n📊 Total: ${triggers.length}\n\n_Anyone who replies to a view-once with *"${trigger}"* → bot saves it to your DM_ 👁️`
        }, { quoted: message });
    }
};

/* ════════════════════════════════════
   .vvremove — remove trigger
════════════════════════════════════ */
const vvRemoveCommand = {
    command    : 'vvremove',
    aliases    : ['vvdel', 'vvunset'],
    category   : 'owner',
    description: 'Remove a view-once auto-intercept trigger',
    usage      : '.vvremove <word>',

    async handler(sock, message, args, context = {}) {
        const chatId  = context.chatId || message.key.remoteJid;
        const trigger = (Array.isArray(args) ? args.join(' ') : args || '').trim();

        if (!trigger) return sock.sendMessage(chatId, { text: `*Usage:* \`.vvremove <trigger>\`` }, { quoted: message });

        let triggers = loadTriggers();
        const idx = triggers.findIndex(t => t.toLowerCase() === trigger.toLowerCase());

        if (idx === -1) return sock.sendMessage(chatId, { text: `❌ *"${trigger}"* not found.\nUse *.vvlist* to see all triggers.` }, { quoted: message });

        triggers.splice(idx, 1);
        saveTriggers(triggers);

        return sock.sendMessage(chatId, {
            text: `🗑️ Removed: *"${trigger}"*\n📊 Remaining: ${triggers.length}`
        }, { quoted: message });
    }
};

/* ════════════════════════════════════
   .vvlist — list triggers
════════════════════════════════════ */
const vvListCommand = {
    command    : 'vvlist',
    aliases    : ['vvtriggers', 'vvtrig'],
    category   : 'owner',
    description: 'List all active view-once auto-intercept triggers',
    usage      : '.vvlist',

    async handler(sock, message, args, context = {}) {
        const chatId   = context.chatId || message.key.remoteJid;
        const triggers = loadTriggers();

        if (!triggers.length) {
            return sock.sendMessage(chatId, {
                text: `📋 *VV Triggers*\n\n_No triggers set._\nUse *.vvset <word>* to add one.\n\nDefault triggers get loaded on restart.`
            }, { quoted: message });
        }

        const list = triggers.map((t, i) => `  *${i + 1}.* \`${t}\``).join('\n');
        return sock.sendMessage(chatId, {
            text: `📋 *Active VV Triggers (${triggers.length})*\n\n${list}\n\n_Reply to any view-once with one of these words → bot saves it._ 👁️`
        }, { quoted: message });
    }
};

/* ════════════════════════════════════
   .vvstats — stats
════════════════════════════════════ */
const vvStatsCommand = {
    command    : 'vvstats',
    aliases    : ['vvcount'],
    category   : 'owner',
    description: 'Show view-once intercept statistics',
    usage      : '.vvstats',

    async handler(sock, message, args, context = {}) {
        const chatId = context.chatId || message.key.remoteJid;
        const s      = loadStats();

        return sock.sendMessage(chatId, {
            text: `📊 *VV Intercept Stats*\n\n` +
                  `👁️ Auto-intercepted: *${s.intercepted || 0}*\n` +
                  `📥 Manual (.vv): *${s.manual || 0}*\n` +
                  `❌ Failed: *${s.failed || 0}*\n` +
                  `🕒 Last capture: *${s.lastCapture ? new Date(s.lastCapture).toLocaleString() : 'Never'}*`
        }, { quoted: message });
    }
};

/* ─── Exports ──────────────────────────────────────────────────────────────── */
module.exports = [vvCommand, vv2Command, vvAdvCommand, vvSetCommand, vvRemoveCommand, vvListCommand, vvStatsCommand];
module.exports.handleAutoVV = handleAutoVV;
