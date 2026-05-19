const os = require('os');
const process = require('process');

module.exports = {
  command: 'alive',
  aliases: ['status', 'bot'],
  category: 'info',
  description: 'Check if bot is alive',
  async handler(sock, message, args, context) {
    const chatId = context.chatId || message.key.remoteJid;

    const uptime = process.uptime();
    const hours = Math.floor(uptime / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const seconds = Math.floor(uptime % 60);
    const ram = (process.memoryUsage().rss / 1024 / 1024).toFixed(2);
    const cpu = os.loadavg()[0].toFixed(2);

    const text = `🤖 *REDXBOT302 is alive!*\n\n` +
      `⏱️ *Uptime:* ${hours}h ${minutes}m ${seconds}s\n` +
      `💾 *RAM:* ${ram} MB\n` +
      `🖥️ *CPU Load:* ${cpu}\n\n` +
      `✨ *Powered by Abdul Rehman Rajpoot* ✨\n` +
      `🔗 Join Channel: https://whatsapp.com/channel/0029VbCPnYf96H4SNehkev10`;

    await sock.sendMessage(chatId, { text }, { quoted: message });
  }
};
