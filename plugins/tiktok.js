// plugins/tiktok.js
const axios = require('axios');

// Helper to download and send
async function downloadAndSend(sock, chatId, message, url, type, caption = '') {
  const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 60000 });
  const buffer = Buffer.from(res.data);
  if (type === 'video') {
    await sock.sendMessage(chatId, { video: buffer, mimetype: 'video/mp4', caption }, { quoted: message });
  } else if (type === 'image') {
    await sock.sendMessage(chatId, { image: buffer, caption }, { quoted: message });
  } else if (type === 'audio') {
    await sock.sendMessage(chatId, { audio: buffer, mimetype: 'audio/mpeg', ptt: true }, { quoted: message });
  } else {
    await sock.sendMessage(chatId, { document: buffer, fileName: 'file', caption }, { quoted: message });
  }
}

// Fallback APIs
const APIS = [
  {
    name: 'DiscardAPI',
    fetch: async (url) => {
      const { data } = await axios.get(`https://discardapi.onrender.com/api/dl/tiktok?apikey=guru&url=${encodeURIComponent(url)}`, { timeout: 45000 });
      if (!data?.status || !data?.result) throw new Error('Invalid response');
      const res = data.result;
      const hd = res.data.find(v => v.type === 'nowatermark_hd');
      const noWm = res.data.find(v => v.type === 'nowatermark');
      const videoUrl = hd?.url || noWm?.url;
      if (!videoUrl) throw new Error('No video found');
      return {
        url: videoUrl,
        title: res.title,
        author: res.author,
        stats: res.stats,
        region: res.region,
        duration: res.duration,
        music: res.music_info,
        quality: hd ? 'HD' : 'SD'
      };
    }
  },
  {
    name: 'Deline API',
    fetch: async (url) => {
      const apiUrl = `https://api.deline.web.id/downloader/tiktok?url=${encodeURIComponent(url)}`;
      const { data } = await axios.get(apiUrl, { timeout: 30000 });
      if (!data.status) throw new Error(data.error || 'No data');
      const r = data.result;
      const dlUrl = r.download || r.nowm || r.url;
      if (!dlUrl) throw new Error('No download link');
      return {
        url: dlUrl,
        title: r.title,
        author: r.author,
        region: r.region,
        duration: r.duration,
        music: r.music_info,
        quality: 'No Watermark'
      };
    }
  }
];

module.exports = {
  command: 'tiktok',
  aliases: ['tt', 'ttdl', 'tiktokdl'],
  category: 'download',
  description: 'Download TikTok video without watermark',
  usage: '.tiktok <TikTok URL>',

  async handler(sock, message, args, context) {
    const { chatId, rawText } = context;
    const url = args[0]?.trim() || rawText.split(' ').slice(1).join(' ').trim();
    if (!url) {
      return sock.sendMessage(chatId, {
        text: '🎵 *TikTok Downloader*\n\nPlease provide a TikTok URL.\nExample: .tiktok https://vm.tiktok.com/XXXX'
      }, { quoted: message });
    }

    await sock.sendMessage(chatId, { react: { text: '🔄', key: message.key } });

    let result = null;
    let lastError = null;
    for (const api of APIS) {
      try {
        result = await api.fetch(url);
        break;
      } catch (err) {
        console.log(`${api.name} failed:`, err.message);
        lastError = err;
      }
    }

    if (!result) {
      return sock.sendMessage(chatId, {
        text: `❌ Failed: ${lastError?.message || 'All APIs failed'}`
      }, { quoted: message });
    }

    const caption = `
🎵 *TikTok Downloader*
━━━━━━━━━━━━━━━━━━━
👤 *User:* ${result.author?.nickname || result.author?.unique_id || 'Unknown'}
🌍 *Region:* ${result.region || 'N/A'}
⏱️ *Duration:* ${result.duration || 'N/A'}
🎧 *Sound:* ${result.music?.title || 'Unknown'}
📝 *Caption:* ${result.title || 'No caption'}
✨ *Quality:* ${result.quality}
━━━━━━━━━━━━━━━━━━━
    `.trim();

    await downloadAndSend(sock, chatId, message, result.url, 'video', caption);
  }
};
