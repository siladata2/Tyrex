const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

module.exports = {
  command: 'hack',
  aliases: ['fakehack', 'prankhack'],
  category: 'fun',
  description: 'Simulate a hack sequence (fun prank)',
  usage: '.hack [target]',

  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message.key.remoteJid;
    const target = args[0] || 'anonymous';

    try {
      // Send initial message and capture its key
      const initialMsg = await sock.sendMessage(chatId, {
        text: `*💻 Initializing hack sequence on ${target}...*`
      }, { quoted: message });
      const key = initialMsg.key;

      // Helper to edit the same message
      const edit = async (newText) => {
        await sock.sendMessage(chatId, { text: newText, edit: key });
      };

      // Helper to simulate a progress bar
      const progressTask = async (taskName, emoji, steps) => {
        for (let i = 1; i <= steps; i++) {
          const percent = Math.round((i / steps) * 100);
          const bar = '█'.repeat(i) + '░'.repeat(steps - i);
          await edit(`${emoji} *${taskName}:* [${bar}] ${percent}%`);
          await delay(1000);
        }
        await edit(`✅ *${taskName} completed!*`);
        await delay(600);
      };

      // Sequence steps
      await edit(`*💻 Hacking target: ${target}*`);
      await delay(1500);

      await edit('*🔌 Establishing secure connection...*');
      await delay(1500);

      await progressTask('Bypassing firewalls', '🛡️', 5);
      await progressTask('Cracking encryption', '🔑', 6);
      await progressTask('Downloading data', '📥', 4);
      await progressTask('Planting backdoor', '🔒', 3);

      await edit(`*💥 Hack complete! Target "${target}" compromised.*`);
      await delay(1000);
      await edit('*🤖 Logging off...*');
    } catch (err) {
      console.error('Hack command error:', err);
      await sock.sendMessage(chatId, { text: '⚠️ Hack simulation failed. Try again.' }, { quoted: message });
    }
  }
};
