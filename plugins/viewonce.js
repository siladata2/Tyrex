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
 *  ADVANCED VIEW-ONCE RETRIEVER — REDXBOT302 v7.1 ULTRA                    *
 *                                                                           *
 *  Commands:                                                                *
 *   • .vv        — retrieve quoted view-once (image/video/audio/ptt/voice) *
 *   • .vv2       — retrieve → send to caller's DM silently (no chat trace) *
 *   • .vvset     — add a trigger word/emoji (owner + sudo)                 *
 *   • .vvremove  — remove a trigger       (owner + sudo)                   *
 *   • .vvlist    — list all active triggers (owner + sudo)                 *
 *   • Auto-mode  — when a trigger word is sent as reply to a view-once,   *
 *                  it silently forwards to owner DM with zero chat trace    *
 *                                                                           *
 *****************************************************************************/

'use strict';

const fs   = require('fs');
const path = require('path');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');

/* ── Custom Emoji / Message Config ───────────────────────────────────────── */
const VV_CONFIG = {
    successEmoji   : '👁️',
    processingEmoji: '⏳',
    errorEmoji     : '❌',
    dmEmoji        : '📥',

    dmSentMsg   : '📥 *View-once sent to your DM silently.*\n_No trace left in this chat._ 🤫',
    retrievedMsg: '👁️ *View-Once Retrieved!*\n\n_Powered by REDXBOT302 v7.1 ULTRA_ 🔥',
    autoCaption : '🤫 *Auto-intercepted view-once*\n\n_Someone sent this in a monitored chat_ 👁️',

    noMediaMsg    : '⚠️ *Please reply to a view-once image, video, audio, or voice note.*',
    noReplyMsg    : '❌ *Reply to a view-once message first, then use this command.*',
    notVVMsg      : '❌ *That quoted message is not a view-once.*',
    errorMsg      : '❌ *Failed to retrieve the view-once media. Please try again later.*',
    invalidOptMsg : '❌ *Invalid option.*\nUse `.vv`, `.vv inbox`, or `.vv group`',
    notAllowedMsg : '❌ *This command is for the owner and sudo users only.*',
};

/* ── Persistent trigger storage ─────────────────────────────────────────── */
const TRIGGERS_FILE = path.join(__dirname, '../data/vv_triggers.json');

function loadTriggers() {
    try { return JSON.parse(fs.readFileSync(TRIGGERS_FILE, 'utf8')); }
    catch (e) {
        if (e.code !== 'ENOENT') console.error('[VV] loadTriggers error:', e.message);
        return [];
    }
}

function saveTriggers(list) {
    try {
        fs.mkdirSync(path.dirname(TRIGGERS_FILE), { recursive: true });
        fs.writeFileSync(TRIGGERS_FILE, JSON.stringify(list, null, 2));
        return true;
    } catch (e) {
        console.error('[VV] saveTriggers error:', e.message);
        return false;
    }
}

/* ══════════════════════════════════════════════════════════════════
   PERMISSION HELPERS
   Priority order for resolving owner / sudo:
     1. context.isOwner / context.isSudo  — set by the bot framework
     2. config.js  OWNER_NUMBER / ownerNumber / SUDO / sudo arrays
     3. sock.user.id                      — bot's running JID
     4. data/sudo.json                    — persistent sudo list on disk
     5. context.sudo[]                    — sudo passed through context
══════════════════════════════════════════════════════════════════ */
const SUDO_FILE = path.join(__dirname, '../data/sudo.json');

function loadSudoList() {
    try { return JSON.parse(fs.readFileSync(SUDO_FILE, 'utf8')); }
    catch (e) { return []; }
}

/**
 * Normalise a JID or raw number to just digits.
 * "923001234567:12@s.whatsapp.net" → "923001234567"
 * "923001234567@s.whatsapp.net"    → "923001234567"
 * "+923001234567"                  → "923001234567"
 * "03001234567"                    → "03001234567"  (kept as-is for matching)
 */
function normaliseNum(jid = '') {
    return String(jid).replace(/^\+/, '').split(':')[0].split('@')[0].trim();
}

/**
 * Try to load the bot's config.js/config.json and pull out
 * owner number(s) and sudo list.  Works for the most common
 * variable names used in public Baileys bot repos.
 */
