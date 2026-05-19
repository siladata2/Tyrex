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

const config = require('../settings'); // or wherever newsletter info is stored

module.exports = {
  command: 'forward',
  aliases: ['fwd', 'f'],
  category: 'tools',
  description: 'Forward a replied message to multiple JIDs (private, group, newsletter)',
  usage: '.forward <jid1, jid2, ...>',

  async handler(sock, message, args, context) {
    const { chatId, channelInfo } = context;

    // 1. Get quoted message
    const quotedMsg = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    if (!quotedMsg) {
      return await sock.sendMessage(chatId, {
        text: '❌ Please reply to a message you want to forward.',
        ...channelInfo
      }, { quoted: message });
    }

    // 2. Unwrap view‑once messages
    let quoted = quotedMsg;
    if (quoted.viewOnceMessageV2) {
      quoted = quoted.viewOnceMessageV2.message;
    } else if (quoted.viewOnceMessage) {
      quoted = quoted.viewOnceMessage.message;
    }

    // 3. Parse targets
    const inputArgs = args.join(' ');
    if (!inputArgs) {
      const usage = `❌ *Invalid Usage*\n\n` +
        `Provide JIDs separated by commas.\n` +
        `Example: \`.forward 123@s.whatsapp.net, 456@g.us, 120363@newsletter\``;
      return await sock.sendMessage(chatId, { text: usage, ...channelInfo }, { quoted: message });
    }

    const targetJids = inputArgs.split(',').map(j => j.trim()).filter(j => j.length > 0);
    if (targetJids.length === 0) {
      return await sock.sendMessage(chatId, { text: '❌ No valid JIDs found.', ...channelInfo }, { quoted: message });
    }

    // 4. Prepare forwarding context with newsletter info (from settings)
    const forwardContextInfo = {
      forwardingScore: 999,
      isForwarded: true,
      forwardedNewsletterMessageInfo: {
        newsletterJid: config.channelJid || '120363405513439052@newsletter',
        newsletterName: config.botName || 'REDXBOT302',
        serverMessageId: -1
      }
    };

    // Inject contextInfo into the quoted message
    const mType = Object.keys(quoted).find(k =>
      k.endsWith('Message') || k === 'conversation' || k === 'stickerMessage'
    );
    if (mType && quoted[mType] && typeof quoted[mType] === 'object') {
      quoted[mType].contextInfo = {
        ...(quoted[mType].contextInfo || {}),
        ...forwardContextInfo
      };
    }

    // 5. Relay loop
    let successCount = 0;
    let failCount = 0;
    const failedJids = [];

    for (let jid of targetJids) {
      // Ensure JID format
      if (!jid.includes('@')) {
        jid = jid + '@s.whatsapp.net';
      }

      try {
        await sock.relayMessage(jid, quoted, {
          messageId: sock.generateMessageTag?.() || undefined
        });
        successCount++;
        await new Promise(r => setTimeout(r, 800)); // slight delay to avoid rate limits
      } catch (error) {
        console.error(`Relay failed for ${jid}:`, error.message);
        failCount++;
        failedJids.push(jid);
      }
    }

    // 6. Report only if there were failures
    if (failCount > 0) {
      let report = `⚠️ *Some JIDs failed to receive the message*\n\n`;
      report += `❌ *Failed:* ${failCount}\n`;
      report += `✨ *Mode:* Native Relay\n`;
      report += `\n*Failed List:*\n${failedJids.map(j => `> ${j}`).join('\n')}`;

      await sock.sendMessage(chatId, {
        text: report,
        ...channelInfo
      }, { quoted: message });
    } else {
      // Optional: silent success, or you can send a small notification
      await sock.sendMessage(chatId, {
        text: `✅ Message forwarded to ${successCount} JID(s).`,
        ...channelInfo
      }, { quoted: message });
    }
  }
};
