/*****************************************************************************
 *  REDX BOT - ANTIDELETE (Memory-Safe Version)
 *  Fix: No longer downloads ALL media on every message.
 *  Only downloads media WHEN a deletion is detected (lazy download).
 *  This prevents memory spikes that caused bot restarts on Heroku.
 *****************************************************************************/

const fs = require('fs');
const path = require('path');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const { writeFile } = require('fs/promises');
const store = require('../lib/lightweight_store');

// Store METADATA only (not full media buffers) — saves memory
// We store the full message object so we can download on-demand at deletion time
const messageStore = new Map();
const MAX_STORE_SIZE = 500; // never store more than 500 messages (prevents memory leak)

const CONFIG_PATH = path.join(__dirname, '../data/antidelete.json');
const TEMP_MEDIA_DIR = path.join(__dirname, '../tmp');

const HAS_DB = !!(process.env.MONGO_URL || process.env.POSTGRES_URL || process.env.MYSQL_URL || process.env.DB_URL);

if (!fs.existsSync(TEMP_MEDIA_DIR)) {
    fs.mkdirSync(TEMP_MEDIA_DIR, { recursive: true });
}

// Clean tmp folder if over 100MB
const cleanTempFolderIfLarge = () => {
    try {
        const files = fs.readdirSync(TEMP_MEDIA_DIR);
        let totalSize = 0;
        for (const file of files) {
            const filePath = path.join(TEMP_MEDIA_DIR, file);
            try { totalSize += fs.statSync(filePath).size; } catch {}
        }
        if (totalSize > 100 * 1024 * 1024) {
            for (const file of files) {
                try { fs.unlinkSync(path.join(TEMP_MEDIA_DIR, file)); } catch {}
            }
            console.log('[ANTIDELETE] Cleaned tmp folder (was >100MB)');
        }
    } catch (err) {
        console.error('Temp cleanup error:', err);
    }
};
setInterval(cleanTempFolderIfLarge, 5 * 60 * 1000); // every 5 min

async function loadAntideleteConfig() {
    try {
        if (HAS_DB) {
            const config = await store.getSetting('global', 'antidelete');
            return { enabled: false, delpath: 'owner', ...(config || {}) };
        } else {
            if (!fs.existsSync(CONFIG_PATH)) return { enabled: false, delpath: 'owner' };
            const config = JSON.parse(fs.readFileSync(CONFIG_PATH));
            return { enabled: false, delpath: 'owner', ...config };
        }
    } catch {
        return { enabled: false, delpath: 'owner' };
    }
}

async function saveAntideleteConfig(config) {
    try {
        if (HAS_DB) {
            await store.saveSetting('global', 'antidelete', config);
        } else {
            fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
        }
    } catch (err) {
        console.error('Config save error:', err);
    }
}

/**
 * FIXED: Store only lightweight metadata — NOT the actual media buffer.
 * Media is downloaded lazily ONLY when deletion happens.
 */
