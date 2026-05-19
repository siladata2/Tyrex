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
  command: 'fuckall',
  aliases: ['fa', 'sabko'],
  category: 'fun',
  description: '💥 Abuse everyone in the chat with style',
  usage: '.fuckall',

  async handler(sock, message, args, context) {
    const { chatId, channelInfo } = context;

    try {
      const initialMsg = await sock.sendMessage(chatId, {
        text: '💥',
        ...channelInfo
      }, { quoted: message });

      const sequence = [
        "💥 FUCK ALL OF YOU 💥",
        "SAB KE SAB MADERCHOD 🖕",
        "BHAN KE CHOD 👊",
        "TERI MA KA BHOSDA 🔥",
        "GAND MARAO SAB NE 🍑",
        "*CHUTIYA SAPNA* 💢",
        "RANDI KE PILLE 🚬",
        "FUCK YOUR GENERATION 👪🖕",
        "*CH*T CH*T* 💦",
        "BHAN CHOD DUNGA SABKO 😈",
        "TERI MA KA LUND 🍆",
        "JOHNY SINS KA CHODA 🥵",
        "*GROUP CHOD DIYA* 🔊",
       
      ];

      for (const line of sequence) {
        await delay(700);
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
      console.error('Fuckall command error:', error);
      await sock.sendMessage(chatId, {
        text: `❌ Error: ${error.message}`,
        ...channelInfo
      }, { quoted: message });
    }
  }
};
