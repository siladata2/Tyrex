const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

module.exports = {
  command: 'sex',
  aliases: ['makeout', 'romance'],
  category: 'fun',
  description: 'Simulate a romantic encounter (just for laughs)',
  usage: '.sex [partner]',

  async handler(sock, message, args) {
    const chatId = message.key.remoteJid;
    const partner = args[0] || 'someone';
    const user = message.pushName || 'You';

    const initialMsg = await sock.sendMessage(chatId, {
      text: `*💕 ${user} is feeling romantic with ${partner}...*`
    }, { quoted: message });
    const key = initialMsg.key;
    const edit = text => sock.sendMessage(chatId, { text, edit: key });

    await delay(1000);
    await edit(`*😊 Setting the mood...*`);
    await delay(1500);
    await edit(`*🕯️ Lighting candles...*`);
    await delay(1500);
    await edit(`*🎶 Playing romantic music...*`);
    await delay(1500);
    await edit(`*💋 Sharing a sweet kiss...*`);
    await delay(2000);
    await edit(`*❤️ A wonderful time was had by all!*`);
    await delay(1000);
    await edit(`*🥰 ${user} and ${partner} are now closer than ever.*`);
  }
};
