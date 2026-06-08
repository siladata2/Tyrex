/*****************************************************************************
 *  🔰 REDXBOT302 — plugins/antidelete.js  ★ ULTRA FIXED v4.0 ★
 *
 *  ╔═══════════════════════════════════════════════════════╗
 *  ║  FIXES APPLIED:                                      ║
 *  ║  ✅ Owner @lid detection (linked device) fixed       ║
 *  ║  ✅ fromMe flag respected (owner deleting own msgs)  ║
 *  ║  ✅ Lazy media download (no memory spikes)           ║
 *  ║  ✅ Sends to owner + linked device inbox             ║
 *  ║  ✅ Stylish Toxic MD output format                   ║
 *  ╚═══════════════════════════════════════════════════════╝
 *
 *  © 2026 Abdul Rehman Rajpoot — All rights reserved
 *****************************************************************************/

'use strict';

const fs   = require('fs');
const path = require('path');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const { writeFile } = require('fs/promises');
const store          = require('../lib/lightweight_store');
const { cleanJid, isLidJid, resolveOwnerNumber } = require('../lib/isOwner');

/* ── Storage ─────────────────────────────────────────────────────────────── */
const messageStore   = new Map();          // id → metadata (NOT raw buffers)
const MAX_STORE_SIZE = 500;                // hard cap → prevents memory leak
const CONFIG_PATH    = path.join(process.cwd(), 'data', 'antidelete.json');
const TEMP_DIR       = path.join(process.cwd(), 'tmp', 'antidel');
const HAS_DB         = !!(process.env.MONGO_URL || process.env.POSTGRES_URL || process.env.MYSQL_URL || process.env.DB_URL);

if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

/* ── Temp folder auto-clean (every 5 min, if >80 MB) ────────────────────── */
setInterval(() => {
    try {
        const files = fs.readdirSync(TEMP_DIR);
        let size = 0;
        files.forEach(f => { try { size += fs.statSync(path.join(TEMP_DIR, f)).size; } catch {} });
        if (size > 80 * 1024 * 1024) {
            files.forEach(f => { try { fs.unlinkSync(path.join(TEMP_DIR, f)); } catch {} });
            console.log('[ANTIDELETE] 🧹 Cleaned tmp (was >80 MB)');
        }
    } catch {}
}, 5 * 60 * 1000);

/* ── Config helpers ──────────────────────────────────────────────────────── */
async function loadConfig() {
    try {
        if (HAS_DB) {
            const c = await store.getSetting('global', 'antidelete');
            return { enabled: false, delpath: 'group', ...(c || {}) };
        }
        if (!fs.existsSync(CONFIG_PATH)) return { enabled: false, delpath: 'group' };
        return { enabled: false, delpath: 'group', ...JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) };
    } catch { return { enabled: false, delpath: 'group' }; }
}

async function saveConfig(cfg) {
    try {
        if (HAS_DB) return store.saveSetting('global', 'antidelete', cfg);
        const dir = path.dirname(CONFIG_PATH);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
    } catch (e) { console.error('[ANTIDELETE] saveConfig:', e.message); }
}

/* ── isOwner-aware: should we skip this sender? ─────────────────────────── */
function isBotOrOwner(sock, jid) {
    if (!jid) return false;
    const ownerNum  = resolveOwnerNumber();
    const senderNum = cleanJid(jid);

    // Direct match
    if (ownerNum && senderNum === ownerNum) return true;

    // Bot/session match
    if (sock?.user?.id) {
        const botNum = cleanJid(sock.user.id);
        if (botNum && senderNum === botNum) return true;
    }

    // @lid from owner's linked device: if botNum === ownerNum any @lid DM is owner
    if (isLidJid(jid) && sock?.user?.id) {
        const botNum = cleanJid(sock.user.id);
        if (botNum && botNum === ownerNum) return true;
    }

    return false;
}

/* ── Delivery target helper ──────────────────────────────────────────────── */
function buildTargets(sock, cfg, groupJid) {
    const ownerNum = resolveOwnerNumber();
    const ownerJid = ownerNum ? ownerNum + '@s.whatsapp.net' : null;
    // Bot session JID = linked-device self-chat inbox
    const sessionJid = sock?.user?.id
        ? cleanJid(sock.user.id) + '@s.whatsapp.net'
        : null;

    const targets = new Set();
    const dp = cfg.delpath || 'group';

    if (dp === 'group') {
        // Send to the group where the message was deleted (if available)
        if (groupJid) targets.add(groupJid);
        // ALSO always notify owner DM so they never miss it
        if (ownerJid) targets.add(ownerJid);
        if (sessionJid && sessionJid !== ownerJid) targets.add(sessionJid);
    } else if (dp && !['owner', 'group'].includes(dp) && dp.includes('@')) {
        // Custom JID target
        targets.add(dp);
        // Also notify owner
        if (ownerJid) targets.add(ownerJid);
    } else {
        // 'owner' → owner DM + linked-device inbox (so both phone and PC see it)
        if (ownerJid)   targets.add(ownerJid);
        if (sessionJid && sessionJid !== ownerJid) targets.add(sessionJid);
    }
    return targets;
}

