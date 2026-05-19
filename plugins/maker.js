// plugins/maker.js
const axios = require('axios');

async function sendImageFromUrl(sock, chatId, message, url, caption = '') {
  const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 15000 });
  const buffer = Buffer.from(res.data);
  await sock.sendMessage(chatId, { image: buffer, caption }, { quoted: message });
}

// Helper for emoji mix (returns PNG URL)
async function getEmojiMix(emoji1, emoji2) {
  const url = `https://api.deline.web.id/maker/emojimix?emoji1=${encodeURIComponent(emoji1)}&emoji2=${encodeURIComponent(emoji2)}`;
  const { data } = await axios.get(url);
  if (!data.status) throw new Error(data.error);
  return data.result.png;
}

module.exports = [
  {
    command: 'cewekbrat',
    aliases: ['brat'],
    category: 'maker',
    description: 'Generate a "brat girl" image with custom text',
    usage: '.cewekbrat <text>',

    async handler(sock, message, args, context) {
      const { chatId } = context;
      const text = args.join(' ').trim();
      if (!text) return sock.sendMessage(chatId, { text: '❌ Provide text for the image.' }, { quoted: message });
      const url = `https://api.deline.web.id/maker/cewekbrat?text=${encodeURIComponent(text)}`;
      try {
        await sendImageFromUrl(sock, chatId, message, url, `✨ *Brat Girl*: ${text}`);
      } catch (err) {
        sock.sendMessage(chatId, { text: `❌ Failed: ${err.message}` }, { quoted: message });
      }
    }
  },
  {
    command: 'emojigif',
    aliases: ['egif'],
    category: 'maker',
    description: 'Get animated GIF version of an emoji',
    usage: '.emojigif <emoji>',

    async handler(sock, message, args, context) {
      const { chatId } = context;
      const emoji = args[0];
      if (!emoji) return sock.sendMessage(chatId, { text: '❌ Provide an emoji.' }, { quoted: message });
      const url = `https://api.deline.web.id/maker/emojigif?emoji=${encodeURIComponent(emoji)}`;
      try {
        await sendImageFromUrl(sock, chatId, message, url, `🎞️ Animated ${emoji}`);
      } catch (err) {
        sock.sendMessage(chatId, { text: `❌ Failed: ${err.message}` }, { quoted: message });
      }
    }
  },
  {
    command: 'emojimix',
    aliases: ['mix'],
    category: 'maker',
    description: 'Combine two emojis into a sticker',
    usage: '.emojimix 🗿 😭',

    async handler(sock, message, args, context) {
      const { chatId } = context;
      if (args.length < 2) return sock.sendMessage(chatId, { text: '❌ Provide two emojis: .emojimix 🗿 😭' }, { quoted: message });
      const [e1, e2] = args;
      try {
        const imgUrl = await getEmojiMix(e1, e2);
        await sendImageFromUrl(sock, chatId, message, imgUrl, `🔄 ${e1} + ${e2}`);
      } catch (err) {
        sock.sendMessage(chatId, { text: `❌ Failed: ${err.message}` }, { quoted: message });
      }
    }
  },
  {
    command: 'iqc',
    aliases: ['iphonechat'],
    category: 'maker',
    description: 'Generate a fake iPhone chat screenshot',
    usage: '.iqc <text> [time] [statusTime]',

    async handler(sock, message, args, context) {
      const { chatId } = context;
      let text = args.join(' ');
      let chatTime = '22:11';
      let statusTime = '22:20';
      // Simple parsing: if last argument is like HH:MM, treat as chatTime
      const parts = text.split(' ');
      const last = parts[parts.length-1];
      if (/^\d{2}:\d{2}$/.test(last)) {
        chatTime = last;
        text = parts.slice(0, -1).join(' ');
      }
      if (!text) return sock.sendMessage(chatId, { text: '❌ Provide text for the chat.' }, { quoted: message });
      const url = `https://api.deline.web.id/maker/iqc?text=${encodeURIComponent(text)}&chatTime=${encodeURIComponent(chatTime)}&statusBarTime=${encodeURIComponent(statusTime)}`;
      try {
        await sendImageFromUrl(sock, chatId, message, url, `📱 *iPhone Chat*\n${text}`);
      } catch (err) {
        sock.sendMessage(chatId, { text: `❌ Failed: ${err.message}` }, { quoted: message });
      }
    }
  },
  {
    command: 'qc',
    aliases: ['quote'],
    category: 'maker',
    description: 'Generate a custom quote image',
    usage: '.qc <text> [color] [avatar] [name]',

    async handler(sock, message, args, context) {
      const { chatId } = context;
      let text = args.join(' ');
      let color = 'white';
      let avatar = 'https://api.deline.web.id/4w9O3SzQWY.jpg';
      let name = 'agas';
      // parse simple options (color as last word if known)
      const words = text.split(' ');
      const last = words[words.length-1];
      const colors = ['red','blue','green','yellow','black','white','purple','brown','orange','cyan','magenta','fuchsia','lime','indigo','violet','gold','silver','beige','turquoise','peach','salmon','mint','lavender','chartreuse','khaki','plum','olive','orchid','sienna','tomato','tan','snow','azure','slategray','royalblue','navy','maroon','teal','lavenderblush','gray','grey'];
      if (colors.includes(last)) {
        color = last;
        text = words.slice(0, -1).join(' ');
      }
      if (!text) return sock.sendMessage(chatId, { text: '❌ Provide quote text.' }, { quoted: message });
      const url = `https://api.deline.web.id/maker/qc?text=${encodeURIComponent(text)}&color=${encodeURIComponent(color)}&avatar=${encodeURIComponent(avatar)}&nama=${encodeURIComponent(name)}`;
      try {
        await sendImageFromUrl(sock, chatId, message, url, `📜 *Quote*: ${text}`);
      } catch (err) {
        sock.sendMessage(chatId, { text: `❌ Failed: ${err.message}` }, { quoted: message });
      }
    }
  },
  {
    command: 'smeme',
    aliases: ['memesticker'],
    category: 'maker',
    description: 'Create a meme sticker from an image URL with top/bottom text',
    usage: '.smeme <image_url> <top> <bottom>',

    async handler(sock, message, args, context) {
      const { chatId } = context;
      if (args.length < 3) return sock.sendMessage(chatId, { text: '❌ Usage: .smeme <image_url> <top text> <bottom text>' }, { quoted: message });
      const [image, top, bottom] = args;
      const url = `https://api.deline.web.id/maker/smeme?image=${encodeURIComponent(image)}&top=${encodeURIComponent(top)}&bottom=${encodeURIComponent(bottom)}`;
      try {
        await sendImageFromUrl(sock, chatId, message, url, `🧩 *Meme*: ${top} / ${bottom}`);
      } catch (err) {
        sock.sendMessage(chatId, { text: `❌ Failed: ${err.message}` }, { quoted: message });
      }
    }
  }
];
