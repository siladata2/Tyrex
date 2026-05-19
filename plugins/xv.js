/*****************************************************************************
 *                     Developed By Abdul Rehman Rajpoot                     *
 *    © 2026 Abdul Rehman Rajpoot. All rights reserved.                      *
 *****************************************************************************/

const axios = require('axios');
const { isSudo } = require('../lib/index');

const SEARCH_API   = 'https://api.deline.web.id/search/xnxx?q=';
const DOWNLOAD_API = 'https://api.deline.web.id/downloader/xnxx?url=';
const sessions = new Map();

function cleanNum(jid) { return (jid||'').split(':')[0].split('@')[0]; }

async function isAllowed(senderId, context) {
  // isOwner is passed via context from the main handler (already includes sudo check)
  if (context.isOwner) return true;
  // Extra direct sudo check for safety
  try { if (await isSudo(senderId)) return true; } catch {}
  return false;
}

function getBestVideoUrl(files) {
  if (!files) return null;
  return files.hd1080 || files['1080p'] || files.high || files.low || files.HLS || null;
}

const delay = ms => new Promise(r => setTimeout(r, ms));

module.exports = {
  command: 'xv',
  aliases: ['xvdl', 'xvsearch', 'xvideo'],
  category: 'downloader',
  description: 'Search and download XNXX videos (owner/sudo + all linked devices)',
  usage: '.xv <search query>',
  ownerOnly: true,

  async handler(sock, message, args, context = {}) {
    const chatId   = context.chatId || message.key.remoteJid;
    const channelInfo = context.channelInfo || {};
    const senderId = context.senderId || message.key.participant || message.key.remoteJid;

    // Permission gate — allows owner, sudo, AND linked devices of those numbers
    if (!(await isAllowed(senderId, context))) {
      return sock.sendMessage(chatId, {
        text: '🚫 *XV Downloader*\nThis command is restricted to *Owner & Sudo users* only.\nAll linked devices of authorised users are permitted.'
      }, { quoted: message });
    }

    const query = args.join(' ').trim();
    if (!query) {
      return sock.sendMessage(chatId, {
        text: `🎬 *XV Video Downloader*\n\n*Usage:* \`.xv <search term>\`\n\n*Examples:*\n• \`.xv cute cats\`\n• \`.xv funny animals\``,
        ...channelInfo
      }, { quoted: message });
    }

    await sock.sendMessage(chatId, { react: { text: '⏳', key: message.key } });

    try {
      const { data: searchData } = await axios.get(`${SEARCH_API}${encodeURIComponent(query)}`, { timeout: 15000 });

      if (!searchData?.status || !Array.isArray(searchData.result) || !searchData.result.length) {
        return sock.sendMessage(chatId, { text: '❌ No results found.', ...channelInfo }, { quoted: message });
      }

      const results = searchData.result.slice(0, 9);
      let listText = `🔍 *Search Results for:* "${query}"\n\n`;
      results.forEach((item, idx) => {
        listText += `*${idx + 1}. ${item.title || 'Untitled'}*\n`;
        if (item.info)       listText += `   ${item.info}\n`;
        if (item.resolution) listText += `   📺 ${item.resolution}\n`;
        if (item.duration)   listText += `   ⏱️ ${item.duration}\n`;
        if (item.artist)     listText += `   🎵 ${item.artist}\n`;
        listText += '\n';
      });
      listText += `✳️ Reply with the *number* (1-${results.length}) to download.`;

      const promptMsg = await sock.sendMessage(chatId, { text: listText, ...channelInfo });
      const promptKey = promptMsg.key;

      sessions.set(senderId, { stage: 'search', results, promptKey });

      const handler = async (update) => {
        const msg = update.messages?.[0];
        if (!msg?.message || msg.message.reactionMessage) return;
        if (msg.key.remoteJid !== chatId) return;
        const session = sessions.get(senderId);
        if (!session) return;

        const body = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
        const choice = parseInt(body);
        if (isNaN(choice)) return;

        const editPrompt = async (text) => sock.sendMessage(chatId, { text, edit: promptKey });

        if (session.stage === 'search') {
          const selected = session.results[choice - 1];
          if (!selected) { await editPrompt(`❌ Invalid. Choose 1-${session.results.length}.`); return; }

          await sock.sendMessage(chatId, { react: { text: '📥', key: msg.key } });
          await editPrompt(`⏳ Fetching download link for *${selected.title}*...`);

          try {
            const videoUrl = selected.link || selected.url;
            if (!videoUrl) throw new Error('No video URL in search result');
            const { data: dlData } = await axios.get(`${DOWNLOAD_API}${encodeURIComponent(videoUrl)}`, { timeout: 20000 });
            if (!dlData?.status || !dlData.result?.files) throw new Error(dlData?.message || 'No files');
            const finalVideoUrl = getBestVideoUrl(dlData.result.files);
            if (!finalVideoUrl) throw new Error('No downloadable URL');

            await sock.sendMessage(chatId, {
              video: { url: finalVideoUrl },
              caption: `🎬 *${selected.title}*\n📀 Quality: ${dlData.result.quality || 'Auto'}\n🕒 Duration: ${dlData.result.duration || selected.duration || '?'}\n\n*Downloaded by REDXBOT302*`,
              mimetype: 'video/mp4'
            });

            sessions.delete(senderId);
            await editPrompt(`✅ *Done!* ${selected.title} sent.`);
            await delay(3000);
            await editPrompt(`_Session closed._`);
            sock.ev.off('messages.upsert', handler);
          } catch (err) {
            await editPrompt(`❌ Failed: ${err.message}`);
            sessions.delete(senderId);
            sock.ev.off('messages.upsert', handler);
          }
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
