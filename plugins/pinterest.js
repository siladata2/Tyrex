/*****************************************************************************
 *                     Developed By Abdul Rehman Rajpoot                     *
 *                     & Muzamil Khan                                        *
 *****************************************************************************/

const axios = require('axios');

module.exports = {
  command: 'pinterest',
  aliases: ['pin', 'pindl'],
  category: 'download',
  description: 'Download Pinterest images and videos',
  usage: '.pin <Pinterest link>',

  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message.key.remoteJid;
    const url = args[0]?.trim();

    if (!url) {
      return await sock.sendMessage(chatId, {
        text: '❌ Please provide a Pinterest URL.\nExample: .pin https://pin.it/3xxGZnDEU'
      }, { quoted: message });
    }

    if (!/pinterest\.com|pin\.it/i.test(url)) {
      return await sock.sendMessage(chatId, {
        text: '❌ Invalid Pinterest link. Please send a valid Pinterest URL.'
      }, { quoted: message });
    }

    try {
      await sock.sendMessage(chatId, { react: { text: '🔄', key: message.key } });

      // JawadTech Pinterest API
      const apiUrl = `https://jawad-tech.vercel.app/download/pinterest?url=${encodeURIComponent(url)}`;
      console.log(`Requesting: ${apiUrl}`);
      const { data } = await axios.get(apiUrl, { timeout: 15000 });

      if (!data?.status || !data?.result?.url) {
        throw new Error('No media found. The link may be private or unsupported.');
      }

      const mediaUrl = data.result.url;
      const mediaType = data.result.type || (mediaUrl.match(/\.(mp4|mov|webm)$/i) ? 'video' : 'image');
      const title = data.result.title || 'Pinterest Media';

      const caption = `📌 *Pinterest Downloader*
📊 Type: *${mediaType === 'video' ? 'Video' : 'Image'}*
📝 Title: *${title.substring(0, 100)}*

> Downloaded by REDXBOT302`;

      // Download the media to buffer
      const mediaResponse = await axios.get(mediaUrl, {
        responseType: 'arraybuffer',
        timeout: 60000
      });
      const mediaBuffer = Buffer.from(mediaResponse.data);

      if (mediaType === 'video') {
        await sock.sendMessage(chatId, {
          video: mediaBuffer,
          mimetype: 'video/mp4',
          caption
        }, { quoted: message });
      } else {
        await sock.sendMessage(chatId, {
          image: mediaBuffer,
          caption
        }, { quoted: message });
      }

    } catch (error) {
      console.error('Pinterest download error:', error);
      await sock.sendMessage(chatId, {
        text: `❌ *Error:* ${error.message}\n\nPlease try another link.`
      }, { quoted: message });
    }
  }
};
