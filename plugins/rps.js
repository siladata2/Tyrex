// plugins/rps.js
module.exports = {
  command: 'rps',
  aliases: ['rockpaperscissors'],
  category: 'game',
  description: 'Play Rock, Paper, Scissors',
  usage: '.rps <rock|paper|scissors>',
  
  async handler(sock, message, args, context) {
    const { chatId, senderId } = context;
    if (!args.length) {
      return await sock.sendMessage(chatId, {
        text: '❌ Choose: rock, paper, or scissors'
      }, { quoted: message });
    }

    const userChoice = args[0].toLowerCase();
    const choices = ['rock', 'paper', 'scissors'];
    if (!choices.includes(userChoice)) {
      return await sock.sendMessage(chatId, {
        text: '❌ Invalid choice. Use rock, paper, or scissors.'
      }, { quoted: message });
    }

    const botChoice = choices[Math.floor(Math.random() * 3)];
    let result;
    if (userChoice === botChoice) result = "It's a tie!";
    else if (
      (userChoice === 'rock' && botChoice === 'scissors') ||
      (userChoice === 'paper' && botChoice === 'rock') ||
      (userChoice === 'scissors' && botChoice === 'paper')
    ) result = 'You win! 🎉';
    else result = 'Bot wins! 🤖';

    await sock.sendMessage(chatId, {
      text: `You chose **${userChoice}**\nBot chose **${botChoice}**\n\n${result}`
    }, { quoted: message });
  }
};
