// plugins/roll.js
module.exports = {
  command: 'roll',
  aliases: ['dice', 'd'],
  category: 'game',
  description: 'Roll a dice. Usage: .roll 2d6',
  usage: '.roll [ndn] (e.g., .roll 2d6)',
  
  async handler(sock, message, args, context) {
    const { chatId } = context;
    let sides = 6, count = 1;
    
    if (args.length) {
      const match = args[0].match(/^(\d+)d(\d+)$/i);
      if (match) {
        count = parseInt(match[1]);
        sides = parseInt(match[2]);
        if (count > 100) count = 100; // limit
      } else {
        return await sock.sendMessage(chatId, {
          text: '❌ Invalid format. Use e.g., .roll 2d6'
        }, { quoted: message });
      }
    }

    const rolls = [];
    for (let i = 0; i < count; i++) {
      rolls.push(Math.floor(Math.random() * sides) + 1);
    }

    const total = rolls.reduce((a, b) => a + b, 0);
    const result = count === 1 ? `🎲 You rolled: **${rolls[0]}**` 
                               : `🎲 Rolls: ${rolls.join(', ')}\n📊 Total: **${total}**`;

    await sock.sendMessage(chatId, { text: result }, { quoted: message });
  }
};
