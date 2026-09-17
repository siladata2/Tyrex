/*****************************************************************************
 *  plugins/antidelete.js — TYREX_KSH MD (Fixed + Push Name)
 *  Powerd By TYREX_KSH TECH
 *
 *  FEATURES:
 *  - Reports deleted messages to owner DM / group / custom JID
 *  - Shows REAL PUSH NAME of deleter and sender (not just phone number)
 *  - Handles view-once, images, videos, audio, stickers, documents
 *  - Persists to DB (if configured) to survive restarts
 *  - Dual-key storage (messageId + phone:messageId) for @lid drift
 *  - TTL + size cap eviction
 *****************************************************************************/

'use strict';
const fs   = require('fs');
const path = require('path');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const { writeFile } = require('fs/promises');
const store = require('../lib/lightweight_store');

const messageStore   = new Map();
const storeOrder      = [];
const MAX_STORE_SIZE  = 4000;
const STORE_TTL_MS    = 6 * 60 * 60 * 1000; // 6h

const CONFIG_PATH    = path.join(__dirname, '../data/antidelete.json');
const TEMP_MEDIA_DIR = path.join(__dirname, '../tmp');
const HAS_DB = !!(process.env.MONGO_URL || process.env.POSTGRES_URL || process.env.MYSQL_URL || process.env.DB_URL);

if (!fs.existsSync(TEMP_MEDIA_DIR)) fs.mkdirSync(TEMP_MEDIA_DIR, { recursive: true });

/* ─── Phone helpers ──────────────────────────────────────────────────────── */
function phoneNum(jid) {
    if (!jid) return '';
    return String(jid).split(':')[0].split('@')[0].replace(/\D/g, '');
}
function toSWJid(jid) {
    const n = phoneNum(jid);
    return n ? `${n}@s.whatsapp.net` : null;
}
function samePhone(a, b) {
    const na = phoneNum(a), nb = phoneNum(b);
    return !!(na && nb && (na === nb || na.slice(-9) === nb.slice(-9)));
}

/* ─── Get REAL Contact / Push Name ───────────────────────────────────────── */
/**
 * Hupata jina halisi la mtumiaji kutoka kwa WhatsApp.
 * Inajaribu vyanzo kadhaa:
 *   1. store.getContact (kama unatumia lightweight_store na contacts)
 *   2. sock.onWhatsApp (push name ya sasa)
 *   3. Group metadata (kama ni group participant)
 *   4. Fallback: namba ya simu
 */
async function getContactName(sock, jid) {
    if (!jid) return 'Unknown';
    const phone = phoneNum(jid);
    if (!phone) return 'Unknown';

    const swJid = `${phone}@s.whatsapp.net`;

    try {
        // 1) Jaribu lightweight_store contacts
        if (typeof store.getContact === 'function') {
            try {
                const c = await store.getContact(swJid);
                if (c?.name || c?.notify) return c.name || c.notify;
            } catch {}
        }

        // 2) sock.onWhatsApp — inarudisha pushName kwa kawaida
        try {
            const res = await sock.onWhatsApp(swJid);
            if (Array.isArray(res) && res[0]) {
                // Baileys inaweza kurudisha { jid, exists, name, notify }
                const r = res[0];
                if (r.name)   return r.name;
                if (r.notify) return r.notify;
                if (r.verifiedName) return r.verifiedName;
            }
        } catch {}

        // 3) Jaribu store ya contacts (Baileys store)
        try {
            if (sock.store?.contacts) {
                const c = sock.store.contacts[swJid];
                if (c?.name || c?.notify) return c.name || c.notify;
            }
        } catch {}

        // 4) Fallback
        return `+${phone}`;
    } catch (e) {
        return `+${phone}`;
    }
}

