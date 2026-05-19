module.exports = {
  command: 'slap',
  aliases: ['hit'],
  category: 'fun',
  description: 'Slap someone playfully',
  usage: '.slap @user',

  async handler(sock, message, args) {
    const chatId = message.key.remoteJid;
    const from = message.pushName || 'Someone';
    let target = 'themself';
    if (message.message?.extendedTextMessage?.contextInfo?.mentionedJid) {
      target = '@' + message.message.extendedTextMessage.contextInfo.mentionedJid[0].split('@')[0];
    } else if (args[0]) {
      target = args[0];
    }

    const slapGifs = [
      'https://media.giphy.com/media/Zd3N1G6iXU4Oc/giphy.gif',
      'https://media.giphy.com/media/lXzCzS5Wf5W7G/giphy.gif',
      'https://media.giphy.com/media/j3iGKfXRKlLqw/giphy.gif',
      'https://media.giphy.com/media/10PzYxAwC6nHKo/giphy.gif',
    ];
    const randomGif = slapGifs[Math.floor(Math.random() * slapGifs.length)];

    await sock.sendMessage(chatId, {
      video: { url: randomGif },
      caption: `👋 *${from}* slapped *${target}*! Ouch!`,
      gifPlayback: true
    }, { quoted: message });
  }
};
