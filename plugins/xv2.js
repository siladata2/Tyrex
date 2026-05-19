/*****************************************************************************
 *                     Developed By Abdul Rehman Rajpoot                     *
 *    © 2026 Abdul Rehman Rajpoot. All rights reserved.                      *
 *****************************************************************************/

const axios = require('axios');

const SEARCH_API   = 'https://api.deline.web.id/search/xvideos?q=';
const DOWNLOAD_API = 'https://api.deline.web.id/downloader/xvideos?url=';
const sessions = new Map();

function getBestVideoUrl(videos) {
  if (!videos) return null;
  return videos.high || videos.low || videos.HLS || null;
}

const delay = ms => new Promise(r => setTimeout(r, ms));

module.exports = {
  command: 'xv2',
  aliases: ['xv2dl', 'xv2search'],
  category: 'downloader',
  description: 'Search & browse XVideos with thumbnails (all users)',
  usage: '.xv2 <search query>',
  ownerOnly: false,

  async handler(sock, message, args, context = {}) {
    const chatId   = context.chatId || message.key.remoteJid;
    const channelInfo = context.channelInfo || {};
    const senderId = context.senderId || message.key.participant || message.key.remoteJid;

    const query = args.join(' ').trim();
    if (!query) {
      return sock.sendMessage(chatId, {
        text: `🎬 *XV2 Video Downloader*\n\n*Usage:* \`.xv2 <search term>\`\n\n*Navigation:*\n• Type a number (1-9) to jump\n• Type \`next\` or \`prev\` to browse\n• Type \`download\` to get current video`,
        ...channelInfo
      }, { quoted: message });
    }

    await sock.sendMessage(chatId, { react: { text: '⏳', key: message.key } });

    try {
      const { data: searchData } = await axios.get(`${SEARCH_API}${encodeURIComponent(query)}`, { timeout: 15000 });

      if (!searchData?.status) throw new Error(searchData?.message || 'Search failed');
      const items = searchData.result?.items;
      if (!items || !Array.isArray(items) || !items.length) {
        return sock.sendMessage(chatId, { text: '❌ No results found.', ...channelInfo }, { quoted: message });
      }

      const results = items.slice(0, 9);
      let currentIndex = 0;

      const firstResult = results[0];
      if (firstResult.cover) {
        await sock.sendMessage(chatId, { image: { url: firstResult.cover }, caption: `*Result 1/${results.length}*`, ...channelInfo });
      }

      const buildDetails = (idx) => {
        const r = results[idx];
        return `*${idx+1}/${results.length}* – *${r.title || 'Untitled'}*\n\n📺 ${r.resolution||'?'}\n⏱️ ${r.duration||'?'}\n🎵 ${r.artist||'?'}\n\n✳️ *Commands:* \`<number>\` jump · \`next\`/\`prev\` browse · \`download\` get video`;
      };

      const promptMsg = await sock.sendMessage(chatId, { text: buildDetails(currentIndex), ...channelInfo });
      const promptKey = promptMsg.key;
      sessions.set(senderId, { results, currentIndex, promptKey, query });

      const handler = async (update) => {
        const msg = update.messages?.[0];
        if (!msg?.message || msg.message.reactionMessage) return;
        if (msg.key.remoteJid !== chatId) return;
        const session = sessions.get(senderId);
        if (!session) return;

        const body = (msg.message.conversation || msg.message.extendedTextMessage?.text || '').toLowerCase().trim();
        const editPrompt = async (text) => sock.sendMessage(chatId, { text, edit: promptKey });

        let newIndex = session.currentIndex;

        if (body === 'next') {
          newIndex = session.currentIndex + 1;
          if (newIndex >= session.results.length) { await editPrompt(`❌ Already at last result.`); return; }
        } else if (body === 'prev') {
          newIndex = session.currentIndex - 1;
          if (newIndex < 0) { await editPrompt(`❌ Already at first result.`); return; }
        } else if (/^\d+$/.test(body)) {
          const num = parseInt(body, 10);
          if (num >= 1 && num <= session.results.length) newIndex = num - 1;
          else { await editPrompt(`❌ Choose 1-${session.results.length}.`); return; }
        } else if (body === 'download') {
          const selected = session.results[session.currentIndex];
          await sock.sendMessage(chatId, { react: { text: '📥', key: msg.key } });
          await editPrompt(`⏳ Fetching download link for *${selected.title}*...`);
          try {
            const videoPageUrl = selected.url;
            if (!videoPageUrl) throw new Error('Missing video URL');
            const { data: dlData } = await axios.get(`${DOWNLOAD_API}${encodeURIComponent(videoPageUrl)}`, { timeout: 20000 });
            if (!dlData?.status) throw new Error(dlData?.message || 'Download failed');
            const videosObj = dlData.result?.videos?.videos;
            if (!videosObj) throw new Error('No videos object in response');
            const videoUrl = getBestVideoUrl(videosObj);
            if (!videoUrl) throw new Error('No downloadable URL found');

            await sock.sendMessage(chatId, {
              video: { url: videoUrl },
              caption: `🎬 *${selected.title}*\n📀 Quality: ${dlData.result.quality||'Auto'}\n🕒 Duration: ${dlData.result.duration||selected.duration||'?'}\n\n*Downloaded by REDXBOT302*`,
              mimetype: 'video/mp4'
            });
            sessions.delete(senderId);
            await editPrompt(`✅ Done! ${selected.title} sent.`);
            await delay(3000);
            await editPrompt(`_Session closed._`);
            sock.ev.off('messages.upsert', handler);
          } catch (err) {
            await editPrompt(`❌ Failed: ${err.message}`);
            sessions.delete(senderId);
            sock.ev.off('messages.upsert', handler);
          }
          return;
        } else return;

        if (newIndex !== session.currentIndex) {
          session.currentIndex = newIndex;
          const newResult = session.results[newIndex];
          if (newResult.cover) {
            await sock.sendMessage(chatId, { image: { url: newResult.cover }, caption: `*Result ${newIndex+1}/${session.results.length}*`, ...channelInfo });
          }
          await editPrompt(buildDetails(newIndex));
        }
      };

      sock.ev.on('messages.upsert', handler);
      setTimeout(() => {
        if (sessions.has(senderId)) { sessions.delete(senderId); sock.ev.off('messages.upsert', handler); }
      }, 10 * 60 * 1000);

    } catch (error) {
      await sock.sendMessage(chatId, { text: `❌ Search failed: ${error.message}`, ...channelInfo }, { quoted: message });
    }
  }
};
