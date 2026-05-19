const axios = require('axios');

module.exports = {
    command: 'jobstreet',
    aliases: ['jobs'],
    category: 'search',
    description: 'Search jobs on JobStreet',
    usage: '.jobstreet <job title> [city]',
    async handler(sock, message, args, context) {
        const { chatId, channelInfo } = context;
        let city = 'Jakarta';
        let query = args.join(' ');
        if (args.length > 1 && args[args.length-1].match(/^[A-Z]/)) {
            city = args.pop();
            query = args.join(' ');
        }
        if (!query) return sock.sendMessage(chatId, { text: 'Provide job title.' }, { quoted: message });
        const statusMsg = await sock.sendMessage(chatId, { text: '⏳ Searching jobs...' }, { quoted: message });
        try {
            const { data } = await axios.get(`https://api.deline.web.id/search/jobstreet?q=${encodeURIComponent(query)}&city=${encodeURIComponent(city)}`, { timeout: 20000 });
            if (!data.status || !data.result.length) throw new Error('No jobs found');
            let reply = `💼 *JobStreet: ${query} in ${city}*\n━━━━━━━━━━━━━━━━━━━\n`;
            data.result.slice(0, 5).forEach((job, i) => {
                reply += `\n${i+1}. *${job.judul}*\n🏢 ${job.perusahaan}\n📍 ${job.lokasi}\n💰 ${job.gaji}\n🔗 ${job.link}\n`;
            });
            await sock.sendMessage(chatId, { text: reply, ...channelInfo }, { quoted: message });
            await sock.sendMessage(chatId, { delete: statusMsg.key });
        } catch (err) {
            await sock.sendMessage(chatId, { text: `❌ ${err.message}` }, { quoted: message });
        }
    }
};
