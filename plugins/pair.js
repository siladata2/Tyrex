/*****************************************************************************
 *  .pair — WhatsApp Pairing Command                                         *
 *  Anyone can use this to pair their number directly from WhatsApp.         *
 *  No website needed — just type .pair <number> in DM or group.            *
 *                                                                           *
 *  Usage:                                                                   *
 *    .pair 923001234567     ← pair a number (country code, no +)           *
 *    .pair +92 300 1234567  ← spaces/+ are stripped automatically          *
 *    .pair                  ← pair your own number (auto-detected)         *
 *    .pair force 923...     ← force re-pair (wipes old session)            *
 *                                                                           *
 *  © 2026 Abdul Rehman Rajpoot. All rights reserved.                       *
 *****************************************************************************/

'use strict';

const STEPS = [
  '1️⃣  Open *WhatsApp* on your phone',
  '2️⃣  Tap ⋮ (Android) or *Settings* (iPhone)',
  '3️⃣  Tap *Linked Devices → Link a Device*',
  '4️⃣  Tap *Link with phone number instead*',
  '5️⃣  Enter the code below ⬇️',
];

module.exports = {
  pattern:   'pair',
  alias:     ['getpair', 'pairme', 'connect'],
  desc:      '📲 Pair your WhatsApp — get a pairing code instantly',
  category:  'tools',
  ownerOnly: false,

  async execute(conn, msg, _ctx, opts) {
    const { from, reply, sender, senderNumber, args, q } = opts;

    let force  = false;
    let rawNum = '';

    if (args[0]?.toLowerCase() === 'force') {
      force  = true;
      rawNum = args.slice(1).join('').replace(/\D/g, '');
    } else {
      rawNum = q.replace(/\D/g, '');
    }

    if (!rawNum) rawNum = senderNumber || sender.split('@')[0].split(':')[0];
    const num = rawNum.replace(/\D/g, '');

    if (!num || num.length < 7) {
      return reply(
        `❌ *Invalid number!*\n\n` +
        `Usage: *.pair <number>*\n` +
        `Example: *.pair 923001234567*\n\n` +
        `> Include country code, no + sign needed.`
      );
    }

    const waitMsg = await conn.sendMessage(from, {
      text: `⏳ *Generating pairing code for* +${num}...\n\n_Please wait a few seconds_`,
    }, { quoted: msg });

    try {
      // Use the global helper exposed by index.js (no pairManager.init() needed)
      if (typeof global.doPairNumber !== 'function') {
        throw new Error('Pairing system not ready. Please wait a moment and try again.');
      }

      const result = await global.doPairNumber(num, force);

      if (result.alreadyConnected) {
        await conn.sendMessage(from, {
          text:
            `✅ *Already connected!*\n\n` +
            `📱 *Number:* +${num}\n\n` +
            `If you want to re-pair, use:\n*.pair force ${num}*`,
          edit: waitMsg.key,
        });
        return;
      }

      const codeText =
        `╭━━━[ 🔑 *PAIRING CODE* ]━━━⊷\n` +
        `┃\n` +
        `┃  📱 *Number:*  +${num}\n` +
        `┃  🔢 *Code:*\n` +
        `┃\n` +
        `┃  ┌──────────────────┐\n` +
        `┃  │  \`${result.pairingCode}\`  │\n` +
        `┃  └──────────────────┘\n` +
        `┃\n` +
        `${STEPS.map(s => `┃  ${s}`).join('\n')}\n` +
        `┃\n` +
        `┃  ⏱️ Code expires in ~60 seconds\n` +
        `┃  ❓ Didn't work? Try: *.pair force ${num}*\n` +
        `┃\n` +
        `╰━━━━━━━━━━━━━━━━━━━━━━⊷\n\n` +
        `> 🔥 Powered by *REDXBOT302*`;

      await conn.sendMessage(from, { text: codeText, edit: waitMsg.key });

      if (num !== senderNumber) {
        try {
          await conn.sendMessage(`${num}@s.whatsapp.net`, {
            text:
              `🎉 *Someone paired you to REDXBOT302!*\n\n` +
              `📱 *Your Number:* +${num}\n` +
              `🔑 *Pairing Code:*\n\n` +
              `  \`${result.pairingCode}\`\n\n` +
              `${STEPS.join('\n')}\n\n` +
              `> ⏱️ Code expires in ~60 seconds\n` +
              `> 🔥 Powered by REDXBOT302`,
          });
        } catch { /* user may not exist on WA */ }
      }

    } catch (err) {
      await conn.sendMessage(from, {
        text:
          `❌ *Pairing failed!*\n\n` +
          `📱 Number: +${num}\n` +
          `💬 Error: _${err.message}_\n\n` +
          `💡 *Try:*\n` +
          `• Make sure the number is on WhatsApp\n` +
          `• Include country code (e.g. 923001234567)\n` +
          `• Wait 30s and try again\n` +
          `• Use *.pair force ${num}* if already connected`,
        edit: waitMsg.key,
      });
    }
  },
};
