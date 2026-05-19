// plugins/twitter.js
const axios = require('axios');

async function downloadAndSend(sock, chatId, message, url, type, caption = '') {
  const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 60000 });
  const buffer = Buffer.from(res.data);
  if (type === 'video') {
    await sock.sendMessage(chatId, { video: buffer, mimetype: 'video/mp4', caption }, { quoted: message });
  } else if (type === 'image') {
    await sock.sendMessage(chatId, { image: buffer, caption }, { quoted: message });
  } else {
    await sock.sendMessage(chatId, { document: buffer, fileName: 'media', caption }, { quoted: message });
  }
}

module.exports = {
  command: 'twitter',
  aliases: ['xtweet', 'tweetdl', 'twitterdl', 'twdl'],
  category: 'download',
  description: 'Download media (video or image) from X/Twitter post',
  usage: '.twitter <Tweet URL>',

  async handler(sock, message, args, context = {}) {
    const { chatId } = context;
    const url = args[0]?.trim();

    if (!url) {
      return sock.sendMessage(chatId, {
        text: '🐦 *Twitter/X Downloader*\n\nProvide a tweet URL.\nExample: .twitter https://x.com/i/status/123456789'
      }, { quoted: message });
    }

    if (!/twitter\.com|x\.com/.test(url)) {
      return sock.sendMessage(chatId, { text: '❌ Invalid Twitter/X URL.' }, { quoted: message });
    }

    await sock.sendMessage(chatId, { react: { text: '🔄', key: message.key } });

    // -------------------------------
    // 1. Try JawadTech universal downloader
    // -------------------------------
    let mediaInfo = null;

    try {
      const apiUrl = `https://jawad-tech.vercel.app/downloader?url=${encodeURIComponent(url)}`;
      const { data } = await axios.get(apiUrl, { timeout: 15000 });
      if (data.status && Array.isArray(data.result) && data.result.length) {
        // result contains direct URLs
        const urls = data.result;
        mediaInfo = {
          urls: urls,
          type: urls.some(u => u.includes('.mp4')) ? 'video' : 'image',
          metadata: data.metadata
        };
      }
    } catch (e) {
      console.log('JawadTech Twitter failed:', e.message);
    }

    // -------------------------------
    // 2. Fallback: Deline Twitter API
    // -------------------------------
    if (!mediaInfo) {
      try {
        const apiUrl = `https://api.deline.web.id/downloader/twitter?url=${encodeURIComponent(url)}`;
        const { data } = await axios.get(apiUrl, { timeout: 15000 });
        if (data.status && data.data?.downloadLink) {
          mediaInfo = {
            urls: [data.data.downloadLink],
            type: 'video',
            metadata: {
              title: data.data.videoTitle,
              description: data.data.videoDescription
            }
          };
          // If there's also an image, we can add it
          if (data.data.imgUrl) {
            mediaInfo.urls.unshift(data.data.imgUrl);
          }
        }
      } catch (e) {
        console.log('Deline Twitter failed:', e.message);
      }
    }

    // -------------------------------
    // No media found
    // -------------------------------
    if (!mediaInfo) {
      return sock.sendMessage(chatId, {
        text: '❌ No downloadable media found. The tweet may be private or unsupported.'
      }, { quoted: message });
    }

    // -------------------------------
    // Send each media item
    // -------------------------------
    for (let i = 0; i < mediaInfo.urls.length; i++) {
      const mediaUrl = mediaInfo.urls[i];
      const isVideo = mediaInfo.type === 'video' || /\.(mp4|mov|webm|mkv)$/i.test(mediaUrl);
      let caption = '';
      if (i === 0 && mediaInfo.metadata) {
        const meta = mediaInfo.metadata;
        caption = `🐦 *Twitter/X Media*\n📝 *Title:* ${meta.title || 'N/A'}\n${meta.description ? `💬 *Description:* ${meta.description.slice(0, 200)}` : ''}`;
      }

      try {
        if (isVideo) {
          const res = await axios.get(mediaUrl, { responseType: 'arraybuffer', timeout: 60000 });
          await sock.sendMessage(chatId, {
            video: Buffer.from(res.data),
            mimetype: 'video/mp4',
            caption: caption || '📥 *Downloaded by REDXBOT302*'
          }, { quoted: message });
        } else {
          const res = await axios.get(mediaUrl, { responseType: 'arraybuffer', timeout: 30000 });
          await sock.sendMessage(chatId, {
            image: Buffer.from(res.data),
            caption: caption || '📥 *Downloaded by REDXBOT302*'
          }, { quoted: message });
        }
        if (i < mediaInfo.urls.length - 1) await new Promise(r => setTimeout(r, 800));
      } catch (err) {
        console.error(`Failed to download media ${i+1}:`, err.message);
      }
    }
  }
};
