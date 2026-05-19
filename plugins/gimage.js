// plugins/gimage.js
const axios = require('axios');
const MAX_IMAGES = 30;

const APIS = [
  {
    name: 'JawadTech',
    url: 'https://jawad-tech.vercel.app/search/gimage?q={query}',
    parser: (data) => data?.status && Array.isArray(data.result) ? data.result : null
  },
  {
    name: 'Maher Zubair',
    url: 'https://api.maher-zubair.tech/search/googleimage?q={query}',
    parser: (data) => data?.status && Array.isArray(data.result) ? data.result : null
  },
  {
    name: 'Siputzx',
    url: 'https://api.siputzx.my.id/api/search/googleimg?q={query}',
    parser: (data) => data?.status && Array.isArray(data.result) ? data.result : null
  },
  {
    name: 'Botcahx',
    url: 'https://api.botcahx.lol/api/search/googleimage?q={query}',
    parser: (data) => data?.status && Array.isArray(data.result) ? data.result : null
  }
];

module.exports = {
  command: 'gimage',
  aliases: ['gimg', 'googleimage'],
  category: 'download',
  description: 'Search and download images',
  usage: '.gimage <search term> [number]',

  async handler(sock, message, args, context) {
    const { chatId, channelInfo } = context;
    if (!args.length) {
      return sock.sendMessage(chatId, {
        text: '🖼️ *Google Image Downloader*\n\nUsage: .gimage <search term> [number]\nExample: .gimage cute cats 10',
        ...channelInfo
      }, { quoted: message });
    }

    let num = 5;
    let query = args.join(' ');
    const last = args[args.length - 1];
    if (!isNaN(last) && args.length > 1) {
      num = parseInt(last);
      query = args.slice(0, -1).join(' ');
    }
    if (num > MAX_IMAGES) num = MAX_IMAGES;

    await sock.sendMessage(chatId, { text: `🔍 Searching for "${query}"...` }, { quoted: message });

    let allResults = null;
    for (const api of APIS) {
      try {
        const url = api.url.replace('{query}', encodeURIComponent(query));
        const { data } = await axios.get(url, { timeout: 15000 });
        const parsed = api.parser(data);
        if (parsed && parsed.length) {
          allResults = parsed;
          break;
        }
      } catch (err) { console.log(`${api.name} failed:`, err.message); }
    }

    if (!allResults || !allResults.length) {
      return sock.sendMessage(chatId, { text: '❌ No images found. Try a different search term.' }, { quoted: message });
    }

    // Remove duplicates
    const seen = new Set();
    const unique = [];
    for (const item of allResults) {
      const url = item.url || item.image || item.thumbnail;
      if (url && !seen.has(url)) {
        seen.add(url);
        unique.push({ url, ...item });
      }
    }

    const toDownload = Math.min(num, unique.length);
    await sock.sendMessage(chatId, { text: `✅ Found ${unique.length} images. Downloading ${toDownload}...` }, { quoted: message });

    for (let i = 0; i < toDownload; i++) {
      const img = unique[i];
      const imageUrl = img.url || img.image || img.thumbnail;
      try {
        const res = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 30000 });
        const buffer = Buffer.from(res.data);
        const caption = `🖼️ *${query}* (${i+1}/${toDownload})`;
        await sock.sendMessage(chatId, { image: buffer, caption }, { quoted: message });
        if (i < toDownload - 1) await new Promise(r => setTimeout(r, 800));
      } catch (err) {
        console.error(`Failed image ${i+1}:`, err.message);
      }
    }
  }
};
