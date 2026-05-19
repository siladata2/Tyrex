const axios = require('axios');

module.exports = {
    command: 'playstore',
    aliases: ['app'],
    category: 'search',
    description: 'Search Google Play Store',
    usage: '.playstore <app name>',
    async handler(sock, message, args, context) {
        const { chatId, channelInfo } = context;
        const query = args.join(' ');
        if (!query) return sock.sendMessage(chatId, { text: 'Provide app name.' }, { quoted: message });
        const statusMsg = await sock.sendMessage(chatId, { text: '⏳ Searching Play Store...' }, { quoted: message });
        try {
            const { data } = await axios.get(`https://api.deline.web.id/search/playstore?q=${encodeURIComponent(query)}`, { timeout: 20000 });
            if (!data.status || !data.result.length) throw new Error('No apps found');
            let reply = `📱 *Play Store: "${query}"*\n━━━━━━━━━━━━━━━━━━━\n`;
            data.result.slice(0, 5).forEach((app, i) => {
                reply += `\n${i+1}. *${app.nama}*\n👤 ${app.developer}\n⭐ ${app.rate}\n🔗 ${app.link}\n`;
            });
            await sock.sendMessage(chatId, { text: reply, ...channelInfo }, { quoted: message });
            await sock.sendMessage(chatId, { delete: statusMsg.key });
        } catch (err) {
            await sock.sendMessage(chatId, { text: `❌ ${err.message}` }, { quoted: message });
        }
    }
};