function loadConfig() {
    const attempts = [
        path.join(__dirname, '../config.js'),
        path.join(__dirname, '../config.json'),
        path.join(__dirname, '../../config.js'),
        path.join(__dirname, '../../config.json'),
        path.join(process.cwd(), 'config.js'),
        path.join(process.cwd(), 'config.json'),
    ];

    for (const p of attempts) {
        try {
            // Clear require cache so live edits to config are picked up
            delete require.cache[require.resolve(p)];
            const cfg = require(p);

            // Collect owner numbers — try every common key name
            const ownerRaw = (
                cfg.OWNER_NUMBER  ?? cfg.ownerNumber  ??
                cfg.OWNER         ?? cfg.owner         ??
                cfg.BOT_OWNER     ?? cfg.botOwner      ?? ''
            );
            const owners = []
                .concat(ownerRaw)           // handle string or array
                .map(String)
                .map(normaliseNum)
                .filter(Boolean);

            // Collect sudo list — try every common key name
            const sudoRaw = (
                cfg.SUDO   ?? cfg.sudo   ??
                cfg.ADMINS ?? cfg.admins ?? []
            );
            const sudos = []
                .concat(sudoRaw)
                .map(String)
                .map(normaliseNum)
                .filter(Boolean);

            if (owners.length || sudos.length) return { owners, sudos };
        } catch (_) { /* try next path */ }
    }
    return { owners: [], sudos: [] };
}

/**
 * Correctly resolve the actual human sender JID.
 *  - Groups : message.key.participant  holds the real sender
 *  - DMs    : message.key.remoteJid   is the sender
 * We must NEVER return a @g.us group JID as the sender.
 */
function getSender(message, context = {}) {
    // Framework-provided sender (most reliable)
    if (context.senderId) return context.senderId;

    const remoteJid = message.key?.remoteJid || '';
    const isGroup   = remoteJid.endsWith('@g.us');

    if (isGroup) {
        // In a group the real sender is always in participant
        return message.key?.participant || '';
    }

    // DM — remoteJid IS the sender
    return remoteJid;
}

/**
 * Returns true when senderJid belongs to a configured owner.
 * Checks framework flag → config.js → sock.user.id.
 */
function isOwner(sock, senderJid, context = {}) {
    // 1. Framework flag
    if (typeof context.isOwner === 'boolean') return context.isOwner;
    if (typeof context.isOwner === 'function') return context.isOwner();

    const senderNum = normaliseNum(senderJid);
    if (!senderNum) return false;

    // 2. config.js owner numbers (handles all linked/paired users)
    const { owners } = loadConfig();
    if (owners.length && owners.some(o => o === senderNum)) return true;

    // 3. sock.user.id — the number the bot is actually running as
    const botNum = normaliseNum(sock.user?.id || '');
    if (botNum && senderNum === botNum) return true;

    return false;
}

/**
 * Returns true when sender is owner OR an approved sudo user.
 * Check order: framework flags → config owners → config sudo →
 *              sock.user.id → data/sudo.json → context.sudo[].
 */
function isSudoOrOwner(sock, senderJid, context = {}) {
    if (isOwner(sock, senderJid, context)) return true;

    // Framework sudo flag
    if (typeof context.isSudo === 'boolean' && context.isSudo) return true;
    if (typeof context.isSudo === 'function' && context.isSudo()) return true;

    const senderNum = normaliseNum(senderJid);
    if (!senderNum) return false;

    // config.js sudo list
    const { sudos } = loadConfig();
    if (sudos.some(s => s === senderNum)) return true;

    // data/sudo.json on disk
    const diskSudo = loadSudoList();
    if (diskSudo.map(s => normaliseNum(String(s))).includes(senderNum)) return true;

    // sudo array passed through context
    if (Array.isArray(context.sudo)) {
        if (context.sudo.map(s => normaliseNum(String(s))).includes(senderNum)) return true;
    }

    return false;
}

/* ── Get owner JID ───────────────────────────────────────────────────────── */
function getOwnerJid(sock) {
    const num = normaliseNum(sock.user?.id || '');
    return num ? num + '@s.whatsapp.net' : null;
}

/* ── Get caller's own DM JID (works for both owner and sudo) ─────────────── */
function getCallerDmJid(senderJid) {
    const num = normaliseNum(senderJid);
    return num ? num + '@s.whatsapp.net' : null;
}

/* ── Normalise args safely (handles string, array, or undefined) ─────────── */
function safeArgs(args) {
    if (Array.isArray(args)) return args;
    if (typeof args === 'string') return args.split(' ');
    return [];
}

