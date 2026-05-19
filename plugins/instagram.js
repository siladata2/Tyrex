// plugins/instagram.js
const axios = require('axios');
const { igdl } = require('ruhend-scraper');

const processedMessages = new Set();

async function isVideoUrl(url) {
  if (/\.(mp4|mov|webm|mkv|avi)$/i.test(url)) return true;
  try {
    const head = await axios.head(url, { timeout: 5000 });
    return head.headers['content-type']?.startsWith('video/') || false;
  } catch {
    return false;
  }
}

module.exports = {
  command: 'instagram',
  aliases: ['ig', 'igdl', 'insta'],
  category: 'download',
  description: 'Download Instagram posts, reels & videos',
  usage: '.ig <instagram link>',

  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message.key.remoteJid;
    const text = args.join(' ') ||
                 message.message?.conversation ||
                 message.message?.extendedTextMessage?.text;

    if (processedMessages.has(message.key.id)) return;
    processedMessages.add(message.key.id);
    setTimeout(() => processedMessages.delete(message.key.id), 5 * 60 * 1000);

    if (!text) {
      return sock.sendMessage(chatId, {
        text: '📸 *Instagram Downloader*\n\nUsage:\n.ig <post | reel | video link>'
      }, { quoted: message });
    }

    if (!/https?:\/\/(www\.)?(instagram\.com|instagr\.am)\/(p|reel|tv)\//i.test(text)) {
      return sock.sendMessage(chatId, { text: '❌ Invalid Instagram link.' }, { quoted: message });
    }

    await sock.sendMessage(chatId, { react: { text: '🔄', key: message.key } });

    let mediaList = [];

    // 1. JawadTech (primary)
    try {
      const { data } = await axios.get(`https://jawad-tech.vercel.app/downloader?url=${encodeURIComponent(text)}`, { timeout: 20000 });
      if (data.status && Array.isArray(data.result) && data.result.length) {
        mediaList = data.result.map(url => ({ url }));
      }
    } catch (e) { console.log('JawadTech failed:', e.message); }

    // 2. ruhend-scraper (fallback)
    if (!mediaList.length) {
      try {
        const res = await igdl(text);
        if (res?.data?.length) {
          mediaList = res.data.filter(m => m?.url).map(m => ({ url: m.url, type: m.type }));
        }
      } catch (e) { console.log('ruhend-scraper failed:', e.message); }
    }

    // 3. Deline IG API (final fallback)
    if (!mediaList.length) {
      try {
        const { data } = await axios.get(`https://api.deline.web.id/downloader/ig?url=${encodeURIComponent(text)}`, { timeout: 20000 });
        if (data.status && data.result?.media) {
          const { images = [], videos = [] } = data.result.media;
          mediaList = [...images, ...videos].map(url => ({ url }));
        }
      } catch (e) { console.log('Deline IG failed:', e.message); }
    }

    if (!mediaList.length) {
      return sock.sendMessage(chatId, { text: '❌ No media found.' }, { quoted: message });
    }

    for (let i = 0; i < mediaList.length; i++) {
      const { url, type } = mediaList[i];
      const isVideo = type === 'video' || await isVideoUrl(url);
      const caption = `📥 *Downloaded by REDXBOT302*${mediaList.length > 1 ? ` (${i+1}/${mediaList.length})` : ''}`;

      try {
        const { data } = await axios.get(url, { responseType: 'arraybuffer', timeout: 60000 });
        const buffer = Buffer.from(data);
        if (isVideo) {
          await sock.sendMessage(chatId, { video: buffer, mimetype: 'video/mp4', caption }, { quoted: message });
        } else {
          await sock.sendMessage(chatId, { image: buffer, caption }, { quoted: message });
        }
        if (i < mediaList.length - 1) await new Promise(r => setTimeout(r, 1000));
      } catch (err) {
        console.error(`Failed media ${i+1}:`, err.message);
      }
    }
  }
};
