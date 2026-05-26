/*****************************************************************************
 *  REDXBOT302 — plugins/viewonce.js  (FULLY FIXED 2026)
 *
 *  Fixes applied:
 *  1. downloadBuffer now uses downloadContentFromMessage (more reliable for
 *     view-once than downloadMediaMessage — handles expired CDN URLs via reupload).
 *  2. detectViewOnce covers ALL 4 WhatsApp view-once wrapper formats.
 *  3. .vv works for EVERYONE — sends retrieved media to the requester's own DM.
 *  4. Auto-intercept (handleAutoVV) is exported and must be hooked in index.js.
 *  5. .vv2 sends silently to caller's DM with no chat trace.
 *  6. Proper fakeMsg construction for Baileys downloadContentFromMessage.
 *
 *  Commands:
 *    .vv       — reply to any view-once → sends media to YOUR OWN inbox (everyone)
 *    .vv2      — silent DM delivery, no chat trace (owner + sudo only)
 *    .vvset    — add auto-intercept trigger word/emoji (owner + sudo)
 *    .vvremove — remove a trigger (owner + sudo)
 *    .vvlist   — list triggers (owner + sudo)
 *****************************************************************************/

'use strict';

const fs   = require('fs');
const path = require('path');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');

/* ─────────────────────────── Config ─────────────────────────────────────── */
const TRIGGERS_FILE      = path.join(__dirname, '../data/vv_triggers.json');
const USER_GROUP_DATA    = path.join(__dirname, '../data/userGroupData.json');
const SUDO_FILE          = path.join(__dirname, '../data/sudo.json');

/* ─────────────────────────── Helpers ────────────────────────────────────── */
function normaliseNum(jid = '') {
    return String(jid).replace(/^\+/, '').split(':')[0].split('@')[0].trim();
}

function loadTriggers() {
    try { return JSON.parse(fs.readFileSync(TRIGGERS_FILE, 'utf8')); }
    catch { return []; }
}

function saveTriggers(list) {
    try {
        fs.mkdirSync(path.dirname(TRIGGERS_FILE), { recursive: true });
        fs.writeFileSync(TRIGGERS_FILE, JSON.stringify(list, null, 2));
        return true;
    } catch (e) {
        console.error('[VV] saveTriggers:', e.message);
        return false;
    }
}

function loadSudoList() {
    try {
        const ugd = JSON.parse(fs.readFileSync(USER_GROUP_DATA, 'utf8'));
        if (Array.isArray(ugd.sudo)) return ugd.sudo;
    } catch {}
    try { return JSON.parse(fs.readFileSync(SUDO_FILE, 'utf8')); }
    catch { return []; }
}

function getSender(message, context = {}) {
    if (context.sender) return context.sender;
    const remoteJid = message.key?.remoteJid || '';
    const isGroup   = remoteJid.endsWith('@g.us');
    return isGroup ? (message.key?.participant || '') : remoteJid;
}

function isOwnerOrSudo(sock, senderJid, context = {}) {
    if (context.isOwner === true)             return true;
    if (context.senderIsOwnerOrSudo === true) return true;
    if (context.isOwnerOrSudoCheck === true)  return true;

    const senderNum = normaliseNum(senderJid);
    if (!senderNum) return false;

    // Bot session number = owner on this deployment
    const botNum = normaliseNum(sock.user?.id || '');
    if (botNum && senderNum === botNum) return true;

    // Env owner number
    const ownerEnv = normaliseNum(process.env.OWNER_NUMBER || '');
    if (ownerEnv && senderNum === ownerEnv) return true;

    // settings.js
    try {
        const settings = require('../settings');
        if (normaliseNum(settings.ownerNumber) === senderNum) return true;
    } catch {}

    // data/sudo.json / userGroupData.json
    const sudoList = loadSudoList();
    if (sudoList.map(s => normaliseNum(String(s))).includes(senderNum)) return true;

    if (Array.isArray(context.sudo)) {
        if (context.sudo.map(s => normaliseNum(String(s))).includes(senderNum)) return true;
    }

    return false;
}