/* ── Detect view-once from quoted message ────────────────────────────────── */
/*
 * WhatsApp wraps view-once in several structures:
 *   FORMAT 1:  quotedMsg.viewOnceMessage.message.imageMessage
 *   FORMAT 2:  quotedMsg.viewOnceMessageV2.message.imageMessage
 *   FORMAT 3:  quotedMsg.viewOnceMessageV2Extension.message.imageMessage  ← NEWER
 *   FORMAT 4:  quotedMsg.imageMessage.viewOnce === true                   ← LEGACY
 */
function detectViewOnce(quotedMsg) {
    if (!quotedMsg) return null;

    function extractMedia(inner) {
        if (!inner) return null;
        if (inner.imageMessage) return { mtype: 'image', msgObj: inner.imageMessage, inner };
        if (inner.videoMessage) return { mtype: 'video', msgObj: inner.videoMessage, inner };
        if (inner.audioMessage) return { mtype: 'audio', msgObj: inner.audioMessage, inner };
        return null;
    }

    const res1 = extractMedia(quotedMsg.viewOnceMessage?.message);
    if (res1) return res1;

    const res2 = extractMedia(quotedMsg.viewOnceMessageV2?.message);
    if (res2) return res2;

    const res3 = extractMedia(quotedMsg.viewOnceMessageV2Extension?.message);
    if (res3) return res3;

    // Legacy direct flags
    if (quotedMsg.imageMessage?.viewOnce)
        return { mtype: 'image', msgObj: quotedMsg.imageMessage, inner: quotedMsg };
    if (quotedMsg.videoMessage?.viewOnce)
        return { mtype: 'video', msgObj: quotedMsg.videoMessage, inner: quotedMsg };
    if (quotedMsg.audioMessage?.viewOnce)
        return { mtype: 'audio', msgObj: quotedMsg.audioMessage, inner: quotedMsg };

    return null;
}

/* ── Download helper ─────────────────────────────────────────────────────── */
async function downloadBuffer(sock, msg, inner) {
    const fakeMsg = { key: msg.key, message: inner };
    return await downloadMediaMessage(
        fakeMsg,
        'buffer',
        {},
        {
            logger: {
                level: 'silent',
                info:  () => {}, warn:  () => {}, error: () => {},
                debug: () => {}, trace: () => {},
                child: () => ({
                    level: 'silent', info: () => {}, warn: () => {},
                    error: () => {}, debug: () => {}, trace: () => {}, child: () => ({}),
                }),
            },
            reuploadRequest: sock.updateMediaMessage,
        }
    );
}

/* ── Send media to a target JID ──────────────────────────────────────────── */
async function sendMediaTo(sock, targetJid, buf, mtype, msgObj, caption) {
    let content = {};

    if (mtype === 'image') {
        content = { image: buf, caption: caption || VV_CONFIG.retrievedMsg };

    } else if (mtype === 'video') {
        content = {
            video   : buf,
            mimetype: 'video/mp4',
            caption : caption || VV_CONFIG.retrievedMsg,
        };

    } else if (mtype === 'audio') {
        const isPtt = msgObj?.ptt === true;
        content = {
            audio   : buf,
            mimetype: msgObj?.mimetype || (isPtt ? 'audio/ogg; codecs=opus' : 'audio/mp4'),
            ptt     : isPtt,
            fileName: isPtt ? 'voice.ogg' : 'audio.mp3',
        };
    }

    await sock.sendMessage(targetJid, content);
}

/* ── Build send content for posting back into a chat ─────────────────────── */
function buildContent(mtype, buf, msgObj) {
    if (mtype === 'image') {
        return {
            image  : buf,
            caption: msgObj.caption || `${VV_CONFIG.successEmoji} *View-Once Image*\n\n_Captured by REDXBOT302_ 🔥`,
        };
    }
    if (mtype === 'video') {
        return {
            video   : buf,
            mimetype: 'video/mp4',
            caption : msgObj.caption || `${VV_CONFIG.successEmoji} *View-Once Video*\n\n_Captured by REDXBOT302_ 🔥`,
        };
    }
    if (mtype === 'audio') {
        const isPtt = msgObj?.ptt === true;
        return {
            audio   : buf,
            mimetype: msgObj?.mimetype || (isPtt ? 'audio/ogg; codecs=opus' : 'audio/mp4'),
            ptt     : isPtt,
            fileName: isPtt ? 'voice.ogg' : 'audio.mp3',
        };
    }
    return null;
}

