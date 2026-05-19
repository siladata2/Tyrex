module.exports = {
  command: 'shutdown',
  aliases: ['stop', 'exit'],
  category: 'owner',
  description: 'Shutdown the bot process',
  usage: '.shutdown',
  ownerOnly: true,

  async handler(sock, message, args, context) {
    const { chatId, channelInfo } = context;

    try {
      await sock.sendMessage(chatId, {
        text: '🔌 Shutting down... Goodbye!',
        ...channelInfo
      }, { quoted: message });

      // Give the message time to send
      setTimeout(() => {
        process.exit(0);
      }, 1000);
    } catch (err) {
      console.error('Shutdown error:', err);
      // Even if sending fails, exit
      process.exit(1);
    }
  }
};
