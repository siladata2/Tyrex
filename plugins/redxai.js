/*****************************************************************************
 *                         REDXBOT302 v7.0 ULTRA                             *
 *            REDX AI — Multi-Model Smart AI with Context Memory             *
 *****************************************************************************/
'use strict';
const axios = require('axios');
const fs    = require('fs');
const path  = require('path');

const SAQIB = 'https://apisaqib.vercel.app/api/v1';
const MEM   = path.join(process.cwd(), 'data', 'redxai_memory.json');

const APIS = [
    (q) => `${SAQIB}/1027?text=${encodeURIComponent(q)}`,
    (q) => `${SAQIB}/1026?query=${encodeURIComponent(q)}`,
    (q) => `${SAQIB}/1024?q=${encodeURIComponent(q)}`,
    (q) => `${SAQIB}/1023?q=${encodeURIComponent(q)}`,
    (q) => `${SAQIB}/1018?prompt=${encodeURIComponent(q)}`,
    (q) => `https://api.giftedtech.my.id/api/ai/geminiaipro?apikey=gifted&q=${encodeURIComponent(q)}`,
];

function loadMemory() {
    try { return JSON.parse(fs.readFileSync(MEM, 'utf8')); } catch { return {}; }
}
function saveMemory(data) {
    const dir = path.dirname(MEM);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(MEM, JSON.stringify(data, null, 2));
}

async function askAI(question) {
    for (const fn of APIS) {
        try {
            const { data } = await axios.get(fn(question), { timeout: 12000 });
            const ans = data?.result?.answer || data?.result || data?.answer || data?.response ||
                        data?.reply || data?.message || data?.data?.reply || data?.data?.result;
            if (ans && typeof ans === 'string' && ans.trim().length > 2) return ans.trim();
        } catch { /* next */ }
    }
    return null;
}

const SYSTEM_PROMPT = `You are REDXBOT302, an advanced AI assistant created by Abdul Rehman Rajpoot. 
You are helpful, smart, and speak in the user's language. 
You represent the brand redxbot302. Always be professional and helpful.`;

module.exports = {
    command: 'redxai',
    aliases: ['rxai', 'botai', 'smartai'],
    category: 'AI',
    description: '🧠 REDXBOT302 Smart AI with memory & context',
    usage: '.redxai <question>\n.redxai clear — clear memory',

    async handler(sock, message, args, context = {}) {
        const chatId = context.chatId || message.key.remoteJid;
        const sender = (message.key.participant || message.key.remoteJid);
        const sub    = args[0]?.toLowerCase();

        if (sub === 'clear') {
            const mem = loadMemory();
            delete mem[sender];
            saveMemory(mem);
            return sock.sendMessage(chatId, { text: '🧠 Memory cleared!' }, { quoted: message });
        }

        const query = args.join(' ').trim();
        if (!query) return sock.sendMessage(chatId, {
            text: `🧠 *REDXBOT302 Smart AI*\n\nUsage: \`.redxai <question>\`\n\nFeatures:\n• Remembers context from last 5 messages\n• Speaks all languages\n• Smart, fast responses\n\n\`.redxai clear\` — reset memory`
        }, { quoted: message });

        await sock.sendMessage(chatId, { react: { text: '🧠', key: message.key } });

        // Load memory
        const mem = loadMemory();
        if (!mem[sender]) mem[sender] = [];
        const history = mem[sender].slice(-5);

        // Build context prompt
        let contextPrompt = SYSTEM_PROMPT + '\n\nPrevious conversation:\n';
        history.forEach(h => { contextPrompt += `User: ${h.q}\nAssistant: ${h.a}\n`; });
        contextPrompt += `\nUser: ${query}\nAssistant:`;

        const answer = await askAI(contextPrompt);

        if (!answer) {
            await sock.sendMessage(chatId, { react: { text: '❌', key: message.key } });
            return sock.sendMessage(chatId, { text: '❌ AI unavailable right now.' }, { quoted: message });
        }

        // Save to memory
        mem[sender].push({ q: query, a: answer, ts: Date.now() });
        if (mem[sender].length > 10) mem[sender] = mem[sender].slice(-10);
        saveMemory(mem);

        await sock.sendMessage(chatId, {
            text: `🧠 *REDXBOT302 AI*\n\n${answer}`
        }, { quoted: message });

        await sock.sendMessage(chatId, { react: { text: '✅', key: message.key } });
    }
};
