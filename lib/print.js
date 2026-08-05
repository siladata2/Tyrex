/*****************************************************************************
 *  lib/print.js — REDXBOT302 v7.1 FIXED
 *  FIX: Replaced chalk (broken by supports-color@9 ESM dedup) and
 *       awesome-phonenumber (pure ESM v5) with zero-dep alternatives.
 *       Uses inline ANSI codes + libphonenumber-js (CJS-safe, in deps).
 *****************************************************************************/
'use strict';

const settings = require('../settings');

/* ── Inline ANSI color helpers (no external dep, no ESM issues) ──────────── */
const A = {
    reset:   '\x1b[0m',
    bold:    '\x1b[1m',
    gray:    '\x1b[90m',
    red:     '\x1b[31m',
    green:   '\x1b[32m',
    yellow:  '\x1b[33m',
    blue:    '\x1b[34m',
    magenta: '\x1b[35m',
    cyan:    '\x1b[36m',
    white:   '\x1b[37m',
    bgCyan:  '\x1b[46m\x1b[30m',
    brightGreen:  '\x1b[92m',
    brightBlue:   '\x1b[94m',
    hex_00D9FF: '\x1b[96m',   // bright cyan ≈ #00D9FF
    hex_FFD700: '\x1b[93m',   // bright yellow ≈ #FFD700
};
const c = (code, str) => `${code}${str}${A.reset}`;

/* ── Phone number formatter (libphonenumber-js is CJS-safe) ─────────────── */
let _parsePhone = null;
function getPhoneFormatter() {
    if (_parsePhone) return _parsePhone;
    try {
        const { parsePhoneNumberFromString } = require('libphonenumber-js');
        _parsePhone = parsePhoneNumberFromString;
    } catch (_) {
        _parsePhone = () => null;   // graceful fallback
    }
    return _parsePhone;
}

/* ── Extract phone number from JID ─────────────────────────────────────── */
function extractPhoneNumber(jid) {
    if (!jid) return null;
    let number = jid
        .replace('@s.whatsapp.net', '')
        .replace('@lid', '')
        .replace('@g.us', '')
        .split(':')[0];
    if (number.length < 10 && jid.includes('@lid')) return null;
    return number;
}

/* ── Name with fallback ─────────────────────────────────────────────────── */
async function getNameWithFallback(jid, sock, pushName) {
    try {
        if (pushName && pushName.trim()) return pushName.trim();
        if (sock.store?.contacts?.[jid]) {
            const contact = sock.store.contacts[jid];
            if (contact.name || contact.notify) return contact.name || contact.notify;
        }
        const phone = extractPhoneNumber(jid);
        if (phone && phone.length >= 10) {
            const parse = getPhoneFormatter();
            const pn = parse('+' + phone);
            if (pn && pn.isValid()) return null;
        }
        return jid.split('@')[0].split(':')[0];
    } catch (_) {
        return jid.split('@')[0].split(':')[0];
    }
}

