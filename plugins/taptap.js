// plugins/taptap.js
const { playSound } = require('./sound2');

module.exports = {
  command: 'taptap',
  aliases: ['boom', 'vineboom'],
  category: 'fun',
  description: '💥 Play the viral Vine Boom sound',
  usage: '.taptap',

  async handler(sock, message, args, context) {
    await playSound(sock, context.chatId, message, 'taptap', context);
  }
};