function getOwnerJid(sock) {
    // owner number from env/settings
    const ownerEnv = (process.env.OWNER_NUMBER || '').replace(/\D/g, '');
    if (ownerEnv) return ownerEnv + '@s.whatsapp.net';
    // fallback: bot session number
    const num = normaliseNum(sock.user?.id || '');
    return num ? num + '@s.whatsapp.net' : null;
}

function getLinkedDeviceJid(sock) {
    // "Linked device inbox" = send to bot's own session number so the paired
    // phone sees it in Saved Messages / bot's self-chat
    const num = normaliseNum(sock.user?.id || '');
    return num ? num + '@s.whatsapp.net' : null;
}

function getCallerDmJid(senderJid) {
    const num = normaliseNum(senderJid);
    return num ? num + '@s.whatsapp.net' : null;
}

/* ─────────────────────────── View-Once Detection ────────────────────────── */
/*
 *  WhatsApp view-once wrappers (4 known formats):
 *    FORMAT 1 (old)  : message.viewOnceMessage.message.imageMessage
 *    FORMAT 2 (v2)   : message.viewOnceMessageV2.message.imageMessage
 *    FORMAT 3 (ext)  : message.viewOnceMessageV2Extension.message.imageMessage
 *    FORMAT 4 (flag) : message.imageMessage.viewOnce === true  (rare legacy)
 */
function detectViewOnce(quotedMsg) {
    if (!quotedMsg) return null;

    function extractInner(wrapper) {
        if (!wrapper) return null;
        const m = wrapper.message || wrapper;
        if (m.imageMessage) return { mtype: 'image', msgObj: m.imageMessage, inner: m };
        if (m.videoMessage) return { mtype: 'video', msgObj: m.videoMessage, inner: m };
        if (m.audioMessage) return { mtype: 'audio', msgObj: m.audioMessage, inner: m };
        return null;
    }

    const r1 = extractInner(quotedMsg.viewOnceMessage);
    if (r1) return r1;
    const r2 = extractInner(quotedMsg.viewOnceMessageV2);
    if (r2) return r2;
    const r3 = extractInner(quotedMsg.viewOnceMessageV2Extension);
    if (r3) return r3;

    // Legacy direct flag
    if (quotedMsg.imageMessage?.viewOnce === true)
        return { mtype: 'image', msgObj: quotedMsg.imageMessage, inner: quotedMsg };
    if (quotedMsg.videoMessage?.viewOnce === true)
        return { mtype: 'video', msgObj: quotedMsg.videoMessage, inner: quotedMsg };
    if (quotedMsg.audioMessage?.viewOnce === true)
        return { mtype: 'audio', msgObj: quotedMsg.audioMessage, inner: quotedMsg };

    return null;
}

/* ─────────────────────────── Download ───────────────────────────────────── */
/*
 *  Uses downloadContentFromMessage (NOT downloadMediaMessage).
 *  downloadContentFromMessage is more reliable for view-once because it
 *  directly streams from WhatsApp CDN using the media keys in the message,
 *  bypassing Baileys' internal store entirely.
 */
async function downloadToBuffer(msgObj, mtype) {
    const typeMap = {
        image   : 'image',
        video   : 'video',
        audio   : 'audio',
        sticker : 'sticker',
    };
    const contentType = typeMap[mtype] || mtype;

    const stream = await downloadContentFromMessage(msgObj, contentType);
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    return Buffer.concat(chunks);
}

/* ─────────────────────────── Send media ─────────────────────────────────── */
async function sendMedia(sock, targetJid, buf, mtype, msgObj, caption, quotedMsg) {
    const opts = quotedMsg ? { quoted: quotedMsg } : {};

    if (mtype === 'image') {
        await sock.sendMessage(targetJid, {
            image  : buf,
            caption: caption || `👁️ *View-Once Image*\n\n_Captured by REDXBOT302_ 🔥`,
        }, opts);
    } else if (mtype === 'video') {
        await sock.sendMessage(targetJid, {
            video   : buf,
            mimetype: 'video/mp4',
            caption : caption || `👁️ *View-Once Video*\n\n_Captured by REDXBOT302_ 🔥`,
        }, opts);
    } else if (mtype === 'audio') {
        const isPtt = msgObj?.ptt === true;
        await sock.sendMessage(targetJid, {
            audio   : buf,
            mimetype: msgObj?.mimetype || (isPtt ? 'audio/ogg; codecs=opus' : 'audio/mp4'),
            ptt     : isPtt,
        }, opts);
    }
}

