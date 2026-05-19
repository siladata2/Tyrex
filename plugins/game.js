// plugins/game.js
const axios = require('axios');

// Helper to download image from URL
async function getImageBuffer(url) {
  const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 10000 });
  return Buffer.from(res.data);
}

module.exports = [
  {
    command: 'tebakbendera',
    aliases: ['guessflag'],
    category: 'game',
    description: 'Guess the country from its flag',
    usage: '.tebakbendera',

    async handler(sock, message, args, context) {
      const { chatId } = context;
      try {
        const { data } = await axios.get('https://api.deline.web.id/game/tebakbendera', { timeout: 10000 });
        if (!data.status) throw new Error(data.error);
        const { img, name } = data.result;
        const buffer = await getImageBuffer(img);
        const caption = `🇺🇳 *Guess the Country*\n\nWhat country is this flag from?\n\n_Send your answer as a reply._\n_Use .answer <country> to check._`;
        // Store the correct answer in a global map for later checking
        if (!global.games) global.games = {};
        global.games[chatId] = { type: 'flag', answer: name.toLowerCase() };
        await sock.sendMessage(chatId, { image: buffer, caption }, { quoted: message });
      } catch (err) {
        console.error('Flag game error:', err);
        sock.sendMessage(chatId, { text: '❌ Failed to load flag game.' }, { quoted: message });
      }
    }
  },
  {
    command: 'tebakanime',
    aliases: ['guessanime'],
    category: 'game',
    description: 'Guess the anime from a character image',
    usage: '.tebakanime',

    async handler(sock, message, args, context) {
      const { chatId } = context;
      try {
        const { data } = await axios.get('https://api.deline.web.id/game/tebakanime', { timeout: 10000 });
        if (!data.status) throw new Error(data.error);
        const { soal, jawaban } = data.result;
        const buffer = await getImageBuffer(soal);
        const caption = `🎌 *Guess the Anime*\n\nWhich anime is this character from?\n\n_Send your answer as a reply._\n_Use .answer <name> to check._`;
        if (!global.games) global.games = {};
        global.games[chatId] = { type: 'anime', answer: jawaban.toLowerCase() };
        await sock.sendMessage(chatId, { image: buffer, caption }, { quoted: message });
      } catch (err) {
        console.error('Anime game error:', err);
        sock.sendMessage(chatId, { text: '❌ Failed to load anime game.' }, { quoted: message });
      }
    }
  },
  {
    command: 'answer',
    aliases: ['guess'],
    category: 'game',
    description: 'Answer the current guessing game',
    usage: '.answer <your guess>',

    async handler(sock, message, args, context) {
      const { chatId } = context;
      const guess = args.join(' ').toLowerCase();
      if (!guess) {
        return sock.sendMessage(chatId, { text: '❌ Provide your guess: .answer <answer>' }, { quoted: message });
      }
      const game = global.games?.[chatId];
      if (!game) {
        return sock.sendMessage(chatId, { text: '❌ No active game. Start one with .tebakbendera or .tebakanime' }, { quoted: message });
      }
      const isCorrect = guess === game.answer;
      const result = isCorrect ? '✅ Correct!' : `❌ Wrong! The correct answer is *${game.answer}*.`;
      await sock.sendMessage(chatId, { text: result }, { quoted: message });
      delete global.games[chatId];
    }
  }
];
