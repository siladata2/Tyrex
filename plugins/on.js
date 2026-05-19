const { exec } = require('child_process');

function run(cmd) {
  return new Promise((resolve, reject) => {
    exec(cmd, { windowsHide: true }, (err, stdout, stderr) => {
      if (err) reject(new Error((stderr || stdout || err.message || '').toString()));
      else resolve(stdout || '');
    });
  });
}

async function restartProcess() {
  try {
    await run('pm2 restart all');
    return;
  } catch {}
  // Fallback: just exit – rely on a process manager (systemd, docker, etc.)
  setTimeout(() => process.exit(0), 500);
}

module.exports = {
  command: 'on',
  aliases: ['restart', 'reboot'],
  category: 'owner',
  description: 'Restart the bot (uses PM2 if available)',
  usage: '.on',
  ownerOnly: true,

  async handler(sock, message, args, context) {
    const { chatId, channelInfo } = context;

    try {
      await sock.sendMessage(chatId, {
        text: '♻️ Restarting bot...',
        ...channelInfo
      }, { quoted: message });

      await restartProcess();
    } catch (err) {
      console.error('Restart error:', err);
      await sock.sendMessage(chatId, {
        text: `❌ Restart failed: ${err.message}`,
        ...channelInfo
      }, { quoted: message });
    }
  }
};
