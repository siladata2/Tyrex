// plugins/rate.js
module.exports = {
  command: 'rate',
  aliases: [],
  category: 'fun',
  description: 'Rate something out of 100%',
  usage: '.rate <thing>',
  
  async handler(sock, message, args, context) {
    const { chatId } = context;
    if (!args.length) {
      return await sock.sendMessage(chatId, {
        text: '❌ What should I rate?'
      }, { quoted: message });
    }

    const rating = Math.floor(Math.random() * 101);
    const thing = args.join(' ');
    await sock.sendMessage(chatId, {
      text: `I rate **${thing}** a **${rating}%**!`
    }, { quoted: message });
  }
};
