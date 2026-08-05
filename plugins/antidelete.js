/*****************************************************************************
 *  plugins/antidelete.js — REDXBOT302 (Fixed)
 *  Developed By Abdul Rehman Rajpoot
 *
 *  ROOT CAUSE FIXES:
 *  1. storeMessage: REMOVED "if (!config.enabled) return" gate — always store.
 *     Messages sent before .antidelete on were never stored → deletion found
 *     nothing in map → silently returned. Now ALWAYS stores, checks enabled
 *     only at report time.
 *
 *  2. ownerNumber: now uses settings.ownerNumber as fallback — sock.user.id
 *     format varies per Baileys version and was sometimes wrong.
 *
 *  3. deletedBy skip check: was string equality (breaks on @lid JIDs).
 *     Now uses phone-number comparison (digits only match).
 *
 *  4. Dual-key store: stores under BOTH messageId AND phone:messageId to
 *     survive @lid key drift between store and revocation event.
 *
 *  5. messages.update revocation: index.js already fires syntheticMsg — this
 *     file handles it correctly.
 *****************************************************************************/

'use strict';
const fs   = require('fs');
const path = require('path');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const { writeFile } = require('fs/promises');
const store = require('../lib/lightweight_store');

const messageStore   = new Map();
const MAX_STORE_SIZE = 1000; // bumped — more coverage

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

/* ─── Owner JID resolution ───────────────────────────────────────────────── */
// CRITICAL: DM target must be sock.user.id (bot's own number = linked device inbox).
// settings.ownerNumber is the owner's phone but DMs land in the BOT's own chat.
// This is the same inbox .vv uses — sock.user.id is always correct.
function getOwnerJid(sock) {
    // Primary: sock.user.id = linked device DM inbox (what .vv uses)
    const uid    = sock?.user?.id || '';
    const botNum = phoneNum(uid);
    if (botNum) return `${botNum}@s.whatsapp.net`;
    // Fallback: settings.ownerNumber
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

        // FIX 1: ALWAYS STORE — never gate on config.enabled here.
        // We have no way to know if antidelete will be enabled by the time
        // someone deletes a message. Check enabled only at report time.

        if (messageStore.size >= MAX_STORE_SIZE) {
            messageStore.delete(messageStore.keys().next().value);
        }

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

        // FIX 4: dual-key store — primary + phone:id fallback for @lid drift
        messageStore.set(messageId, meta);
        const senderPhone = phoneNum(sender);
        if (senderPhone) messageStore.set(`${senderPhone}:${messageId}`, meta);

        // View-once: download immediately
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
                if (ownerJid) {
                    const opts = { caption: `*👁️ View-Once ${mediaType}*\nFrom: @${phoneNum(sender)}`, mentions: [sender] };
                    if (mediaType === 'image') await sock.sendMessage(ownerJid, { image: { url: fp }, ...opts });
                    else                       await sock.sendMessage(ownerJid, { video: { url: fp }, ...opts });
                }
                try { fs.unlinkSync(fp); } catch {}
            } catch (e) { console.error('[ANTIDELETE] ViewOnce error:', e.message); }
        }
    } catch (e) { console.error('[ANTIDELETE] storeMessage error:', e.message); }
}

/* ─── storeEdit (called from messageHandler for edit tracking) ───────────── */
async function storeEdit(sock, message) {
    // passthrough — not tracking edits in this version
}

/* ─── Media download (lazy — only on deletion) ───────────────────────────── */
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
        // FIX 1: check enabled HERE (not in storeMessage)
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

        // FIX 2: owner JID from settings, not just sock.user.id
        const ownerJid   = getOwnerJid(sock);
        const botPhone   = phoneNum(sock?.user?.id);

        // FIX 3: phone-number comparison, not string equality
        if (samePhone(deletedBy, ownerJid) || samePhone(deletedBy, botPhone)) return;

        // FIX 4: dual-key lookup
        let original = messageStore.get(messageId);
        if (!original) {
            // Try phone-prefixed key
            const fromPhone = phoneNum(
                revocationMessage.message?.protocolMessage?.key?.participant ||
                revocationMessage.key?.participant ||
                revocationMessage.key?.remoteJid
            );
            if (fromPhone) original = messageStore.get(`${fromPhone}:${messageId}`);
        }

        if (!original) {
            console.log(`[ANTIDELETE] msgId ${messageId} not in store — was sent before bot started or before antidelete was enabled on this session`);
            return;
        }

        const sender      = original.sender;
        const senderPhone = phoneNum(sender);
        const delPhone    = phoneNum(deletedBy);

        const groupName = original.group
            ? (await sock.groupMetadata(original.group).catch(() => ({ subject: 'Group' }))).subject
            : '';

        const time = new Date().toLocaleString('en-US', {
            timeZone: process.env.TIMEZONE || 'Asia/Karachi',
            hour12: true, hour: '2-digit', minute: '2-digit',
            day: '2-digit', month: '2-digit', year: 'numeric'
        });

        let text =
            `*🔰 REDX ANTIDELETE 🔰*\n\n` +
            `*🗑️ Deleted By:* +${delPhone}\n` +
            `*👤 Sender:*    +${senderPhone}\n` +
            `*🕒 Time:*      ${time}\n`;
        if (groupName) text += `*👥 Group:*     ${groupName}\n`;
        if (original.content)   text += `\n*💬 Message:*\n${original.content}`;
        if (original.mediaType) text += `\n*📎 Type:* ${original.mediaType.toUpperCase()}`;

        // Resolve target JID
        let targetJid = ownerJid;
        const dp = config.delpath;
        if (dp === 'group' && original.group) targetJid = original.group;
        else if (dp && !['owner','group'].includes(dp) && dp.includes('@')) targetJid = dp;

        if (!targetJid) {
            console.error('[ANTIDELETE] No target JID — set ownerNumber in settings.js or .env');
            return;
        }

        // Send text report
        await sock.sendMessage(targetJid, {
            text,
            mentions: [toSWJid(deletedBy), toSWJid(sender)].filter(Boolean)
        });

        // Send media if any
        if (original.mediaType) {
            const dl = await downloadMedia(original, messageId);
            if (dl) {
                const doc  = original.fullMessage?.message?.documentMessage;
                const opts = {
                    caption:  `*Deleted ${original.mediaType.toUpperCase()}*\nFrom: +${senderPhone}`,
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

        // Cleanup both keys
        messageStore.delete(messageId);
        if (original.sender) messageStore.delete(`${phoneNum(original.sender)}:${messageId}`);

    } catch (e) { console.error('[ANTIDELETE] handleMessageRevocation error:', e.message); }
}

/* ─── handleMessageEdit (stub — called from messageHandler) ──────────────── */
async function handleMessageEdit(sock, update) {
    // Not implemented in this version
}

/* ─── Command handler ────────────────────────────────────────────────────── */
module.exports = {
    command: 'antidelete',
    aliases: ['antidel', 'adel'],
    category: 'owner',
    description: 'Antidelete — reports deleted messages/media to owner DM',
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
};
