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
 *****************************************************************************/

const axios = require('axios');

module.exports = {
    command: 'siminfo',
    aliases: ['phoneinfo', 'numinfo', 'carrier', 'phinfo', 'sim', 'simdb', 'simdata'],
    category: 'utility',
    description: 'Get SIM card owner information for any Pakistani number',
    usage: '.siminfo <phone number>\nExample: .siminfo 3001234567 or .siminfo +923001234567',

    async handler(sock, message, args, context) {
        const { chatId, channelInfo } = context;
        const input = args.join('').trim().replace(/\s+/g, '');

        // ─── No input: show help ──────────────────────────────────────────────
        if (!input) {
            return await sock.sendMessage(chatId, {
                text: `🎀 *━━━━━━━ SIM DATABASE ━━━━━━━* 🎀\n\n` +
                      `┏━━━━━━━━━━━━━━━━━━━━┓\n` +
                      `┃  📱 SIM INFO TOOL   ┃\n` +
                      `┗━━━━━━━━━━━━━━━━━━━━┛\n\n` +
                      `✨ *Usage:* .siminfo 3xxxxxxxxx\n\n` +
                      `📌 *Examples:*\n` +
                      `• \`.siminfo 3001234567\`\n` +
                      `• \`.siminfo +923001234567\`\n` +
                      `• \`.siminfo 03001234567\`\n\n` +
                      `🌸 *Features:*\n` +
                      `├─👉 Owner Details\n` +
                      `├─👉 CNIC Info\n` +
                      `├─👉 Address\n` +
                      `└─👉 Network Provider\n\n` +
                      `🎀 *BY: ABDUL REHMAN RAJPOOT* 🎀`,
                ...channelInfo
            }, { quoted: message });
        }

        // ─── Clean / validate number ──────────────────────────────────────────
        let cleanNumber = input
            .replace(/^\+92/, '')   // remove +92
            .replace(/^92/, '')     // remove 92
            .replace(/^0/, '');     // remove leading 0

        if (!/^\d+$/.test(cleanNumber) || cleanNumber.length < 10) {
            return await sock.sendMessage(chatId, {
                text: `❌ *INVALID NUMBER!*\n\nPlease enter a valid Pakistani number.\nExample: *3001234567*`,
                ...channelInfo
            }, { quoted: message });
        }

        // ─── Loading message ──────────────────────────────────────────────────
        const loadingMsg = await sock.sendMessage(chatId, {
            text: `🔍 *SEARCHING DATABASE* 🔍\n\n` +
                  `┏━━━━━━━━━━━━━━━━━━━━┓\n` +
                  `┃ 📡 Checking: +92${cleanNumber}\n` +
                  `┃ ⏳ Please wait...\n` +
                  `┗━━━━━━━━━━━━━━━━━━━━┛`
        }, { quoted: message });

        // ─── API call ─────────────────────────────────────────────────────────
        let response;
        try {
            const { data } = await axios.get(
                `https://sim-info-api.wasif-ali.workers.dev/?search=${cleanNumber}`,
                { timeout: 10000 }
            );
            response = data;
        } catch (err) {
            await sock.sendMessage(chatId, { delete: loadingMsg.key });
            return await sock.sendMessage(chatId, {
                text: `⚠️ *API ERROR*\n\n❌ ${err.message || 'Connection failed'}\n\n🔄 Try again later.`,
                ...channelInfo
            }, { quoted: message });
        }

        // ─── Delete loading message ───────────────────────────────────────────
        await sock.sendMessage(chatId, { delete: loadingMsg.key });

        // ─── No records found ─────────────────────────────────────────────────
        if (!response || !response.success || !response.records || response.records.length === 0) {
            return await sock.sendMessage(chatId, {
                text: `📭 *NO DATA FOUND*\n\n🔍 Number: +92${cleanNumber}\n\n💔 No records available in database.`,
                ...channelInfo
            }, { quoted: message });
        }

        // ─── Build result text ────────────────────────────────────────────────
        let resultText = `🎀 *━━━━━━━ SIM CARD DATA ━━━━━━━* 🎀\n\n`;
        resultText += `📱 *NUMBER:* +92${cleanNumber}\n`;
        resultText += `📊 *TOTAL:* ${response.records.length} Record(s)\n`;
        resultText += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

        for (let i = 0; i < response.records.length; i++) {
            const record = response.records[i];

            resultText += `┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓\n`;
            resultText += `┃  📇 RECORD ${i + 1} - CARD DATA  ┃\n`;
            resultText += `┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛\n\n`;

            resultText += `┌────────────────────────────────┐\n`;
            resultText += `│ 👤 *NAME*                        │\n`;
            resultText += `│ ${(record.name || 'N/A').padEnd(32)}│\n`;
            resultText += `├────────────────────────────────┤\n`;
            resultText += `│ 🆔 *CNIC*                        │\n`;
            resultText += `│ ${(record.cnic || 'N/A').padEnd(32)}│\n`;
            resultText += `├────────────────────────────────┤\n`;
            resultText += `│ 📞 *SIM NUMBER*                  │\n`;
            resultText += `│ ${(record.mobile || cleanNumber).padEnd(32)}│\n`;
            resultText += `├────────────────────────────────┤\n`;
            resultText += `│ 🏠 *ADDRESS*                     │\n`;
            resultText += `│ ${(record.address || 'N/A').padEnd(32)}│\n`;
            resultText += `├────────────────────────────────┤\n`;
            resultText += `│ 📡 *NETWORK*                     │\n`;
            resultText += `│ ${(record.network || 'Unknown').padEnd(32)}│\n`;
            resultText += `└────────────────────────────────┘\n`;

            if (i < response.records.length - 1) {
                resultText += `\n🌸 *━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━* 🌸\n\n`;
            }
        }

        // ─── Credit block ─────────────────────────────────────────────────────
        resultText += `\n┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓\n`;
        resultText += `┃ 💝 *CREDIT & SUPPORT* 💝       ┃\n`;
        resultText += `┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛\n\n`;

        resultText += `┌────────────────────────────────┐\n`;
        resultText += `│ 👨‍💻 *DEVELOPER*                  │\n`;
        resultText += `│ ✨ ABDUL REHMAN RAJPOOT ✨      │\n`;
        resultText += `├────────────────────────────────┤\n`;
        resultText += `│ 🌐 *GITHUB*                     │\n`;
        resultText += `│ github.com/AbdulRehman19721986  │\n`;
        resultText += `├────────────────────────────────┤\n`;
        resultText += `│ 📢 *WHATSAPP CHANNEL*           │\n`;
        resultText += `│ whatsapp.com/channel/           │\n`;
        resultText += `│ 0029VbCPnYf96H4SNehkev10       │\n`;
        resultText += `├────────────────────────────────┤\n`;
        resultText += `│ 📱 *TELEGRAM*                   │\n`;
        resultText += `│ @TeamRedxhacker2               │\n`;
        resultText += `└────────────────────────────────┘\n\n`;

        resultText += `🎀 *━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━* 🎀\n`;
        resultText += `   ⚡ *POWERED BY ABDUL REHMAN RAJPOOT* ⚡\n`;
        resultText += `🎀 *━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━* 🎀\n\n`;
        resultText += `✨ *FOR EDUCATION PURPOSE ONLY* ✨`;

        // ─── Send result ──────────────────────────────────────────────────────
        await sock.sendMessage(chatId, {
            text: resultText,
            ...channelInfo
        }, { quoted: message });
    }
};
