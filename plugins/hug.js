module.exports = {
  command: 'hug',
  aliases: ['embrace'],
  category: 'fun',
  description: 'Give a warm hug',
  usage: '.hug @user',

  async handler(sock, message, args) {
    const chatId = message.key.remoteJid;
    const from = message.pushName || 'Someone';
    let target = 'themself';
    if (message.message?.extendedTextMessage?.contextInfo?.mentionedJid) {
      target = '@' + message.message.extendedTextMessage.contextInfo.mentionedJid[0].split('@')[0];
    } else if (args[0]) {
      target = args[0];
    }

    const hugGifs = [
      'https://media.giphy.com/media/od5H3PmEG5EVq/giphy.gif',
      'https://media.giphy.com/media/3o7abB06u9bNzA8LC8/giphy.gif',
      'https://media.giphy.com/media/11f7zMNWcD6w08/giphy.gif',
      'https://media.giphy.com/media/3o7TKqhAQxX5bXr0zW/giphy.gif',
    ];
    const randomGif = hugGifs[Math.floor(Math.random() * hugGifs.length)];

    await sock.sendMessage(chatId, {
      video: { url: randomGif },
      caption: `🤗 *${from}* gave a big hug to *${target}*`,
      gifPlayback: true
    }, { quoted: message });
  }
};