async function storeMessage(sock, message) {
    try {
        const config = await loadAntideleteConfig();
        if (!config.enabled) return;
        if (!message.key?.id) return;

        // Prevent memory leak: trim old entries
        if (messageStore.size >= MAX_STORE_SIZE) {
            const firstKey = messageStore.keys().next().value;
            messageStore.delete(firstKey);
        }

        const messageId = message.key.id;
        const sender = message.key.participant || message.key.remoteJid;

        // Detect message type
        let content = '';
        let mediaType = '';

        const viewOnceContainer = message.message?.viewOnceMessageV2?.message || message.message?.viewOnceMessage?.message;

        if (viewOnceContainer?.imageMessage) {
            mediaType = 'image'; content = viewOnceContainer.imageMessage.caption || '';
        } else if (viewOnceContainer?.videoMessage) {
            mediaType = 'video'; content = viewOnceContainer.videoMessage.caption || '';
        } else if (message.message?.conversation) {
            content = message.message.conversation;
        } else if (message.message?.extendedTextMessage?.text) {
            content = message.message.extendedTextMessage.text;
        } else if (message.message?.imageMessage) {
            mediaType = 'image'; content = message.message.imageMessage.caption || '';
        } else if (message.message?.stickerMessage) {
            mediaType = 'sticker';
        } else if (message.message?.videoMessage) {
            mediaType = 'video'; content = message.message.videoMessage.caption || '';
        } else if (message.message?.audioMessage) {
            mediaType = 'audio';
        } else if (message.message?.documentMessage) {
            mediaType = 'document'; content = message.message.documentMessage.caption || '';
        } else if (message.message?.voiceMessage) {
            mediaType = 'audio';
        }

        // Store metadata + full message object for lazy download later
        messageStore.set(messageId, {
            content,
            mediaType,
            sender,
            group: message.key.remoteJid?.endsWith('@g.us') ? message.key.remoteJid : null,
            timestamp: Date.now(),
            fullMessage: message, // keep full message for lazy download
        });

        // Handle view-once: download immediately (user can't access it again)
        const isViewOnce = !!(viewOnceContainer?.imageMessage || viewOnceContainer?.videoMessage);
        if (isViewOnce && mediaType) {
            try {
                const container = viewOnceContainer.imageMessage || viewOnceContainer.videoMessage;
                const stream = await downloadContentFromMessage(container, mediaType);
                let buffer = Buffer.from([]);
                for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
                const ext = mediaType === 'image' ? 'jpg' : 'mp4';
                const mediaPath = path.join(TEMP_MEDIA_DIR, `vo_${messageId}.${ext}`);
                await writeFile(mediaPath, buffer);

                const realOwnerNum = require('../settings').ownerNumber || '';
                const ownerNumber = realOwnerNum
                    ? realOwnerNum.replace(/[^0-9]/g, '') + '@s.whatsapp.net'
                    : sock.user.id.split(':')[0] + '@s.whatsapp.net';
                const linkedDevice = sock.user.id.split(':')[0] + '@s.whatsapp.net';

                const freshConfig = await loadAntideleteConfig();
                const delpath = freshConfig.delpath || 'owner';
                const groupJid = message.key.remoteJid?.endsWith('@g.us') ? message.key.remoteJid : null;

                // Build delivery targets
                const voTargets = new Set();
                if (delpath === 'group' && groupJid) {
                    voTargets.add(groupJid);
                } else if (delpath && !['owner', 'group'].includes(delpath) && delpath.includes('@')) {
                    voTargets.add(delpath);
                } else {
                    voTargets.add(ownerNumber);
                    if (linkedDevice !== ownerNumber) voTargets.add(linkedDevice); // linked device inbox
                }

                const opts = { caption: `*👁️ View-Once ${mediaType}*\nFrom: @${sender.split('@')[0]}`, mentions: [sender] };
                for (const jid of voTargets) {
                    if (mediaType === 'image') await sock.sendMessage(jid, { image: { url: mediaPath }, ...opts }).catch(() => {});
                    else await sock.sendMessage(jid, { video: { url: mediaPath }, ...opts }).catch(() => {});
                }
                try { fs.unlinkSync(mediaPath); } catch {}
            } catch (e) { console.error('[ANTIDELETE] ViewOnce error:', e.message); }
        }

    } catch (err) {
        console.error('[ANTIDELETE] storeMessage error:', err.message);
    }
}

/**
 * Download media from a stored message object (called ONLY when deletion occurs)
 */
async function downloadMedia(original, messageId) {
    const { mediaType, fullMessage } = original;
    if (!mediaType || !fullMessage) return null;

    try {
        let mediaMsg = null;
        let downloadType = mediaType;
        const msg = fullMessage.message;

        if (mediaType === 'image') mediaMsg = msg?.imageMessage;
        else if (mediaType === 'video') mediaMsg = msg?.videoMessage;
        else if (mediaType === 'sticker') { mediaMsg = msg?.stickerMessage; downloadType = 'sticker'; }
        else if (mediaType === 'audio') { mediaMsg = msg?.audioMessage || msg?.voiceMessage; downloadType = 'audio'; }
        else if (mediaType === 'document') mediaMsg = msg?.documentMessage;

        if (!mediaMsg) return null;

        const stream = await downloadContentFromMessage(mediaMsg, downloadType);
        let buffer = Buffer.from([]);
        for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);

        let ext = 'bin';
        if (mediaType === 'image') ext = 'jpg';
        else if (mediaType === 'video') ext = 'mp4';
        else if (mediaType === 'sticker') ext = 'webp';
        else if (mediaType === 'audio') {
            const mime = mediaMsg.mimetype || '';
            ext = mime.includes('ogg') ? 'ogg' : 'mp3';
        } else if (mediaType === 'document') {
            const fileName = mediaMsg.fileName || `doc.${mediaMsg.mimetype?.split('/')[1] || 'bin'}`;
            ext = fileName.split('.').pop() || 'bin';
        }

        const mediaPath = path.join(TEMP_MEDIA_DIR, `del_${messageId}.${ext}`);
        await writeFile(mediaPath, buffer);
        return { mediaPath, ext };
    } catch (err) {
        console.error('[ANTIDELETE] Download error:', err.message);
        return null;
    }
}

