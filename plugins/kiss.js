module.exports = {
  command: 'kiss',
  aliases: ['smooch'],
  category: 'fun',
  description: 'Send a kiss to someone',
  usage: '.kiss @user',

  async handler(sock, message, args) {
    const chatId = message.key.remoteJid;
    const from = message.pushName || 'Someone';
    let target = 'themself';
    if (message.message?.extendedTextMessage?.contextInfo?.mentionedJid) {
      target = '@' + message.message.extendedTextMessage.contextInfo.mentionedJid[0].split('@')[0];
    } else if (args[0]) {
      target = args[0];
    }

    const kissGifs = [
      'https://media.giphy.com/media/G3va31oEEnIkM/giphy.gif',
      'https://media.giphy.com/media/bm2O3nXTcKJeU/giphy.gif',
      'https://media.giphy.com/media/11f7zMNWcD6w08/giphy.gif',
      'https://media.giphy.com/media/3o7abB06u9bNzA8LC8/giphy.gif',
    ];
    const randomGif = kissGifs[Math.floor(Math.random() * kissGifs.length)];

    await sock.sendMessage(chatId, {
      video: { url: randomGif },
      caption: `😘 *${from}* gave a kiss to *${target}*`,
      gifPlayback: true
    }, { quoted: message });
  }
};
