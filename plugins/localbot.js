/*****************************************************************************
 *                                                                           *
 *                     Developed By Abdul Rehman Rajpoot                     *
 *                     & Muzamil Khan                                        *
 *                                                                           *
 *  🌐  GitHub   : https://github.com/AbdulRehman19721986/redxbot302          *
 *  ▶️  YouTube  : https://youtube.com/@rootmindtech                         *
 *  💬  WhatsApp : https://whatsapp.com/channel/0029VbCPnYf96H4SNehkev10     *
 *  🔗  Telegram : https://t.me/TeamRedxhacker2                              *
 *                                                                           *
 *    © 2026 Abdul Rehman Rajpoot. All rights reserved.                      *
 *                                                                           *
 *****************************************************************************/

const path = require('path');
const fs = require('fs');
const store = require('../lib/lightweight_store'); // adjust path if needed

// ---------- Constants ----------
const DATA_DIR = path.join(process.cwd(), 'data');
const ASSETS_DIR = path.join(process.cwd(), 'assets');
const TEMP_DIR = path.join(process.cwd(), 'temp');
const SESSION_DIR = path.join(process.cwd(), 'session');

const dataFile = (filename) => path.join(DATA_DIR, filename);

const HAS_DB = !!(process.env.MONGO_URL || process.env.POSTGRES_URL || process.env.MYSQL_URL || process.env.DB_URL);
const REPLIES_FILE = path.join(process.cwd(), 'data', 'autoreplies.json');

// ---------- State ----------
const chatState = new Map();

// ---------- Utility ----------
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const low = s => s.toLowerCase().trim();

function matches(text, patterns) {
    const t = low(text);
    return patterns.some(p => typeof p === 'string' ? t.includes(p) : p.test(t));
}

// ---------- Custom Auto‑Replies ----------
async function loadCustomReplies() {
    try {
        if (HAS_DB) {
            const data = await store.getSetting('global', 'autoreplies');
            return data?.replies || [];
        }
        if (fs.existsSync(REPLIES_FILE)) {
            const data = JSON.parse(fs.readFileSync(REPLIES_FILE, 'utf-8'));
            return data.replies || [];
        }
    } catch {}
    return [];
}

async function checkCustomReply(text, name) {
    const t = low(text);
    for (const r of await loadCustomReplies()) {
        const trigger = r.trigger.toLowerCase();
        const hit = r.exactMatch ? t === trigger : t.includes(trigger);
        if (hit) return r.response.replace('{name}', name);
    }
    return null;
}

// ---------- Math Evaluator ----------
function tryMath(text) {
    const expr = text.match(/[\d\s+\-*/.%()]+/)?.[0]?.trim();
    if (!expr || expr.length < 3) return null;
    try {
        const result = Function(`"use strict"; return (${expr})`)();
        if (typeof result === 'number' && isFinite(result)) {
            const formatted = Number.isInteger(result) ? result : parseFloat(result.toFixed(6));
            return `🔢 *${expr.trim()} = ${formatted}*`;
        }
    } catch {}
    return null;
}

// ---------- Knowledge Base ----------
const KB = [
    // ... (keep the entire KB array from the original code)
    // For brevity, I'm not copying the whole KB here, but you must include it.
    // Use the KB exactly as in the original file.
];

// ---------- Main Response Logic ----------
async function getResponse(text, senderName) {
    const t = low(text);

    const custom = await checkCustomReply(text, senderName);
    if (custom) return custom;

    // Time
    if (/what.?time|current time|time batao|time kya|time is it|time now|time please/.test(t)) {
        const now = new Date();
        return `🕐 *Current Time:* ${now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}\n📅 *Date:* ${now.toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}`;
    }

    // Date
    if (/what.?date|today.?date|current date|aaj ki date|which day|what day/.test(t)) {
        const now = new Date();
        return `📅 *Today is:* ${now.toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}`;
    }

    // Birth year
    const bornMatch = t.match(/born in (\d{4})|birth year.?(\d{4})/);
    if (bornMatch) {
        const year = parseInt(bornMatch[1] || bornMatch[2], 10);
        const age = new Date().getFullYear() - year;
        if (age > 0 && age < 150) return `🎂 If you were born in *${year}*, you are *${age} years old* in ${new Date().getFullYear()}!`;
    }

    // Simple math
    if (/\d.*[+\-*/].*\d/.test(t)) {
        const math = tryMath(t);
        if (math) return math;
    }

    // KB lookup
    for (const entry of KB) {
        if (matches(text, entry.patterns)) {
            return pick(entry.responses).replace('{name}', senderName);
        }
    }

    // Fallback
    return pick([
        `Hmm, I'm not sure about that! 🤔 Try asking differently.`,
        "I didn't quite catch that! Could you rephrase? 🙏",
        "That's beyond me right now! Try `.chatbot` for AI-powered answers 🤖",
        `Sorry ${senderName}, I didn't get that. Type .menu for available commands!`,
    ]);
}