/* ─── Owner JID resolution ───────────────────────────────────────────────── */
function getOwnerJid(sock) {
    const uid    = sock?.user?.id || '';
    const botNum = phoneNum(uid);
    if (botNum) return `${botNum}@s.whatsapp.net`;
    try {
        const settings = require('../settings');
        const ownerPhone = phoneNum(settings.ownerNumber || settings.owner || '');
        if (ownerPhone) return `${ownerPhone}@s.whatsapp.net`;
    } catch {}
    return null;
}

/* ─── Temp cleanup ───────────────────────────────────────────────────────── */
setInterval(() => {
    try {
        const files = fs.readdirSync(TEMP_MEDIA_DIR);
        let total = 0;
        files.forEach(f => { try { total += fs.statSync(path.join(TEMP_MEDIA_DIR, f)).size; } catch {} });
        if (total > 80 * 1024 * 1024) {
            files.forEach(f => { try { fs.unlinkSync(path.join(TEMP_MEDIA_DIR, f)); } catch {} });
            console.log('[ANTIDELETE] Cleaned tmp folder');
        }
    } catch {}
}, 5 * 60_000);

setInterval(() => {
    const cutoff = Date.now() - STORE_TTL_MS;
    while (storeOrder.length && storeOrder[0].ts < cutoff) {
        const old = storeOrder.shift();
        messageStore.delete(old.messageId);
        if (old.phoneKey) messageStore.delete(old.phoneKey);
    }
}, 10 * 60_000);

/* ─── Config ─────────────────────────────────────────────────────────────── */
async function loadAntideleteConfig() {
    try {
        if (HAS_DB) {
            const cfg = await store.getSetting('global', 'antidelete');
            return { enabled: false, delpath: 'owner', ...(cfg || {}) };
        }
        if (!fs.existsSync(CONFIG_PATH)) return { enabled: false, delpath: 'owner' };
        return { enabled: false, delpath: 'owner', ...JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) };
    } catch { return { enabled: false, delpath: 'owner' }; }
}

async function saveAntideleteConfig(cfg) {
    try {
        if (HAS_DB) { await store.saveSetting('global', 'antidelete', cfg); return; }
        const dir = path.dirname(CONFIG_PATH);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
    } catch (e) { console.error('[ANTIDELETE] save error:', e.message); }
}

