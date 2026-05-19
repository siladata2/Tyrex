// commands/tt2.js
const axios = require('axios');

module.exports = {
  command: 'tt2',
  aliases: ['tiktoksearchdl', 'ttsearchdl'],
  category: 'download',
  description: 'Search TikTok videos by keyword and download the top result (no watermark)',
  usage: '.tt2 <search query>',

  async handler(sock, message, args, context) {
    const { chatId, channelInfo } = context;
    const query = args.join(' ').trim();

    if (!query) {
      return sock.sendMessage(chatId, {
        text: '🔍 *TikTok Search & Download*\n\nEnter a search term.\nExample: `.tt2 funny cats`',
        ...channelInfo
      }, { quoted: message });
    }

    const statusMsg = await sock.sendMessage(chatId, {
      text: `⏳ Searching TikTok for "${query}"...`,
      ...channelInfo
    }, { quoted: message });

    try {
      // 1. Search for videos
      const searchUrl = `https://api.deline.web.id/search/tiktok?query=${encodeURIComponent(query)}`;
      const searchRes = await axios.get(searchUrl, { timeout: 15000 });
      if (!searchRes.data.status || !searchRes.data.result) {
        throw new Error(searchRes.data.error || 'No videos found');
      }

      const videoInfo = searchRes.data.result;

      // 2. Build proper TikTok URL from author and video_id
      if (!videoInfo.author || !videoInfo.video_id) {
        throw new Error('Missing author or video_id in search result');
      }
      const tiktokUrl = `https://www.tiktok.com/@${videoInfo.author}/video/${videoInfo.video_id}`;

      await sock.sendMessage(chatId, {
        text: `✅ Found: *${videoInfo.title || 'Untitled'}*\n⏳ Downloading video...`,
        ...channelInfo
      }, { quoted: message });

      // 3. Download the video (no watermark) using the constructed URL
      const downloadUrl = `https://api.deline.web.id/downloader/tiktok?url=${encodeURIComponent(tiktokUrl)}`;
      const downloadRes = await axios.get(downloadUrl, {
        timeout: 30000,
        responseType: 'arraybuffer'
      });

      if (!downloadRes.data) throw new Error('Failed to download video');

      const videoBuffer = Buffer.from(downloadRes.data);
      const contentType = downloadRes.headers['content-type'];
      if (!contentType || !contentType.startsWith('video/')) {
        // Maybe the API returned JSON with an error
        let errorMsg = 'API did not return a valid video';
        try {
          const text = downloadRes.data.toString();
          const json = JSON.parse(text);
          errorMsg = json.message || json.error || errorMsg;
        } catch (e) {}
        throw new Error(errorMsg);
      }

      // 4. Prepare caption with metadata
      const caption = `
🎵 *TikTok Search: "${query}"*
━━━━━━━━━━━━━━━━━━━
📝 *Title:* ${videoInfo.title || 'No title'}
👤 *Author:* ${videoInfo.author || 'Unknown'} (@${videoInfo.nickname || ''})
🌍 *Region:* ${videoInfo.region || 'N/A'}
🎧 *Music:* ${videoInfo.music_info?.title || 'Unknown'}

📥 *Downloaded via Deline API*
━━━━━━━━━━━━━━━━━━━
      `.trim();

      // 5. Send video
      await sock.sendMessage(chatId, {
        video: videoBuffer,
        mimetype: 'video/mp4',
        caption,
        ...channelInfo
      }, { quoted: message });

      await sock.sendMessage(chatId, { delete: statusMsg.key });

    } catch (error) {
      console.error('[TT2]', error.message);
      await sock.sendMessage(chatId, {
        text: `❌ Failed: ${error.message}`,
        ...channelInfo
      }, { quoted: message });
    }
  }
};