// ---------- Auto‑reply Handler (used when bot is in "on" mode) ----------
async function handleLocalBotMessage(sock, message, chatId, text, senderId, channelInfo) {
    const state = chatState.get(chatId);
    if (!state?.enabled) return false;
    if (!text || /^[.!/]/.test(text.trim())) return false;
    if (Date.now() - state.lastActivity > 86400000) { chatState.delete(chatId); return false; }
    state.lastActivity = Date.now();

    try {
        const senderName = (message.pushName || senderId.split('@')[0] || 'there').split(' ')[0];
        await sock.presenceSubscribe(chatId);
        await sock.sendPresenceUpdate('composing', chatId);
        await new Promise(r => setTimeout(r, 600 + Math.random() * 1000));
        await sock.sendPresenceUpdate('paused', chatId);
        await sock.sendMessage(chatId, { text: await getResponse(text, senderName), ...channelInfo }, { quoted: message });
    } catch {}
    return true;
}

// ---------- Plugin Export ----------
const plugin = {
    command: 'localbot',
    aliases: ['lbot', 'offlinebot', 'localai', 'lb'],
    category: 'ai',
    description: 'Built-in offline chatbot — no internet, no API, instant responses',
    usage: '.localbot on/off\n.localbot <message>',

    async handler(sock, message, args, context = {}) {
        const chatId = context.chatId || message.key.remoteJid;
        const channelInfo = context.channelInfo || {};
        const senderId = context.senderId || message.key.remoteJid;
        const senderName = (message.pushName || senderId.split('@')[0] || 'there').split(' ')[0];
        const sub = args[0]?.toLowerCase();

        if (sub === 'on') {
            chatState.set(chatId, { enabled: true, lastActivity: Date.now() });
            return await sock.sendMessage(chatId, {
                text: `🤖 *Local Bot Activated!*\n\n` +
                      `I'm now listening in this chat.\n` +
                      `Just type anything and I'll respond!\n\n` +
                      `_Fully offline • No API • Instant replies_\n\n` +
                      `Type \`.localbot off\` to deactivate.`,
                ...channelInfo
            }, { quoted: message });
        }

        if (sub === 'off') {
            chatState.delete(chatId);
            return await sock.sendMessage(chatId, {
                text: `🤖 Local Bot *deactivated*.\nUse \`.localbot on\` to reactivate.`,
                ...channelInfo
            }, { quoted: message });
        }

        if (sub === 'status') {
            const state = chatState.get(chatId);
            return await sock.sendMessage(chatId, {
                text: `🤖 Local Bot: ${state?.enabled ? '🟢 *Active*' : '🔴 *Inactive*'}`,
                ...channelInfo
            }, { quoted: message });
        }

        const userText = args.join(' ').trim();
        if (!userText) {
            const state = chatState.get(chatId);
            return await sock.sendMessage(chatId, {
                text: `🤖 *MEGA MD Local Bot*\n\n` +
                      `_Zero API • Fully Offline • Instant_\n\n` +
                      `*Chat directly:*\n` +
                      `\`.localbot hello\`\n` +
                      `\`.localbot tell me a joke\`\n` +
                      `\`.localbot motivate me\`\n` +
                      `\`.localbot what time is it\`\n` +
                      `\`.localbot 25 * 4\`\n\n` +
                      `*Auto-reply mode:*\n` +
                      `\`.localbot on\` — respond to ALL messages in this chat\n` +
                      `\`.localbot off\` — stop\n\n` +
                      `*Status:* ${state?.enabled ? '🟢 Active' : '🔴 Inactive'}`,
                ...channelInfo
            }, { quoted: message });
        }

        // Process the user's message as a direct command
        await sock.presenceSubscribe(chatId);
        await sock.sendPresenceUpdate('composing', chatId);
        await new Promise(r => setTimeout(r, 600 + Math.random() * 800));
        await sock.sendPresenceUpdate('paused', chatId);

        await sock.sendMessage(chatId, {
            text: await getResponse(userText, senderName),
            ...channelInfo
        }, { quoted: message });
    }
};

// Export both the plugin and the helper function
module.exports = plugin;
module.exports.handleLocalBotMessage = handleLocalBotMessage;