/* ─── storeMessage ───────────────────────────────────────────────────────── */
async function storeMessage(sock, message) {
    try {
        if (!message.key?.id) return;

        const messageId = message.key.id;
        const sender    = message.key.participant || message.key.remoteJid;

        let content = '', mediaType = '';
        const voC = message.message?.viewOnceMessageV2?.message || message.message?.viewOnceMessage?.message;

        if      (voC?.imageMessage)                          { mediaType='image';    content=voC.imageMessage.caption||''; }
        else if (voC?.videoMessage)                          { mediaType='video';    content=voC.videoMessage.caption||''; }
        else if (message.message?.conversation)              { content=message.message.conversation; }
        else if (message.message?.extendedTextMessage?.text) { content=message.message.extendedTextMessage.text; }
        else if (message.message?.imageMessage)              { mediaType='image';    content=message.message.imageMessage.caption||''; }
        else if (message.message?.videoMessage)              { mediaType='video';    content=message.message.videoMessage.caption||''; }
        else if (message.message?.audioMessage)              { mediaType='audio'; }
        else if (message.message?.voiceMessage)              { mediaType='audio'; }
        else if (message.message?.stickerMessage)            { mediaType='sticker'; }
        else if (message.message?.documentMessage)           { mediaType='document'; content=message.message.documentMessage.caption||''; }

        const meta = {
            content, mediaType, sender,
            group:       message.key.remoteJid?.endsWith('@g.us') ? message.key.remoteJid : null,
            timestamp:   Date.now(),
            fullMessage: message,
        };

        messageStore.set(messageId, meta);
        const senderPhone = phoneNum(sender);
        const phoneKey = senderPhone ? `${senderPhone}:${messageId}` : null;
        if (phoneKey) messageStore.set(phoneKey, meta);

        storeOrder.push({ messageId, phoneKey, ts: meta.timestamp });
        while (storeOrder.length > MAX_STORE_SIZE) {
            const old = storeOrder.shift();
            messageStore.delete(old.messageId);
            if (old.phoneKey) messageStore.delete(old.phoneKey);
        }

        if (HAS_DB) {
            store.saveSetting(`antidel:${messageId}`, 'meta', {
                content, mediaType, sender, group: meta.group, timestamp: meta.timestamp,
            }).catch(() => {});
        }

        // View-once: download na tuma kwa owner mara moja
        const isViewOnce = !!(voC?.imageMessage || voC?.videoMessage);
        if (isViewOnce && mediaType) {
            try {
                const container = voC.imageMessage || voC.videoMessage;
                const stream    = await downloadContentFromMessage(container, mediaType);
                let buf = Buffer.alloc(0);
                for await (const ch of stream) buf = Buffer.concat([buf, ch]);
                const ext  = mediaType === 'image' ? 'jpg' : 'mp4';
                const fp   = path.join(TEMP_MEDIA_DIR, `vo_${messageId}.${ext}`);
                await writeFile(fp, buf);

                const ownerJid = getOwnerJid(sock);
                const senderName = await getContactName(sock, sender);

                if (ownerJid) {
                    const opts = {
                        caption: `*👁️ View-Once ${mediaType.toUpperCase()}*\n*From:* ${senderName}`,
                        mentions: [sender]
                    };
                    if (mediaType === 'image') await sock.sendMessage(ownerJid, { image: { url: fp }, ...opts });
                    else                       await sock.sendMessage(ownerJid, { video: { url: fp }, ...opts });
                }
                try { fs.unlinkSync(fp); } catch {}
            } catch (e) { console.error('[ANTIDELETE] ViewOnce error:', e.message); }
        }
    } catch (e) { console.error('[ANTIDELETE] storeMessage error:', e.message); }
}

/* ─── storeEdit stub ─────────────────────────────────────────────────────── */
async function storeEdit(sock, message) { /* not tracking edits */ }

/* ─── Media download ─────────────────────────────────────────────────────── */
async function downloadMedia(original, messageId) {
    const { mediaType, fullMessage } = original;
    if (!mediaType || !fullMessage) return null;
    try {
        const msg = fullMessage.message;
        let mediaMsg = null, dlType = mediaType;
        if      (mediaType === 'image')    { mediaMsg = msg?.imageMessage; }
        else if (mediaType === 'video')    { mediaMsg = msg?.videoMessage; }
        else if (mediaType === 'sticker')  { mediaMsg = msg?.stickerMessage; dlType = 'sticker'; }
        else if (mediaType === 'audio')    { mediaMsg = msg?.audioMessage || msg?.voiceMessage; dlType = 'audio'; }
        else if (mediaType === 'document') { mediaMsg = msg?.documentMessage; }
        if (!mediaMsg) return null;

        const stream = await downloadContentFromMessage(mediaMsg, dlType);
        let buf = Buffer.alloc(0);
        for await (const ch of stream) buf = Buffer.concat([buf, ch]);

        let ext = 'bin';
        if      (mediaType === 'image')    ext = 'jpg';
        else if (mediaType === 'video')    ext = 'mp4';
        else if (mediaType === 'sticker')  ext = 'webp';
        else if (mediaType === 'audio')    ext = (mediaMsg.mimetype||'').includes('ogg') ? 'ogg' : 'mp3';
        else if (mediaType === 'document') ext = (mediaMsg.fileName||'').split('.').pop() || 'bin';

        const fp = path.join(TEMP_MEDIA_DIR, `del_${messageId}_${Date.now()}.${ext}`);
        await writeFile(fp, buf);
        return { mediaPath: fp, ext };
    } catch (e) {
        console.error('[ANTIDELETE] download error:', e.message);
        return null;
    }
}