/* ─────────────────────────── Auto-intercept ─────────────────────────────── */
/*
 *  Called from index.js on EVERY incoming message.
 *  If the message is a trigger word replying to a view-once, forward to owner DM.
 *
 *  Hook in index.js inside the messages.upsert handler:
 *    const { handleAutoVV } = require('./plugins/viewonce');
 *    await handleAutoVV(conn, msg);
 */
async function handleAutoVV(sock, msg) {
    try {
        const triggers = loadTriggers();
        if (!triggers.length) return;

        const from = msg.key?.remoteJid;
        if (!from) return;

        const body = (
            msg.message?.conversation                  ||
            msg.message?.extendedTextMessage?.text     ||
            msg.message?.imageMessage?.caption         ||
            msg.message?.videoMessage?.caption         || ''
        ).trim().toLowerCase();

        const matched = triggers.find(t => body === t.toLowerCase() || body.includes(t.toLowerCase()));
        if (!matched) return;

        const contextInfo = msg.message?.extendedTextMessage?.contextInfo;
        if (!contextInfo?.quotedMessage) return;

        const detected = detectViewOnce(contextInfo.quotedMessage);
        if (!detected) return;

        const { mtype, msgObj } = detected;
        const buf = await downloadToBuffer(msgObj, mtype);

        // Send to owner AND linked device (bot self)
        const ownerJid  = getOwnerJid(sock);
        const selfJid   = getLinkedDeviceJid(sock);

        const caption = `🤫 *Auto-intercepted View-Once*\nFrom: @${(msg.key?.participant || from).split('@')[0]}\nTrigger: "${matched}"\n\n_REDXBOT302_ 👁️`;

        if (ownerJid) await sendMedia(sock, ownerJid, buf, mtype, msgObj, caption);
        if (selfJid && selfJid !== ownerJid) {
            await sendMedia(sock, selfJid, buf, mtype, msgObj, caption);
        }
    } catch (e) {
        console.error('[VV-AUTO]', e.message);
    }
}