/* ══════════════════════════════════════════════════════════════════
   AUTO-INTERCEPT — called from index.js on every incoming message.
   Forwards to OWNER DM whenever any user replies to a view-once
   with a configured trigger word/emoji.
══════════════════════════════════════════════════════════════════ */
async function handleAutoVV(sock, msg) {
    try {
        const triggers = loadTriggers();
        if (triggers.length === 0) return;

        const chatId = msg.key?.remoteJid;
        if (!chatId) return;

        const body = (
            msg.message?.conversation                     ||
            msg.message?.extendedTextMessage?.text        ||
            msg.message?.imageMessage?.caption            ||
            msg.message?.videoMessage?.caption            || ''
        ).trim().toLowerCase();

        const isTrigger = triggers.some(
            t => body === t.toLowerCase() || body.includes(t.toLowerCase())
        );
        if (!isTrigger) return;

        const contextInfo = msg.message?.extendedTextMessage?.contextInfo;
        if (!contextInfo?.quotedMessage) return;

        const detected = detectViewOnce(contextInfo.quotedMessage);
        if (!detected) return;

        const { mtype, msgObj, inner } = detected;
        const fakeMsg = { key: { remoteJid: chatId }, message: contextInfo.quotedMessage };
        const buf     = await downloadBuffer(sock, fakeMsg, inner);

        const ownerJid = getOwnerJid(sock);
        if (ownerJid) {
            await sendMediaTo(sock, ownerJid, buf, mtype, msgObj, VV_CONFIG.autoCaption);
        }

    } catch (e) {
        console.error('[VV-AUTO]', e.message);
    }
}

/* ══════════════════════════════════════════════════════════════════
   COMMAND: .vv / .viewonce
   Retrieve a view-once — available to everyone.
   Usage: .vv [inbox|group]
     inbox (default) → sends to the CALLER's own DM
     group           → re-sends in the current group
══════════════════════════════════════════════════════════════════ */
const vvCommand = {
    command    : 'viewonce',
    aliases    : ['vv', 'viewmedia', 'vvget'],
    category   : 'general',
    description: 'Re-send a view-once image, video, audio, or voice note.',
    usage      : '.vv [inbox|group] — reply to any view-once media (default: inbox)',

    async handler(sock, message, args, context = {}) {
        const chatId     = context.chatId || message.key.remoteJid;
        const isGroup    = chatId.endsWith('@g.us');
        const senderJid  = getSender(message, context);

        /* ── Resolve destination ── */
        const sub = (safeArgs(args)[0] || '').toLowerCase().trim();
        let targetChat;
        let destination;

        if (sub === 'group') {
            if (!isGroup) {
                await sock.sendMessage(chatId, {
                    text: '⚠️ *You are not in a group.*\nSending to your inbox instead.'
                }, { quoted: message });
                targetChat  = getCallerDmJid(senderJid) || getOwnerJid(sock);
                destination = 'inbox';
            } else {
                targetChat  = chatId;
                destination = 'group';
            }
        } else if (sub === 'inbox' || sub === '') {
            // Each caller gets it in THEIR own DM, not only the owner's
            targetChat  = getCallerDmJid(senderJid) || getOwnerJid(sock);
            destination = 'inbox';
        } else {
            return await sock.sendMessage(chatId,
                { text: VV_CONFIG.invalidOptMsg },
                { quoted: message }
            );
        }

        await sock.sendMessage(chatId, {
            react: { text: VV_CONFIG.processingEmoji, key: message.key }
        });

        try {
            const contextInfo = message.message?.extendedTextMessage?.contextInfo;
            const quotedMsg   = contextInfo?.quotedMessage;

            if (!quotedMsg) {
                await sock.sendMessage(chatId, { react: { text: VV_CONFIG.errorEmoji, key: message.key } });
                return await sock.sendMessage(chatId,
                    { text: VV_CONFIG.noReplyMsg }, { quoted: message }
                );
            }

            const detected = detectViewOnce(quotedMsg);

            if (!detected) {
                await sock.sendMessage(chatId, { react: { text: VV_CONFIG.errorEmoji, key: message.key } });
                return await sock.sendMessage(chatId,
                    { text: VV_CONFIG.noMediaMsg }, { quoted: message }
                );
            }

            const { mtype, msgObj, inner } = detected;
            // FIX: Use a fakeMsg that wraps the quoted message (inner), not the parent message.
            // downloadMediaMessage needs the key of the message that contains the media.
            const contextInfo = message.message?.extendedTextMessage?.contextInfo;
            const quotedKey = contextInfo?.stanzaId
                ? { id: contextInfo.stanzaId, remoteJid: chatId, fromMe: false, participant: contextInfo.participant }
                : message.key;
            const fakeMsg = { key: quotedKey, message: inner };
            const buffer  = await downloadBuffer(sock, fakeMsg, inner);
            const content = buildContent(mtype, buffer, msgObj);

            if (content) {
                await sock.sendMessage(targetChat, content);
            }

            await sock.sendMessage(chatId, {
                react: { text: VV_CONFIG.successEmoji, key: message.key }
            });

        } catch (err) {
            console.error('[VIEWONCE ERROR]', err.message);
            await sock.sendMessage(chatId, { react: { text: VV_CONFIG.errorEmoji, key: message.key } });
            await sock.sendMessage(chatId,
                { text: VV_CONFIG.errorMsg }, { quoted: message }
            );
        }
    }
};