/* ─── handleMessageRevocation ────────────────────────────────────────────── */
async function handleMessageRevocation(sock, revocationMessage) {
    try {
        const config = await loadAntideleteConfig();
        if (!config.enabled) return;

        const messageId = revocationMessage.message?.protocolMessage?.key?.id;
        if (!messageId) {
            console.log('[ANTIDELETE] No messageId in protocolMessage');
            return;
        }

        const deletedBy  = revocationMessage.participant ||
                           revocationMessage.key?.participant ||
                           revocationMessage.key?.remoteJid;

        const ownerJid   = getOwnerJid(sock);
        const botPhone   = phoneNum(sock?.user?.id);

        if (samePhone(deletedBy, ownerJid) || samePhone(deletedBy, botPhone)) return;

        let original = messageStore.get(messageId);
        if (!original) {
            const fromPhone = phoneNum(
                revocationMessage.message?.protocolMessage?.key?.participant ||
                revocationMessage.key?.participant ||
                revocationMessage.key?.remoteJid
            );
            if (fromPhone) original = messageStore.get(`${fromPhone}:${messageId}`);
        }

        if (!original && HAS_DB) {
            try {
                const saved = await store.getSetting(`antidel:${messageId}`, 'meta');
                if (saved) original = saved;
            } catch {}
        }

        if (!original) {
            console.log(`[ANTIDELETE] msgId ${messageId} not in store`);
            return;
        }

        const sender      = original.sender;

        // ─── PATA MAJINA HALISI ───
        const deletedByName = await getContactName(sock, deletedBy);
        const senderName    = await getContactName(sock, sender);

        const groupName = original.group
            ? (await sock.groupMetadata(original.group).catch(() => ({ subject: 'Group' }))).subject
            : '';

        const time = new Date().toLocaleString('en-US', {
            timeZone: process.env.TIMEZONE || 'Africa/Dar_es_Salaam',
            hour12: true, hour: '2-digit', minute: '2-digit',
            day: '2-digit', month: '2-digit', year: 'numeric'
        });

        // ─── TUMIA MAJINA BADALA YA NAMBA ───
        let text =
            `*🔰 TYREX_KSH MD ANTIDELETE 🔰*\n\n` +
            `*🗑️ Deleted By:* ${deletedByName}\n` +
            `*👤 Sender:*    ${senderName}\n` +
            `*🕒 Time:*      ${time}\n`;
        if (groupName) text += `*👥 Group:*     ${groupName}\n`;
        if (original.content)   text += `\n*💬 Message:*\n${original.content}`;
        if (original.mediaType) text += `\n*📎 Type:* ${original.mediaType.toUpperCase()}`;

        let targetJid = ownerJid;
        const dp = config.delpath;
        if (dp === 'group' && original.group) targetJid = original.group;
        else if (dp && !['owner','group'].includes(dp) && dp.includes('@')) targetJid = dp;

        if (!targetJid) {
            console.error('[ANTIDELETE] No target JID — set ownerNumber in settings.js or .env');
            return;
        }

        await sock.sendMessage(targetJid, {
            text,
            mentions: [toSWJid(deletedBy), toSWJid(sender)].filter(Boolean)
        });

        // Tuma media kama ipo
        if (original.mediaType) {
            const dl = await downloadMedia(original, messageId);
            if (dl) {
                const doc  = original.fullMessage?.message?.documentMessage;
                const opts = {
                    caption:  `*Deleted ${original.mediaType.toUpperCase()}*\n*From:* ${senderName}`,
                    mentions: [toSWJid(sender)].filter(Boolean)
                };
                try {
                    switch (original.mediaType) {
                        case 'image':
                            await sock.sendMessage(targetJid, { image:    { url: dl.mediaPath }, ...opts }); break;
                        case 'video':
                            await sock.sendMessage(targetJid, { video:    { url: dl.mediaPath }, ...opts }); break;
                        case 'sticker':
                            await sock.sendMessage(targetJid, { sticker:  { url: dl.mediaPath } }); break;
                        case 'audio':
                            await sock.sendMessage(targetJid, { audio: { url: dl.mediaPath }, mimetype: 'audio/mpeg', ptt: false, ...opts }); break;
                        case 'document':
                            await sock.sendMessage(targetJid, {
                                document: { url: dl.mediaPath },
                                fileName: doc?.fileName || path.basename(dl.mediaPath),
                                mimetype: doc?.mimetype || 'application/octet-stream',
                                ...opts
                            }); break;
                    }
                } catch (e) {
                    await sock.sendMessage(targetJid, { text: `⚠️ Could not send deleted media: ${e.message}` });
                }
                try { fs.unlinkSync(dl.mediaPath); } catch {}
            }
        }

        messageStore.delete(messageId);
        if (original.sender) messageStore.delete(`${phoneNum(original.sender)}:${messageId}`);

    } catch (e) { console.error('[ANTIDELETE] handleMessageRevocation error:', e.message); }
}