/* ── Detect & classify a message ─────────────────────────────────────────── */
function classifyMessage(message) {
    const vo = message.message?.viewOnceMessageV2?.message
             || message.message?.viewOnceMessage?.message;
    if (vo?.imageMessage) return { mediaType: 'image',    content: vo.imageMessage.caption || '',    viewOnce: true,  mediaMsg: vo.imageMessage  };
    if (vo?.videoMessage) return { mediaType: 'video',    content: vo.videoMessage.caption || '',    viewOnce: true,  mediaMsg: vo.videoMessage  };

    if (message.message?.conversation)                 return { mediaType: '',       content: message.message.conversation };
    if (message.message?.extendedTextMessage?.text)    return { mediaType: '',       content: message.message.extendedTextMessage.text };
    if (message.message?.imageMessage)                 return { mediaType: 'image',  content: message.message.imageMessage.caption || '' };
    if (message.message?.videoMessage)                 return { mediaType: 'video',  content: message.message.videoMessage.caption || '' };
    if (message.message?.stickerMessage)               return { mediaType: 'sticker',content: '' };
    if (message.message?.audioMessage)                 return { mediaType: 'audio',  content: '' };
    if (message.message?.voiceMessage)                 return { mediaType: 'audio',  content: '' };
    if (message.message?.documentMessage)              return { mediaType: 'document',content: message.message.documentMessage.caption || '' };
    return { mediaType: '', content: '' };
}

/* ── Store message (metadata only — lazy media) ──────────────────────────── */
async function storeMessage(sock, message) {
    try {
        const cfg = await loadConfig();
        if (!cfg.enabled) return;
        if (!message.key?.id) return;

        // Trim store to max size
        if (messageStore.size >= MAX_STORE_SIZE) {
            messageStore.delete(messageStore.keys().next().value);
        }

        const { mediaType, content, viewOnce, mediaMsg } = classifyMessage(message);
        const sender  = message.key.participant || message.key.remoteJid;
        const groupJid = message.key.remoteJid?.endsWith('@g.us') ? message.key.remoteJid : null;

        messageStore.set(message.key.id, {
            content, mediaType, viewOnce: !!viewOnce,
            sender, groupJid,
            timestamp: Date.now(),
            fullMessage: message,
        });

        // View-once: download immediately (can't access again after first view)
        if (viewOnce && mediaType && mediaMsg) {
            await _downloadAndForwardViewOnce(sock, message.key.id, mediaMsg, mediaType, sender, groupJid, cfg);
        }
    } catch (e) {
        console.error('[ANTIDELETE] storeMessage:', e.message);
    }
}

async function _downloadAndForwardViewOnce(sock, msgId, mediaMsg, mediaType, sender, groupJid, cfg) {
    try {
        const stream = await downloadContentFromMessage(mediaMsg, mediaType);
        const chunks = [];
        for await (const c of stream) chunks.push(c);
        if (!chunks.length) return;

        const ext = mediaType === 'video' ? 'mp4' : 'jpg';
        const out = path.join(TEMP_DIR, `vo_${msgId}.${ext}`);
        await writeFile(out, Buffer.concat(chunks));

        const targets = buildTargets(sock, cfg, groupJid);
        const senderNum = cleanJid(sender);
        const caption =
`╭───( 🔰 REDXBOT302 )───
├───≫ 👁️ VIEW-ONCE SAVED ≪───
├
├ 👤 *From:* @${senderNum}
├ 📎 *Type:* ${mediaType.toUpperCase()}
╰──────────────────────☉
> 𝑷𝒐𝒘𝒆𝒓𝒆𝒅 𝑩𝒚 𝑹𝑬𝑫𝑿𝑩𝑶𝑻𝟑𝟎𝟐 🔥`;

        for (const jid of targets) {
            if (mediaType === 'image') await sock.sendMessage(jid, { image:  { url: out }, caption, mentions: [sender] }).catch(() => {});
            else                       await sock.sendMessage(jid, { video:  { url: out }, caption, mentions: [sender] }).catch(() => {});
        }
        try { fs.unlinkSync(out); } catch {}
    } catch (e) {
        console.error('[ANTIDELETE] view-once forward:', e.message);
    }
}

