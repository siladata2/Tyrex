// plugins/random.js
const axios = require('axios');

async function sendMedia(sock, chatId, message, url, type = 'image', caption = '') {
  const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 15000 });
  const buffer = Buffer.from(res.data);
  if (type === 'video') {
    await sock.sendMessage(chatId, { video: buffer, mimetype: 'video/mp4', caption }, { quoted: message });
  } else {
    await sock.sendMessage(chatId, { image: buffer, caption }, { quoted: message });
  }
}

module.exports = [
  {
    command: 'asupan',
    category: 'random',
    description: 'Random asupan video/picture',
    usage: '.asupan',

    async handler(sock, message, args, context) {
      const { chatId } = context;
      try {
        const { data } = await axios.get('https://api.deline.web.id/random/asupan', { timeout: 10000 });
        if (!data.status) throw new Error(data.error);
        // result may be a URL
        const url = data.result;
        if (!url) throw new Error('No media');
        const isVideo = url.includes('.mp4') || url.includes('/video/');
        await sendMedia(sock, chatId, message, url, isVideo ? 'video' : 'image', '✨ Random Asupan');
      } catch (err) {
        sock.sendMessage(chatId, { text: `❌ Failed: ${err.message}` }, { quoted: message });
      }
    }
  },
  {
    command: 'ba',
    category: 'random',
    description: 'Random Blue Archive image',
    usage: '.ba',

    async handler(sock, message, args, context) {
      const { chatId } = context;
      try {
        const { data } = await axios.get('https://api.deline.web.id/random/ba', { timeout: 10000 });
        if (!data.status) throw new Error(data.error);
        await sendMedia(sock, chatId, message, data.result, 'image', '🎮 Blue Archive');
      } catch (err) {
        sock.sendMessage(chatId, { text: `❌ Failed: ${err.message}` }, { quoted: message });
      }
    }
  },
  {
    command: 'loli',
    category: 'random',
    description: 'Random loli image',
    usage: '.loli',

    async handler(sock, message, args, context) {
      const { chatId } = context;
      try {
        const { data } = await axios.get('https://api.deline.web.id/random/loli', { timeout: 10000 });
        if (!data.status) throw new Error(data.error);
        await sendMedia(sock, chatId, message, data.result, 'image', '🌸 Loli');
      } catch (err) {
        sock.sendMessage(chatId, { text: `❌ Failed: ${err.message}` }, { quoted: message });
      }
    }
  },
  {
    command: 'nsfw',
    category: 'nsfw',
    description: 'Random NSFW image (categories 0-69)',
    usage: '.nsfw [category]',

    async handler(sock, message, args, context) {
      const { chatId } = context;
      let cat = args[0] || '0';
      try {
        const url = `https://api.deline.web.id/nsfw?cat=${encodeURIComponent(cat)}`;
        const { data } = await axios.get(url, { timeout: 10000 });
        if (!data.status) throw new Error(data.error);
        await sendMedia(sock, chatId, message, data.result, 'image', `🔞 NSFW (cat ${cat})`);
      } catch (err) {
        sock.sendMessage(chatId, { text: `❌ Failed: ${err.message}` }, { quoted: message });
      }
    }
  },
  {
    command: 'ppcouple',
    category: 'random',
    description: 'Random couple profile pictures',
    usage: '.ppcouple',

    async handler(sock, message, args, context) {
      const { chatId } = context;
      try {
        const { data } = await axios.get('https://api.deline.web.id/random/ppcouple', { timeout: 10000 });
        if (!data.status) throw new Error(data.error);
        const { cowo, cewe } = data.result;
        await sendMedia(sock, chatId, message, cowo, 'image', '👫 Couple (Male)');
        await new Promise(r => setTimeout(r, 1000));
        await sendMedia(sock, chatId, message, cewe, 'image', '👫 Couple (Female)');
      } catch (err) {
        sock.sendMessage(chatId, { text: `❌ Failed: ${err.message}` }, { quoted: message });
      }
    }
  }
];