async function handleMessageRevocation(sock, revocationMessage) {
    try {
        const config = await loadAntideleteConfig();
        if (!config.enabled) return;

        // messages.update fires with { key, update } structure; handle both shapes
        const actualMsg = revocationMessage.update || revocationMessage;
        const messageId = actualMsg.message?.protocolMessage?.key?.id
            || revocationMessage.message?.protocolMessage?.key?.id;
        if (!messageId) return;

        const deletedBy = actualMsg.participant || actualMsg.key?.participant
            || revocationMessage.participant || revocationMessage.key?.participant
            || revocationMessage.key?.remoteJid;
        const sessionNumber = sock.user.id.split(':')[0] + '@s.whatsapp.net';
        // Real owner from settings (linked device should also receive)
        const realOwnerNum = require('../settings').ownerNumber || '';
        const ownerNumber = realOwnerNum ? realOwnerNum.replace(/[^0-9]/g, '') + '@s.whatsapp.net' : sessionNumber;

        // Don't report if bot or owner deleted their own message
        const deletedByClean = deletedBy?.split(':')[0].split('@')[0];
        const sessionClean = sock.user.id.split(':')[0].split('@')[0];
        const ownerClean = ownerNumber.split('@')[0];
        if (deletedByClean === sessionClean || deletedByClean === ownerClean) return;

        const original = messageStore.get(messageId);
        if (!original) return;

        const sender = original.sender;
        const senderName = sender.split('@')[0];
        const groupName = original.group ? (await sock.groupMetadata(original.group).catch(() => ({ subject: 'Group' }))).subject : '';

        const time = new Date().toLocaleString('en-US', {
            timeZone: 'Asia/Karachi', hour12: true, hour: '2-digit', minute: '2-digit',
            day: '2-digit', month: '2-digit', year: 'numeric'
        });

        let text = `*🔰 REDX ANTIDELETE 🔰*\n\n` +
            `*🗑️ Deleted By:* @${deletedBy.split('@')[0]}\n` +
            `*👤 Sender:* @${senderName}\n` +
            `*📱 Number:* +${sender.split('@')[0]}\n` +
            `*🕒 Time:* ${time}\n`;
        if (groupName) text += `*👥 Group:* ${groupName}\n`;
        if (original.content) text += `\n*💬 Message:*\n${original.content}`;
        if (original.mediaType) text += `\n*📎 Media:* ${original.mediaType}`;

        // Determine delivery targets
        // Always deliver to owner number AND bot's own linked-device self-chat
        const delpath   = config.delpath;
        const linkedJid = sessionNumber; // bot session = linked device inbox
        const targets   = new Set();

        if (delpath === 'group' && original.group) {
            targets.add(original.group);
        } else if (delpath && !['owner', 'group'].includes(delpath) && delpath.includes('@')) {
            targets.add(delpath);
        } else {
            // delpath === 'owner' (default) — send to owner + linked device
            targets.add(ownerNumber);
            if (linkedJid !== ownerNumber) targets.add(linkedJid); // bot self inbox
        }

        for (const jid of targets) {
            await sock.sendMessage(jid, { text, mentions: [deletedBy, sender] }).catch(() => {});
        }

        // Now lazily download media ONLY when deletion is detected
        if (original.mediaType) {
            const downloaded = await downloadMedia(original, messageId);
            if (downloaded) {
                const { mediaPath } = downloaded;
                const doc = original.fullMessage?.message?.documentMessage;
                const opts = {
                    caption: `*Deleted ${original.mediaType}*\nFrom: @${senderName}`,
                    mentions: [sender]
                };
                for (const jid of targets) {
                    try {
                        switch (original.mediaType) {
                            case 'image':
                                await sock.sendMessage(jid, { image: { url: mediaPath }, ...opts }); break;
                            case 'sticker':
                                await sock.sendMessage(jid, { sticker: { url: mediaPath } }); break;
                            case 'video':
                                await sock.sendMessage(jid, { video: { url: mediaPath }, ...opts }); break;
                            case 'audio':
                                await sock.sendMessage(jid, { audio: { url: mediaPath }, mimetype: 'audio/mpeg', ptt: false, ...opts }); break;
                            case 'document':
                                await sock.sendMessage(jid, {
                                    document: { url: mediaPath },
                                    fileName: doc?.fileName || path.basename(mediaPath),
                                    mimetype: doc?.mimetype || 'application/octet-stream',
                                    ...opts
                                }); break;
                        }
                    } catch (e) {
                        await sock.sendMessage(jid, { text: `⚠️ Could not retrieve deleted media: ${e.message}` }).catch(() => {});
                    }
                }
                try { fs.unlinkSync(mediaPath); } catch {}
            }
        }

        messageStore.delete(messageId);

    } catch (err) {
        console.error('[ANTIDELETE] handleMessageRevocation error:', err.message);
    }
}

