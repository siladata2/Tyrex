// plugins/yt.js
const axios = require('axios');

// Session storage per user (senderId)
const sessions = new Map();

// Helper: delay
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// Helper: download and send media
async function downloadAndSend(sock, chatId, message, url, type, caption = '') {
  const response = await axios.get(url, { responseType: 'arraybuffer', timeout: 60000 });
  const buffer = Buffer.from(response.data);
  if (type === 'video') {
    await sock.sendMessage(chatId, { video: buffer, mimetype: 'video/mp4', caption }, { quoted: message });
  } else if (type === 'audio') {
    await sock.sendMessage(chatId, { audio: buffer, mimetype: 'audio/mpeg', ptt: false }, { quoted: message });
  }
}

module.exports = {
  command: 'yt',
  aliases: ['youtube', 'ytsearch'],
  category: 'download',
  description: 'Search YouTube videos and download',
  usage: '.yt <search query>',

  async handler(sock, message, args, context) {
    const chatId = context.chatId || message.key.remoteJid;
    const senderId = context.senderId || message.key.participant || message.key.remoteJid;
    const query = args.join(' ').trim();

    // If no query, ignore (the event handler will process selections)
    if (!query) return;

    // Start search
    await sock.sendMessage(chatId, { react: { text: '🔍', key: message.key } });

    try {
      const searchUrl = `https://jawad-tech.vercel.app/search/youtube?q=${encodeURIComponent(query)}`;
      const { data } = await axios.get(searchUrl, { timeout: 15000 });

      if (!data.status || !data.result || !data.result.length) {
        throw new Error('No results found');
      }

      const results = data.result.slice(0, 10); // limit to 10

      // Build list message
      let listText = `🎵 *YouTube Search: "${query}"*\n─────────────────\n`;
      results.forEach((item, i) => {
        listText += `${i+1}. *${item.title}* (${item.duration}) - ${item.channel}\n`;
      });
      listText += `─────────────────\n✳️ Reply with the *number* (1-${results.length}) to select a video.`;

      const promptMsg = await sock.sendMessage(chatId, { text: listText }, { quoted: message });
      const promptKey = promptMsg.key;

      // Store session
      sessions.set(senderId, {
        stage: 'search',
        results,
        promptKey,
        chatId,
        originalMessage: message, // to use as quoted source for final send
      });

      // Set up event listener for this user's replies
      const handler = async (update) => {
        const msg = update.messages?.[0];
        if (!msg?.message) return;
        if (msg.message.reactionMessage) return;
        if (msg.key.remoteJid !== chatId) return;

        const session = sessions.get(senderId);
        if (!session) return;

        // Get message text
        const body = msg.message.conversation ||
                     msg.message.extendedTextMessage?.text ||
                     msg.message.imageMessage?.caption ||
                     msg.message.videoMessage?.caption ||
                     '';
        const choice = parseInt(body);
        if (isNaN(choice)) return;

        const replyMsgKey = msg.key;

        // Helper to edit the original prompt message
        const editPrompt = async (text) => {
          await sock.sendMessage(chatId, { text, edit: promptKey });
        };

        if (session.stage === 'search') {
          // User selects a video
          const selected = session.results[choice - 1];
          if (!selected) {
            await editPrompt(`❌ Invalid number. Please choose between 1 and ${session.results.length}.`);
            return;
          }

          await sock.sendMessage(chatId, { react: { text: '📝', key: replyMsgKey } });
          await editPrompt(`🎬 *Selected:* ${selected.title}\n\n📱 Choose format:\n1. 🎥 Video (MP4)\n2. 🎵 Audio (MP3)\n\nReply with 1 or 2.`);

          // Update session to format selection stage
          session.stage = 'format';
          session.selected = selected;

        } else if (session.stage === 'format') {
          // User selects format
          if (choice !== 1 && choice !== 2) {
            await editPrompt(`❌ Invalid choice. Send 1 for video or 2 for audio.`);
            return;
          }

          const type = choice === 1 ? 'video' : 'audio';
          const selected = session.selected;

          await sock.sendMessage(chatId, { react: { text: '⬇️', key: replyMsgKey } });
          await editPrompt(`⏳ Fetching download link for *${selected.title}*...`);

          try {
            const downloadUrl = `https://jawad-tech.vercel.app/download/ytdl?url=${encodeURIComponent(selected.link)}`;
            const { data } = await axios.get(downloadUrl, { timeout: 20000 });

            if (!data.status || !data.result) throw new Error('Download info not found');

            const mediaUrl = type === 'video' ? data.result.mp4 : data.result.mp3;
            if (!mediaUrl) throw new Error(`${type === 'video' ? 'Video' : 'Audio'} URL not found`);

            const caption = type === 'video'
              ? `🎬 *${selected.title}*\n👤 ${selected.channel}\n⏱️ ${selected.duration}\n\n📥 Downloaded by REDXBOT302`
              : `🎵 *${selected.title}*\n👤 ${selected.channel}\n\n📥 Downloaded by REDXBOT302`;

            await downloadAndSend(sock, chatId, session.originalMessage, mediaUrl, type, caption);
            await sock.sendMessage(chatId, { react: { text: '✅', key: replyMsgKey } });

            // Clean up session and event listener
            sessions.delete(senderId);
            await editPrompt(`✅ *Download complete!*\n${selected.title} sent.`);
            await delay(3000);
            await editPrompt(`_Session closed._`);
            sock.ev.off('messages.upsert', handler);
          } catch (err) {
            console.error('[YT Download]', err.message);
            await editPrompt(`❌ Download failed: ${err.message}`);
            sessions.delete(senderId);
            sock.ev.off('messages.upsert', handler);
          }
        }
      };

      sock.ev.on('messages.upsert', handler);

      // Auto‑cleanup after 10 minutes
      setTimeout(() => {
        if (sessions.has(senderId)) {
          sessions.delete(senderId);
          sock.ev.off('messages.upsert', handler);
        }
      }, 10 * 60 * 1000);

    } catch (err) {
      console.error('[YT]', err.message);
      await sock.sendMessage(chatId, { text: `❌ Search failed: ${err.message}` }, { quoted: message });
    }
  },
};