/* ══════════════════════════════════════════════════════════════════
   COMMAND: .vv2
   Retrieve view-once → caller's OWN DM only (no chat trace).
   Owner  → goes to owner's DM.
   Sudo   → goes to that sudo user's DM.
   Others → blocked.
══════════════════════════════════════════════════════════════════ */
const vv2Command = {
    command    : 'vv2',
    aliases    : ['vvdm', 'vvinbox'],
    category   : 'owner',
    description: 'Retrieve view-once → sends to your own DM only (no chat trace)',
    usage      : '.vv2 — reply to a view-once media',

    async handler(sock, message, args, context = {}) {
        const chatId    = context.chatId || message.key.remoteJid;
        const sender    = getSender(message, context);

        // Only owner and sudo users can use this
        if (!isSudoOrOwner(sock, sender, context)) {
            return await sock.sendMessage(chatId,
                { text: VV_CONFIG.notAllowedMsg }, { quoted: message }
            );
        }

        const contextInfo = message.message?.extendedTextMessage?.contextInfo;
        if (!contextInfo?.quotedMessage) return;

        const detected = detectViewOnce(contextInfo.quotedMessage);
        if (!detected) return;

        const { mtype, msgObj, inner } = detected;
        const fakeMsg = { key: { remoteJid: chatId }, message: contextInfo.quotedMessage };

        try {
            const buf = await downloadBuffer(sock, fakeMsg, inner);

            // Send to the CALLER's own DM — not always owner
            const callerDm = getCallerDmJid(sender) || getOwnerJid(sock);
            await sendMediaTo(
                sock, callerDm, buf, mtype, msgObj,
                '📥 *View-Once (DM Delivery)*\n\n_Captured silently by REDXBOT302_ 🔥'
            );

            await sock.sendMessage(chatId, { text: VV_CONFIG.dmSentMsg }, { quoted: message });
            await new Promise(r => setTimeout(r, 2000));
            try { await sock.sendMessage(chatId, { delete: message.key }); } catch {}

        } catch (e) {
            console.error('[VV2 ERROR]', e.message);
        }
    }
};

/* ══════════════════════════════════════════════════════════════════
   COMMAND: .vvset
   Add a trigger word / emoji for auto-intercept.
   ✅ Owner + Sudo can use this (uses isSudoOrOwner check).
══════════════════════════════════════════════════════════════════ */
const vvSetCommand = {
    command    : 'vvset',
    aliases    : ['vvadd', 'vvtrigger'],
    category   : 'owner',
    description: 'Add a trigger word/emoji that auto-intercepts view-once messages',
    usage      : '.vvset <word or emoji>',

    async handler(sock, message, args, context = {}) {
        const chatId = context.chatId || message.key.remoteJid;

        const trigger = safeArgs(args).join(' ').trim();

        if (!trigger) {
            return await sock.sendMessage(chatId, {
                text:
                    `╔══════════════════════════╗\n` +
                    `║   📌 *VV Trigger Setup*  ║\n` +
                    `╚══════════════════════════╝\n\n` +
                    `*Usage:* \`.vvset <word or emoji>\`\n\n` +
                    `*Examples:*\n` +
                    `• \`.vvset 👀\`\n` +
                    `• \`.vvset save\`\n` +
                    `• \`.vvset get\`\n` +
                    `• \`.vvset 🔥\`\n\n` +
                    `_When anyone replies to a view-once with your trigger word,\nit silently lands in the owner's DM._ 📥`
            }, { quoted: message });
        }

        const triggers = loadTriggers();

        if (triggers.some(t => t.toLowerCase() === trigger.toLowerCase())) {
            return await sock.sendMessage(chatId,
                { text: `✅ Trigger *"${trigger}"* is already set.` },
                { quoted: message }
            );
        }

        triggers.push(trigger);
        const saved = saveTriggers(triggers);

        if (!saved) {
            return await sock.sendMessage(chatId,
                { text: '❌ *Failed to save trigger. Check bot file permissions.*' },
                { quoted: message }
            );
        }

        await sock.sendMessage(chatId, {
            text:
                `✅ *Trigger Added Successfully!*\n\n` +
                `🔑 *Word/Emoji:* \`${trigger}\`\n` +
                `📊 *Total triggers:* ${triggers.length}\n\n` +
                `_Anyone replying to a view-once with *"${trigger}"*\nwill silently forward it to the owner's DM._ 🤫`
        }, { quoted: message });
    }
};

