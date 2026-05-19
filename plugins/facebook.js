// plugins/facebook.js
const axios = require('axios');

module.exports = {
  command: 'facebook',
  aliases: ['fb', 'fbdl'],
  category: 'download',
  description: 'Download Facebook videos',
  usage: '.fb <Facebook video link>',

  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message.key.remoteJid;
    const url = args[0]?.trim();

    if (!url) {
      return sock.sendMessage(chatId, { text: '❌ Please provide a Facebook video URL.\nExample: .fb https://www.facebook.com/share/r/1HCEDisvja' }, { quoted: message });
    }

    if (!/facebook\.com|fb\.watch|share\/r/i.test(url)) {
      return sock.sendMessage(chatId, { text: '❌ Invalid Facebook link.' }, { quoted: message });
    }

    await sock.sendMessage(chatId, { react: { text: '🔄', key: message.key } });

    const apis = [
      {
        name: 'JawadTech',
        fetch: async () => {
          const { data } = await axios.get(`https://jawad-tech.vercel.app/downloader?url=${encodeURIComponent(url)}`, { timeout: 15000 });
          if (!data?.status || !data.result.length) throw new Error('No video');
          const video = data.result.find(v => v.quality === 'HD') || data.result[0];
          return { url: video.url, quality: video.quality, title: data.metadata?.title };
        }
      },
      {
        name: 'Deline API',
        fetch: async () => {
          const { data } = await axios.get(`https://api.deline.web.id/downloader/facebook?url=${encodeURIComponent(url)}`, { timeout: 15000 });
          if (!data.status || !data.result?.url) throw new Error('No video');
          return { url: data.result.url, quality: 'SD', title: 'Facebook Video' };
        }
      }
    ];

    let videoData = null;
    let lastError = null;

    for (const api of apis) {
      try {
        videoData = await api.fetch();
        break;
      } catch (err) {
        console.log(`${api.name} failed:`, err.message);
        lastError = err;
      }
    }

    if (!videoData) {
      return sock.sendMessage(chatId, { text: `❌ Failed: ${lastError?.message || 'All APIs failed'}` }, { quoted: message });
    }

    const caption = `📘 *Facebook Downloader*
🎞 Quality: *${videoData.quality || 'Unknown'}*
📝 Title: *${videoData.title || 'Facebook Video'}*

> Downloaded by REDXBOT302`;

    try {
      const res = await axios.get(videoData.url, { responseType: 'arraybuffer', timeout: 60000 });
      await sock.sendMessage(chatId, { video: Buffer.from(res.data), mimetype: 'video/mp4', caption }, { quoted: message });
    } catch (e) {
      sock.sendMessage(chatId, { text: `❌ Download failed: ${e.message}` }, { quoted: message });
    }
  }
};