/* ── Main message logger ──────────────────────────────────────────────────── */
async function printMessage(message, sock) {
    try {
        if (!message?.key) return;
        const m = message;
        const chatId   = m.key.remoteJid;
        const senderId = m.key.participant || m.key.remoteJid;
        const isGroup  = chatId.endsWith('@g.us');
        const fromMe   = m.key.fromMe;

        let senderName = '', senderPhone = '';
        try {
            if (fromMe) {
                senderName = sock.user?.name || 'Bot';
                const botNumber = extractPhoneNumber(sock.user?.id || sock.user?.jid);
                if (botNumber) {
                    const parse = getPhoneFormatter();
                    const pn = parse('+' + botNumber);
                    senderPhone = (pn && pn.isValid()) ? pn.formatInternational() : botNumber;
                }
            } else {
                senderName = await getNameWithFallback(senderId, sock, m.pushName);
                const phone = extractPhoneNumber(senderId);
                if (phone && phone.length >= 10) {
                    const parse = getPhoneFormatter();
                    const pn = parse('+' + phone);
                    senderPhone = (pn && pn.isValid()) ? pn.formatInternational() : phone;
                } else {
                    senderPhone = senderId.split('@')[0].split(':')[0];
                }
            }
        } catch (_) {
            senderName  = m.pushName || senderId.split('@')[0];
            senderPhone = senderId.split('@')[0].split(':')[0];
        }

        let chatName = null;
        try {
            if (isGroup) {
                const metadata = await sock.groupMetadata(chatId).catch(() => null);
                chatName = metadata?.subject || null;
            }
        } catch (_) {}

        const messageType = Object.keys(m.message || {})[0];
        let messageText = '', fileSize = 0, shouldSkipLog = false;

        if (['senderKeyDistributionMessage','protocolMessage','reactionMessage'].includes(messageType)) {
            shouldSkipLog = true;
        }
        if (shouldSkipLog) return;

        const labelMap = {
            conversation: 'TEXT', extendedTextMessage: 'TEXT',
            imageMessage: 'IMAGE', videoMessage: 'VIDEO', audioMessage: 'AUDIO',
            documentMessage: 'DOCUMENT', stickerMessage: 'STICKER',
            contactMessage: 'CONTACT', locationMessage: 'LOCATION',
        };

        if (m.message) {
            if (messageType === 'conversation')          messageText = m.message.conversation;
            else if (messageType === 'extendedTextMessage') messageText = m.message.extendedTextMessage?.text || '';
            else if (messageType === 'imageMessage')     { messageText = m.message.imageMessage?.caption || '[Image]'; fileSize = m.message.imageMessage?.fileLength || 0; }
            else if (messageType === 'videoMessage')     { messageText = m.message.videoMessage?.caption || '[Video]'; fileSize = m.message.videoMessage?.fileLength || 0; }
            else if (messageType === 'audioMessage')     { const d = m.message.audioMessage?.seconds || 0; messageText = `[Audio ${Math.floor(d/60)}:${(d%60).toString().padStart(2,'0')}]`; fileSize = m.message.audioMessage?.fileLength || 0; }
            else if (messageType === 'documentMessage')  { messageText = `[📄 ${m.message.documentMessage?.fileName || 'Document'}]`; fileSize = m.message.documentMessage?.fileLength || 0; }
            else if (messageType === 'stickerMessage')   { messageText = '[Sticker]'; fileSize = m.message.stickerMessage?.fileLength || 0; }
            else if (messageType === 'contactMessage')   messageText = `[👤 ${m.message.contactMessage?.displayName || 'Contact'}]`;
            else if (messageType === 'locationMessage')  messageText = '[📍 Location]';
            else messageText = `[${messageType.replace('Message','')}]`;
        }

        let fileSizeStr = '';
        if (fileSize > 0) {
            const units = ['B','KB','MB','GB'];
            const i = Math.floor(Math.log(fileSize) / Math.log(1024));
            fileSizeStr = ` (${(fileSize / Math.pow(1024, i)).toFixed(1)} ${units[i]})`;
        }

        const timestamp = m.messageTimestamp
            ? new Date((m.messageTimestamp.low || m.messageTimestamp) * 1000)
            : new Date();
        const timeStr = timestamp.toLocaleTimeString('en-US', {
            hour: '2-digit', minute: '2-digit', second: '2-digit',
            hour12: false, timeZone: settings.timeZone || 'Asia/Karachi',
        });

        const isCommand = /^[.!#\/]/.test(messageText);
        const displayType = labelMap[messageType] || messageType.replace('Message','').toUpperCase();

        console.log(c(A.hex_00D9FF + A.bold, '╭─────────────────────────────────'));
        console.log(
            c(A.hex_00D9FF, '│') + ' ' +
            c(A.cyan, '🤖 Bot') + ' ' +
            c(A.bgCyan, ` ${timeStr} `) + ' ' +
            c(A.magenta, displayType) +
            c(A.gray, fileSizeStr)
        );

        const senderDisplay = senderName && senderName !== senderPhone
            ? `${senderName} (${senderPhone})` : senderPhone;
        console.log(
            c(A.hex_00D9FF,'│') + ' ' +
            (fromMe ? c(A.green,'📤 ME') : c(A.yellow,'📨 FROM')) + ' ' +
            c(A.white, senderDisplay)
        );

        if (isGroup && chatName) {
            console.log(c(A.hex_00D9FF,'│') + ' ' + c(A.blue,'👥 GROUP') + ' ' + c(A.white, chatName));
        } else if (!isGroup) {
            console.log(c(A.hex_00D9FF,'│') + ' ' + c(A.magenta,'💬 PRIVATE') + ' ' + c(A.white,'Private Chat'));
        }

        if (messageText) {
            const displayText = messageText.length > 100 ? messageText.substring(0,100) + '...' : messageText;
            console.log(
                c(A.hex_00D9FF,'│') + ' ' +
                c(A.hex_FFD700,'💭 MSG') + ' ' +
                (isCommand ? c(A.brightGreen, displayText) : fromMe ? c(A.brightBlue, displayText) : c(A.white, displayText))
            );
        }

        console.log(c(A.hex_00D9FF + A.bold, '╰─────────────────────────────────'));
        console.log('');
    } catch (error) {
        console.log(c(A.red, '❌ Error logging message:'), error.message);
        console.log(c(A.gray, `[${message.key?.fromMe ? 'ME' : 'MSG'}] ${message.key?.remoteJid}`));
    }
}

/* ── Event logger ───────────────────────────────────────────────────────── */
function printLog(type, message) {
    const timestamp = new Date().toLocaleTimeString('en-US', {
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hour12: false, timeZone: settings.timeZone || 'Asia/Karachi',
    });
    const map = {
        info:       { col: A.blue,    icon: 'ℹ️'  },
        success:    { col: A.green,   icon: '✅'  },
        warning:    { col: A.yellow,  icon: '⚠️'  },
        warn:       { col: A.yellow,  icon: '⚠️'  },
        error:      { col: A.red,     icon: '❌'  },
        connection: { col: A.cyan,    icon: '🔌'  },
        store:      { col: A.magenta, icon: '🗄️'  },
    };
    const { col, icon } = map[type] || { col: A.white, icon: '•' };
    console.log(c(A.gray, `[${timestamp}]`) + ' ' + c(col, `${icon} ${message}`));
}

module.exports = { printMessage, printLog };
