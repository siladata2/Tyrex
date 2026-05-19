// plugins/news2.js
const axios = require('axios');

function formatNews(data, source) {
  let text = `📰 *${source} News* ──────────\n\n`;
  data.slice(0, 5).forEach((item, i) => {
    text += `${i+1}. *${item.title}*\n   🔗 ${item.link}\n\n`;
  });
  return text;
}

module.exports = [
  {
    command: 'antara',
    aliases: ['newsid2'],
    category: 'news2',
    description: 'Latest news from Antara (Indonesia)',
    usage: '.antara',

    async handler(sock, message, args, context) {
      const { chatId } = context;
      try {
        const { data } = await axios.get('https://api.deline.web.id/berita/antara', { timeout: 10000 });
        if (!data.status) throw new Error('No news');
        const text = formatNews(data.data, 'ANTARA');
        await sock.sendMessage(chatId, { text }, { quoted: message });
      } catch (err) {
        sock.sendMessage(chatId, { text: `❌ Failed to fetch news: ${err.message}` }, { quoted: message });
      }
    }
  },
  {
    command: 'cnbc',
    aliases: ['cnbcnews'],
    category: 'news',
    description: 'Latest news from CNBC Indonesia',
    usage: '.cnbc',

    async handler(sock, message, args, context) {
      const { chatId } = context;
      try {
        const { data } = await axios.get('https://api.deline.web.id/berita/cnbc', { timeout: 10000 });
        if (!data.status) throw new Error('No news');
        const text = formatNews(data.data, 'CNBC Indonesia');
        await sock.sendMessage(chatId, { text }, { quoted: message });
      } catch (err) {
        sock.sendMessage(chatId, { text: `❌ Failed to fetch news: ${err.message}` }, { quoted: message });
      }
    }
  }
];