module.exports = {
    command: 'antidelete',
    aliases: ['antidel', 'adel'],
    category: 'owner',
    description: 'Enable/disable antidelete — shows deleted messages (text, media, docs, voice)',
    usage: '.antidelete <on|off|delpath> [owner|group|jid]',
    ownerOnly: true,  // Only owner/sudo can toggle ON/OFF — monitoring runs for ALL messages

    async handler(sock, message, args, context = {}) {
        const chatId = context.chatId || message.key.remoteJid;
        const config = await loadAntideleteConfig();
        const action = args[0]?.toLowerCase();

        if (!action) {
            const dp = config.delpath === 'owner' ? 'Owner Inbox' :
                config.delpath === 'group' ? 'Group where deletion occurred' :
                `Custom JID: ${config.delpath}`;
            return sock.sendMessage(chatId, {
                text: `*🔰 ANTIDELETE STATUS*\n\n` +
                    `*Status:* ${config.enabled ? '✅ ON' : '❌ OFF'}\n` +
                    `*Delpath:* ${dp}\n` +
                    `*Memory Mode:* ✅ Lazy (safe for Heroku)\n\n` +
                    `*Commands:*\n` +
                    `• \`.antidelete on/off\`\n` +
                    `• \`.antidelete delpath owner\` — send to owner DM\n` +
                    `• \`.antidelete delpath group\` — send in group\n` +
                    `• \`.antidelete delpath <jid>\` — send to specific JID`
            }, { quoted: message });
        }

        if (action === 'on') {
            config.enabled = true;
            await saveAntideleteConfig(config);
            return sock.sendMessage(chatId, { text: `✅ *Antidelete ENABLED*\n\nDeleted messages (text, images, video, audio, docs, voice) will be reported.\n\n*Delpath:* ${config.delpath === 'owner' ? 'Owner inbox' : config.delpath}` }, { quoted: message });
        }

        if (action === 'off') {
            config.enabled = false;
            await saveAntideleteConfig(config);
            return sock.sendMessage(chatId, { text: `❌ *Antidelete DISABLED*` }, { quoted: message });
        }

        if (action === 'delpath') {
            const sub = args[1]?.toLowerCase();
            if (!sub) {
                return sock.sendMessage(chatId, { text: `*Current delpath:* ${config.delpath}\n\nOptions: \`owner\`, \`group\`, or a full JID` }, { quoted: message });
            }
            if (['owner', 'group'].includes(sub) || sub.includes('@')) {
                config.delpath = sub;
                await saveAntideleteConfig(config);
                return sock.sendMessage(chatId, { text: `✅ Delpath set to: *${sub}*` }, { quoted: message });
            }
            return sock.sendMessage(chatId, { text: `❌ Invalid delpath. Use \`owner\`, \`group\`, or a valid JID.` }, { quoted: message });
        }

        return sock.sendMessage(chatId, { text: `❌ Unknown action. Use: \`.antidelete on/off/delpath\`` }, { quoted: message });
    },

    handleMessageRevocation,
    storeMessage,
    loadAntideleteConfig,
    saveAntideleteConfig
};
