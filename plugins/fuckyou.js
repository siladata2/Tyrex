/*****************************************************************************
 *                                                                           *
 *                     Developed By Abdul Rehman Rajpoot                     *
 *                     & Muzamil Khan                                        *
 *                                                                           *
 *  🌐  GitHub   : https://github.com/AbdulRehman19721986/redxbot302          *
 *  ▶️  YouTube  : https://youtube.com/@rootmindtech                         *
 *  💬  WhatsApp : https://whatsapp.com/channel/0029VbCPnYf96H4SNehkev10     *
 *  🔗  Telegram : https://t.me/TeamRedxhacker2                              *
 *                                                                           *
 *    © 2026 Abdul Rehman Rajpoot. All rights reserved.                      *
 *                                                                           *
 *****************************************************************************/

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

module.exports = {
  command: 'fuckyou',
  aliases: ['fu', 'fucku', 'fuckoff'],
  category: 'abuse',
  description: '🖕 Ultimate abuse sequence – Hindi + English',
  usage: '.fuckyou',

  async handler(sock, message, args, context) {
    const { chatId, channelInfo } = context;

    try {
      const initialMsg = await sock.sendMessage(chatId, {
        text: '🖕',
        ...channelInfo
      }, { quoted: message });

      const sequence = [
        "🖕 FUCK YOU 🖕",
        "💥 FUCK YOUR WHOLE FAMILY 💥",
        "🤬 MADER CHOD 🤬",
        "👊 BHAN CHOR 👊",
        "🔥 THERI BHAN KO CHODU 🔥",
        "💢 MA KA LORA 💢",
        "👿 BHAN KA TAKA 👿",
        "🍆 TERI MA KO LUN 🍆",
        "😡 MADERCHOR 😡",
        "🔊 MIA KHALIFA KI AULAD 🔊",
        "🎬 JONY SINS KI AULAD 🎬",
        "💥 BHAN KA TAKA 💥",
        "🐷 RANDI KE BACHE 🐷",
        "🐕 KUTTA 🐕",
        "🐗 SUAR KI AULAD 🐗",
        "🤪 CHUTIYA 🤪",
        "💢 BHOSDIKE 💢",
        "🖕 GANDU 🖕",
        "🔥 TERI MA KA BHOSDA 🔥",
        "💥 BHAN CHOAD 💥",
        "👊 MADARCHOD 👊",
        "🔞 NOW FUCK OFF! 🔞"
      ];

      for (const line of sequence) {
        await delay(700); // Slightly slower for impact
        await sock.relayMessage(
          chatId,
          {
            protocolMessage: {
              key: initialMsg.key,
              type: 14,
              editedMessage: { conversation: line }
            }
          },
          {}
        );
      }
    } catch (error) {
      console.error('Fuckyou command error:', error);
      await sock.sendMessage(chatId, {
        text: `❌ Error: ${error.message}`,
        ...channelInfo
      }, { quoted: message });
    }
  }
};
