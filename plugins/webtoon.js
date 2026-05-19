// plugins/webtoon.js
const axios = require('axios');

module.exports = {
  command: 'webtoon',
  aliases: ['wt'],
  category: 'info',
  description: 'Get info about a Webtoon from its URL',
  usage: '.webtoon <webtoon URL>',

  async handler(sock, message, args, context) {
    const { chatId } = context;
    const url = args[0]?.trim();
    if (!url || !url.includes('webtoons.com')) {
      return sock.sendMessage(chatId, { text: '❌ Provide a valid Webtoon URL from webtoons.com' }, { quoted: message });
    }
    try {
      const apiUrl = `https://api.deline.web.id/info/webtoon?url=${encodeURIComponent(url)}`;
      const { data } = await axios.get(apiUrl, { timeout: 15000 });
      if (!data.status) throw new Error(data.error);
      const r = data.result;
      let text = `📖 *${r.title}*\n📂 Genre: ${r.genre}\n✍️ Authors: ${r.authors.join(', ')}\n\n📝 *Description*\n${r.description}\n\n`;
      if (r.stats) {
        text += `👀 Views: ${r.stats.views}\n⭐ Rating: ${r.stats.rating || 'N/A'}\n`;
      }
      text += `\n🔗 [Read on Webtoon](${url})`;
      await sock.sendMessage(chatId, { text }, { quoted: message });
    } catch (err) {
      sock.sendMessage(chatId, { text: `❌ Failed: ${err.message}` }, { quoted: message });
    }
  }
};