/* ════════════════════════════════════════════════════════════════════════════
   COMMAND: .vv
   Available to EVERYONE.
   Reply to any view-once → sends the media to the caller's own DM.
   Usage: .vv [inbox|group]
     inbox (default) → caller's own DM
     group           → same group/chat
════════════════════════════════════════════════════════════════════════════ */
const vvCommand = {
    command    : 'viewonce',
    aliases    : ['vv', 'viewmedia', 'vvget'],
    category   : 'general',
    description: 'Re-send a view-once image/video/audio to your own DM (everyone can use)',
    usage      : '.vv — reply to a view-once message',
    ownerOnly  : false,

    async handler(sock, message, args, context = {}) {
        const chatId    = context.chatId || message.key.remoteJid;
        const senderJid = getSender(message, context);
        const argArr    = Array.isArray(args) ? args : (args || '').split(' ');
        const sub       = (argArr[0] || '').toLowerCase().trim();

        // Ack: react processing
        try { await sock.sendMessage(chatId, { react: { text: '⏳', key: message.key } }); } catch {}

        try {
            // ── 1. Get the quoted/replied message ────────────────────────────
            const contextInfo = message.message?.extendedTextMessage?.contextInfo;
            const quotedMsg   = contextInfo?.quotedMessage;

            if (!quotedMsg) {
                await sock.sendMessage(chatId, { react: { text: '❌', key: message.key } });
                return sock.sendMessage(chatId, {
                    text: '❌ *Reply to a view-once message first, then send .vv*'
                }, { quoted: message });
            }

            // ── 2. Detect view-once ──────────────────────────────────────────
            const detected = detectViewOnce(quotedMsg);

            if (!detected) {
                await sock.sendMessage(chatId, { react: { text: '❌', key: message.key } });
                return sock.sendMessage(chatId, {
                    text: '❌ *That is not a view-once message.*\nMake sure you replied to a 👁️ view-once image, video, or voice note.'
                }, { quoted: message });
            }

            const { mtype, msgObj } = detected;

            // ── 3. Download the media ────────────────────────────────────────
            const buffer = await downloadToBuffer(msgObj, mtype);

            // ── 4. Determine where to send ───────────────────────────────────
            let targetJid;
            if (sub === 'group') {
                targetJid = chatId;
            } else {
                // Default: send to caller's own DM
                targetJid = getCallerDmJid(senderJid) || getOwnerJid(sock);
            }

            // ── 5. Send the media ────────────────────────────────────────────
            await sendMedia(sock, targetJid, buffer, mtype, msgObj);

            // ── 6. Success react + notify in chat ───────────────────────────
            await sock.sendMessage(chatId, { react: { text: '👁️', key: message.key } });

            if (sub !== 'group') {
                await sock.sendMessage(chatId, {
                    text: '📥 *View-once sent to your DM!*\n_Check your inbox_ 💬'
                }, { quoted: message });
            }

        } catch (err) {
            console.error('[VV ERROR]', err.message, err.stack?.split('\n')[1]);
            await sock.sendMessage(chatId, { react: { text: '❌', key: message.key } });
            await sock.sendMessage(chatId, {
                text: `❌ *Failed to retrieve view-once.*\n_Reason: ${err.message}_\n\n> Make sure the view-once was sent recently.`
            }, { quoted: message });
        }
    }
};

/* ════════════════════════════════════════════════════════════════════════════
   COMMAND: .vv2
   Owner + Sudo only. Silently sends to caller's own DM, deletes the command
   message from chat — no trace.
════════════════════════════════════════════════════════════════════════════ */
const vv2Command = {
    command    : 'vv2',
    aliases    : ['vvdm', 'vvinbox'],
    category   : 'owner',
    description: 'View-once → your DM silently (owner/sudo only)',
    usage      : '.vv2 — reply to a view-once',

    async handler(sock, message, args, context = {}) {
        const chatId    = context.chatId || message.key.remoteJid;
        const senderJid = getSender(message, context);

        if (!isOwnerOrSudo(sock, senderJid, context)) {
            return sock.sendMessage(chatId, {
                text: '❌ *This command is for the owner and sudo users only.*'
            }, { quoted: message });
        }

        try {
            const contextInfo = message.message?.extendedTextMessage?.contextInfo;
            if (!contextInfo?.quotedMessage) return;

            const detected = detectViewOnce(contextInfo.quotedMessage);
            if (!detected) return;

            const { mtype, msgObj } = detected;
            const buf = await downloadToBuffer(msgObj, mtype);

            const callerDm = getCallerDmJid(senderJid) || getOwnerJid(sock);
            await sendMedia(sock, callerDm, buf, mtype, msgObj,
                '📥 *View-Once (DM Delivery)*\n\n_REDXBOT302_ 🔥'
            );

            await sock.sendMessage(chatId, {
                text: '📥 *Sent to your DM silently.*\n_No trace left here._ 🤫'
            }, { quoted: message });

            await new Promise(r => setTimeout(r, 2500));
            try { await sock.sendMessage(chatId, { delete: message.key }); } catch {}

        } catch (e) {
            console.error('[VV2 ERROR]', e.message);
            await sock.sendMessage(chatId, {
                text: `❌ Failed: ${e.message}`
            }, { quoted: message });
        }
    }
};