/* ── Lazy media download (called ONLY when deletion detected) ─────────────── */
async function downloadMedia(original, msgId) {
    const { mediaType, fullMessage } = original;
    if (!mediaType || !fullMessage) return null;
    try {
        const msg = fullMessage.message;
        let mediaMsg, dlType = mediaType;

        if (mediaType === 'image')    mediaMsg = msg?.imageMessage;
        else if (mediaType === 'video')    mediaMsg = msg?.videoMessage;
        else if (mediaType === 'sticker')  { mediaMsg = msg?.stickerMessage;  dlType = 'sticker'; }
        else if (mediaType === 'audio')    { mediaMsg = msg?.audioMessage || msg?.voiceMessage; dlType = 'audio'; }
        else if (mediaType === 'document') mediaMsg = msg?.documentMessage;

        if (!mediaMsg) return null;

        const stream = await downloadContentFromMessage(mediaMsg, dlType);
        const chunks = [];
        for await (const c of stream) chunks.push(c);
        if (!chunks.length) return null;

        let ext = 'bin';
        if (mediaType === 'image')    ext = 'jpg';
        else if (mediaType === 'video')    ext = 'mp4';
        else if (mediaType === 'sticker')  ext = 'webp';
        else if (mediaType === 'audio')    ext = (mediaMsg.mimetype || '').includes('ogg') ? 'ogg' : 'mp3';
        else if (mediaType === 'document') ext = (mediaMsg.fileName || 'doc.bin').split('.').pop() || 'bin';

        const out = path.join(TEMP_DIR, `del_${msgId}.${ext}`);
        await writeFile(out, Buffer.concat(chunks));
        return { mediaPath: out, ext };
    } catch (e) {
        console.error('[ANTIDELETE] downloadMedia:', e.message);
        return null;
    }
}

/* ── Handle deletion event ───────────────────────────────────────────────── */
async function handleMessageRevocation(sock, revocationMessage) {
    try {
        const cfg = await loadConfig();
        if (!cfg.enabled) return;

        const actual   = revocationMessage.update || revocationMessage;
        const msgId    = actual.message?.protocolMessage?.key?.id
                       || revocationMessage.message?.protocolMessage?.key?.id;
        if (!msgId) return;

        const deletedBy = actual.participant
                       || actual.key?.participant
                       || revocationMessage.participant
                       || revocationMessage.key?.participant
                       || revocationMessage.key?.remoteJid
                       || '';

        // ── FIXED: skip if owner/bot deleted their OWN message ─────────────
        if (isBotOrOwner(sock, deletedBy)) return;

        const original = messageStore.get(msgId);
        if (!original) return;

        const { content, mediaType, sender, groupJid } = original;
        const senderNum  = cleanJid(sender);
        const deleterNum = cleanJid(deletedBy);

        let groupName = '';
        if (groupJid) {
            try { groupName = (await sock.groupMetadata(groupJid)).subject || 'Group'; } catch { groupName = 'Group'; }
        }

        const time = new Date().toLocaleString('en-PK', {
            timeZone: 'Asia/Karachi', hour12: true,
            hour: '2-digit', minute: '2-digit',
            day: '2-digit', month: 'short', year: 'numeric'
        });

        let notifyText =
`╭───( 🔰 REDXBOT302 )───
├───≫ 🗑️ ANTIDELETE ALERT ≪───
├
├ 🚫 *Deleted By:* @${deleterNum}
├ 👤 *Sender:* @${senderNum}
├ 📱 *Number:* +${senderNum}
├ 🕒 *Time:* ${time}`;
        if (groupName) notifyText += `\n├ 👥 *Group:* ${groupName}`;
        if (content)   notifyText += `\n├\n├ 💬 *Message:*\n│ ${content.replace(/\n/g, '\n│ ')}`;
        if (mediaType) notifyText += `\n├ 📎 *Media:* ${mediaType.toUpperCase()}`;
        notifyText +=
`
╰──────────────────────☉
> 𝑷𝒐𝒘𝒆𝒓𝒆𝒅 𝑩𝒚 𝑹𝑬𝑫𝑿𝑩𝑶𝑻𝟑𝟎𝟐 🔥`;

        const targets = buildTargets(sock, cfg, groupJid);
        for (const jid of targets) {
            await sock.sendMessage(jid, { text: notifyText, mentions: [deletedBy, sender] }).catch(() => {});
        }

        // Lazy-download media only NOW (on deletion)
        if (mediaType) {
            const dl = await downloadMedia(original, msgId);
            if (dl) {
                const { mediaPath } = dl;
                const docMsg = original.fullMessage?.message?.documentMessage;
                const opts = { caption: `🗑️ *Deleted ${mediaType}*\nFrom: @${senderNum}`, mentions: [sender] };

                for (const jid of targets) {
                    try {
                        if      (mediaType === 'image')    await sock.sendMessage(jid, { image:    { url: mediaPath }, ...opts });
                        else if (mediaType === 'video')    await sock.sendMessage(jid, { video:    { url: mediaPath }, ...opts });
                        else if (mediaType === 'sticker')  await sock.sendMessage(jid, { sticker:  { url: mediaPath } });
                        else if (mediaType === 'audio')    await sock.sendMessage(jid, { audio:    { url: mediaPath }, mimetype: 'audio/mpeg', ptt: false });
                        else if (mediaType === 'document') await sock.sendMessage(jid, {
                            document:  { url: mediaPath },
                            fileName:  docMsg?.fileName || path.basename(mediaPath),
                            mimetype:  docMsg?.mimetype || 'application/octet-stream',
                            ...opts
                        });
                    } catch { await sock.sendMessage(jid, { text: '⚠️ Could not retrieve deleted media.' }).catch(() => {}); }
                }
                try { fs.unlinkSync(mediaPath); } catch {}
            }
        }

        messageStore.delete(msgId);
    } catch (e) {
        console.error('[ANTIDELETE] handleMessageRevocation:', e.message);
    }
}