/* ─── handleMessageEdit stub ─────────────────────────────────────────────── */
async function handleMessageEdit(sock, update) { /* not implemented */ }

/* ─── Command handler ────────────────────────────────────────────────────── */
module.exports = {
    command: 'antidelete',
    aliases: ['antidel', 'adel'],
    category: 'owner',
    description: 'Antidelete — reports deleted messages/media to owner DM (with real names)',
    usage: '.antidelete on | off | delpath owner|group|<jid> | status',
    ownerOnly: true,

    async handler(sock, message, args, context = {}) {
        const chatId = context.chatId || message.key.remoteJid;
        const config = await loadAntideleteConfig();
        const action = args[0]?.toLowerCase();
        const reply  = (text) => sock.sendMessage(chatId, { text }, { quoted: message });

        if (!action || action === 'status') {
            const dp = config.delpath === 'owner' ? 'Owner DM' :
                       config.delpath === 'group' ? 'Group (where deleted)' :
                       `Custom: ${config.delpath}`;
            return reply(
                `*🔰 ANTIDELETE STATUS*\n\n` +
                `*Status:*   ${config.enabled ? '✅ ON' : '❌ OFF'}\n` +
                `*Delpath:*  ${dp}\n` +
                `*Cached:*   ${messageStore.size} messages\n\n` +
                `*Commands:*\n` +
                `• \`.antidelete on/off\`\n` +
                `• \`.antidelete delpath owner\` — send to owner DM\n` +
                `• \`.antidelete delpath group\` — send in group\n` +
                `• \`.antidelete delpath <jid>\` — custom JID`
            );
        }

        if (action === 'on') {
            config.enabled = true;
            await saveAntideleteConfig(config);
            const ownerJid = getOwnerJid(sock);
            return reply(`✅ *Antidelete ENABLED*\n\nAll future deleted messages will be reported.\n*Target:* ${config.delpath === 'owner' ? ownerJid || 'owner' : config.delpath}\n\n⚠️ Only messages sent AFTER this moment will be tracked.`);
        }

        if (action === 'off') {
            config.enabled = false;
            await saveAntideleteConfig(config);
            return reply('❌ *Antidelete DISABLED*');
        }

        if (action === 'delpath') {
            const sub = args[1]?.toLowerCase();
            if (!sub) return reply(`*Current delpath:* ${config.delpath}\n\nOptions: \`owner\` / \`group\` / \`<full JID>\``);
            if (['owner','group'].includes(sub) || sub.includes('@')) {
                config.delpath = sub;
                await saveAntideleteConfig(config);
                return reply(`✅ Delpath → *${sub}*`);
            }
            return reply('❌ Use: owner / group / full JID (e.g. 923001234567@s.whatsapp.net)');
        }

        return reply('❌ Usage: `.antidelete on|off|delpath|status`');
    },

    handleMessageRevocation,
    handleMessageEdit,
    storeMessage,
    storeEdit,
    loadAntideleteConfig,
    saveAntideleteConfig,
    getContactName,
};