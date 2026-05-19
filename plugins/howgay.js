// plugins/howgay.js
module.exports = {
  command: 'howgay',
  aliases: ['gayrate'],
  category: 'fun',
  description: 'Check how gay you are',
  usage: '.howgay [@user]',
  
  async handler(sock, message, args, context) {
    const { chatId, isGroup } = context;
    let target = 'you';
    let mentions = [];

    if (isGroup && message.message?.extendedTextMessage?.contextInfo?.mentionedJid?.length) {
      target = '@' + message.message.extendedTextMessage.contextInfo.mentionedJid[0].split('@')[0];
      mentions = [message.message.extendedTextMessage.contextInfo.mentionedJid[0]];
    } else if (args.length) {
      target = args.join(' ');
    }

    const percent = Math.floor(Math.random() * 101);
    const bar = '█'.repeat(Math.floor(percent / 10)) + '░'.repeat(10 - Math.floor(percent / 10));

    await sock.sendMessage(chatId, {
      text: `🏳️‍🌈 **Gay Meter**\n${target} is **${percent}%** gay!\n[${bar}]`,
      mentions
    }, { quoted: message });
  }
};