/* ── Plugin export ───────────────────────────────────────────────────────── */
module.exports = {
    command    : 'antidelete',
    aliases    : ['antidel', 'adel', 'nodel'],
    category   : 'owner',
    description: '🗑️ Recover deleted messages — sent to group + owner DM (default: group mode)',
    usage      : '.antidelete on/off/status/delpath [owner|group|jid]',
    ownerOnly  : true,

    async handler(sock, message, args, context = {}) {
        const chatId = context.chatId || message.key.remoteJid;
        const cfg    = await loadConfig();
        const action = (args[0] || '').toLowerCase().trim();

        if (!action || action === 'status') {
            const dp = cfg.delpath === 'owner' ? '👑 Owner DM'
                     : cfg.delpath === 'group' ? '👥 Group (where deleted) + Owner DM'
                     : `📍 ${cfg.delpath} + Owner DM`;
            return sock.sendMessage(chatId, {
                text:
`╭───( 🔰 REDXBOT302 )───
├───≫ 🗑️ ANTIDELETE STATUS ≪───
├
├ ⚡ *Status:* ${cfg.enabled ? '✅ ACTIVE' : '❌ OFFLINE'}
├ 📬 *Delpath:* ${dp}
├ 💾 *Mode:* Lazy (memory-safe ✅)
├ 📦 *Stored:* ${messageStore.size} messages
├
├ ─── 𝗖𝗼𝗺𝗺𝗮𝗻𝗱𝘀 ───
├ • *.antidelete on/off*
├ • *.antidelete delpath owner*
├ • *.antidelete delpath group*
├ • *.antidelete delpath <jid>*
╰──────────────────────☉
> 𝑷𝒐𝒘𝒆𝒓𝒆𝒅 𝑩𝒚 𝑹𝑬𝑫𝑿𝑩𝑶𝑻𝟑𝟎𝟐 🔥`
            }, { quoted: message });
        }

        if (action === 'on') {
            cfg.enabled = true;
            await saveConfig(cfg);
            return sock.sendMessage(chatId, {
                text:
`╭───( 🔰 REDXBOT302 )───
├ ✅ *ANTIDELETE ENABLED*
├ 🗑️ Deleted messages will be reported.
├ 📬 Delpath: ${cfg.delpath === 'owner' ? 'Owner DM' : cfg.delpath}
╰──────────────────────☉`
            }, { quoted: message });
        }

        if (action === 'off') {
            cfg.enabled = false;
            await saveConfig(cfg);
            return sock.sendMessage(chatId, {
                text:
`╭───( 🔰 REDXBOT302 )───
├ ❌ *ANTIDELETE DISABLED*
╰──────────────────────☉`
            }, { quoted: message });
        }

        if (action === 'delpath') {
            const sub = (args[1] || '').toLowerCase().trim();
            if (!sub) {
                return sock.sendMessage(chatId, {
                    text: `📬 *Current delpath:* ${cfg.delpath}\n\nOptions: \`owner\`, \`group\`, or a full JID`
                }, { quoted: message });
            }
            if (['owner', 'group'].includes(sub) || sub.includes('@')) {
                cfg.delpath = sub;
                await saveConfig(cfg);
                return sock.sendMessage(chatId, {
                    text: `✅ *Delpath set to:* \`${sub}\``
                }, { quoted: message });
            }
            return sock.sendMessage(chatId, {
                text: '❌ Invalid. Use `owner`, `group`, or a valid JID.'
            }, { quoted: message });
        }

        return sock.sendMessage(chatId, {
            text: '❌ Unknown action. Use `.antidelete status` for help.'
        }, { quoted: message });
    },

    handleMessageRevocation,
    storeMessage,
    loadConfig,
    saveConfig,
};