/* ══════════════════════════════════════════════════════════════════
   COMMAND: .vvremove
   Remove a view-once trigger word/emoji.
   ✅ Owner + Sudo can use this.
══════════════════════════════════════════════════════════════════ */
const vvRemoveCommand = {
    command    : 'vvremove',
    aliases    : ['vvdel', 'vvunset'],
    category   : 'owner',
    description: 'Remove a view-once trigger word',
    usage      : '.vvremove <word>',

    async handler(sock, message, args, context = {}) {
        const chatId = context.chatId || message.key.remoteJid;
        const sender = getSender(message, context);

        // ── Permission check ─────────────────────────────────────────────────
        if (!isSudoOrOwner(sock, sender, context)) {
            return await sock.sendMessage(chatId,
                { text: VV_CONFIG.notAllowedMsg }, { quoted: message }
            );
        }

        // safeArgs fix — was crashing if args was not an array
        const trigger = safeArgs(args).join(' ').trim();

        if (!trigger) {
            return await sock.sendMessage(chatId,
                { text: '*Usage:* `.vvremove <trigger word or emoji>`' },
                { quoted: message }
            );
        }

        let triggers = loadTriggers();
        const matchIndex = triggers.findIndex(t => t.toLowerCase() === trigger.toLowerCase());

        if (matchIndex === -1) {
            return await sock.sendMessage(chatId,
                { text: `❌ Trigger *"${trigger}"* not found.\nUse \`.vvlist\` to see all triggers.` },
                { quoted: message }
            );
        }

        triggers.splice(matchIndex, 1);
        saveTriggers(triggers);

        await sock.sendMessage(chatId, {
            text: `🗑️ Trigger *"${trigger}"* removed.\n📊 *Remaining:* ${triggers.length}`
        }, { quoted: message });
    }
};

/* ══════════════════════════════════════════════════════════════════
   COMMAND: .vvlist
   List all active view-once trigger words/emojis.
   ✅ Owner + Sudo can use this.
══════════════════════════════════════════════════════════════════ */
const vvListCommand = {
    command    : 'vvlist',
    aliases    : ['vvtriggers'],
    category   : 'owner',
    description: 'List all active view-once triggers',
    usage      : '.vvlist',

    async handler(sock, message, args, context = {}) {
        const chatId = context.chatId || message.key.remoteJid;
        const sender = getSender(message, context);

        // ── Permission check ─────────────────────────────────────────────────
        if (!isSudoOrOwner(sock, sender, context)) {
            return await sock.sendMessage(chatId,
                { text: VV_CONFIG.notAllowedMsg }, { quoted: message }
            );
        }

        const triggers = loadTriggers();

        if (triggers.length === 0) {
            return await sock.sendMessage(chatId, {
                text:
                    `📋 *VV Triggers*\n\n` +
                    `_No triggers set yet._\n` +
                    `Use \`.vvset <word>\` to add one.`
            }, { quoted: message });
        }

        const list = triggers.map((t, i) => `  ${i + 1}. ${t}`).join('\n');

        await sock.sendMessage(chatId, {
            text:
                `╔════════════════════════════╗\n` +
                `║  📋 *Active VV Triggers*   ║\n` +
                `╚════════════════════════════╝\n\n` +
                `${list}\n\n` +
                `*Total:* ${triggers.length}\n\n` +
                `_Reply to any view-once with one of these words/emojis\nto auto-save it to the owner's DM._ 👁️`
        }, { quoted: message });
    }
};

/* ── Exports ─────────────────────────────────────────────────────────────── */
module.exports = [vvCommand, vv2Command, vvSetCommand, vvRemoveCommand, vvListCommand];
module.exports.handleAutoVV = handleAutoVV;