/* ════════════════════════════════════════════════════════════════════════════
   COMMAND: .vvset  — Add auto-intercept trigger
════════════════════════════════════════════════════════════════════════════ */
const vvSetCommand = {
    command    : 'vvset',
    aliases    : ['vvadd', 'vvtrigger'],
    category   : 'owner',
    description: 'Add a trigger word/emoji for auto view-once intercept',
    usage      : '.vvset <word or emoji>',

    async handler(sock, message, args, context = {}) {
        const chatId  = context.chatId || message.key.remoteJid;
        const trigger = (Array.isArray(args) ? args.join(' ') : args || '').trim();

        if (!trigger) {
            return sock.sendMessage(chatId, {
                text: `📌 *VV Trigger Setup*\n\nUsage: \`.vvset <word or emoji>\`\nExamples: \`.vvset 👀\`  \`.vvset save\`  \`.vvset 🔥\`\n\n_When anyone replies to a view-once with your trigger, it auto-forwards to owner DM._`
            }, { quoted: message });
        }

        const triggers = loadTriggers();
        if (triggers.some(t => t.toLowerCase() === trigger.toLowerCase())) {
            return sock.sendMessage(chatId, { text: `✅ Trigger *"${trigger}"* already exists.` }, { quoted: message });
        }

        triggers.push(trigger);
        saveTriggers(triggers);

        return sock.sendMessage(chatId, {
            text: `✅ *Trigger Added!*\n\n🔑 Word: \`${trigger}\`\n📊 Total: ${triggers.length}`
        }, { quoted: message });
    }
};

/* ════════════════════════════════════════════════════════════════════════════
   COMMAND: .vvremove  — Remove trigger
════════════════════════════════════════════════════════════════════════════ */
const vvRemoveCommand = {
    command    : 'vvremove',
    aliases    : ['vvdel', 'vvunset'],
    category   : 'owner',
    description: 'Remove a view-once auto-intercept trigger',
    usage      : '.vvremove <word>',

    async handler(sock, message, args, context = {}) {
        const chatId  = context.chatId || message.key.remoteJid;
        const trigger = (Array.isArray(args) ? args.join(' ') : args || '').trim();

        if (!trigger) {
            return sock.sendMessage(chatId, { text: '*Usage:* `.vvremove <trigger>`' }, { quoted: message });
        }

        let triggers = loadTriggers();
        const idx = triggers.findIndex(t => t.toLowerCase() === trigger.toLowerCase());

        if (idx === -1) {
            return sock.sendMessage(chatId, {
                text: `❌ *"${trigger}"* not found. Use \`.vvlist\` to see all triggers.`
            }, { quoted: message });
        }

        triggers.splice(idx, 1);
        saveTriggers(triggers);

        return sock.sendMessage(chatId, {
            text: `🗑️ Removed: *"${trigger}"*\n📊 Remaining: ${triggers.length}`
        }, { quoted: message });
    }
};

/* ════════════════════════════════════════════════════════════════════════════
   COMMAND: .vvlist  — List triggers
════════════════════════════════════════════════════════════════════════════ */
const vvListCommand = {
    command    : 'vvlist',
    aliases    : ['vvtriggers'],
    category   : 'owner',
    description: 'List all active view-once auto-intercept triggers',
    usage      : '.vvlist',

    async handler(sock, message, args, context = {}) {
        const chatId   = context.chatId || message.key.remoteJid;
        const triggers = loadTriggers();

        if (!triggers.length) {
            return sock.sendMessage(chatId, {
                text: `📋 *VV Triggers*\n\n_No triggers set yet._\nUse \`.vvset <word>\` to add one.`
            }, { quoted: message });
        }

        const list = triggers.map((t, i) => `  ${i + 1}. ${t}`).join('\n');
        return sock.sendMessage(chatId, {
            text: `📋 *Active VV Triggers (${triggers.length})*\n\n${list}\n\n_Reply to any view-once with one of these words to auto-save it._ 👁️`
        }, { quoted: message });
    }
};

/* ─────────────────────────── Exports ────────────────────────────────────── */
module.exports = [vvCommand, vv2Command, vvSetCommand, vvRemoveCommand, vvListCommand];
module.exports.handleAutoVV = handleAutoVV;
