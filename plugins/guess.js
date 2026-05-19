/*****************************************************************************
 *                                                                           *
 *                     Developed By Abdul Rehman Rajpoot                     *
 *                     & Muzamil Khan                                        *
 *                                                                           *
 *****************************************************************************/

// ==================== Game Logic ====================
class GuessNumber {
    constructor() {
        this.number = Math.floor(Math.random() * 100) + 1;
        this.attempts = 0;
        this.gameOver = false;
        this.won = false;
    }

    guess(num) {
        if (this.gameOver || this.won) return { error: 'Game already ended' };
        if (num < 1 || num > 100) return { error: 'Number must be between 1 and 100' };

        this.attempts++;
        if (num === this.number) {
            this.won = true;
            return { success: true, result: 'correct' };
        } else if (num < this.number) {
            return { success: true, result: 'too low' };
        } else {
            return { success: true, result: 'too high' };
        }
    }
}

// ==================== Storage ====================
const games = new Map(); // key = `guess-${chatId}:${player}`

module.exports = {
    command: 'guess',
    aliases: ['guessnumber'],
    category: 'games',
    description: 'Guess the number between 1 and 100.',
    usage: 
        '.guess start                – Start a new game\n' +
        '.guess <number>             – Make a guess\n' +
        '.guess guide                 – Show game guide',

    async handler(sock, message, args, context = {}) {
        const chatId = context.chatId || message.key.remoteJid;
        const senderId = (context.senderId || message.key.participant || message.key.remoteJid).split(':')[0];
        const channelInfo = context.channelInfo || {};

        const reply = async (text) => 
            await sock.sendMessage(chatId, { text, ...channelInfo }, { quoted: message });

        if (args.length === 0) {
            return await reply(
                `🔢 *Guess the Number Commands*\n\n` +
                `• \`.guess start\` – New game\n` +
                `• \`.guess <number>\` – Make a guess (1-100)\n` +
                `• \`.guess guide\` – Show guide`
            );
        }

        const subCmd = args[0].toLowerCase();

        if (subCmd === 'guide') {
            return await reply(
                `📖 *Guess the Number Guide*\n\n` +
                `1. Start a game: \`.guess start\`\n` +
                `2. The bot picks a random number between 1 and 100\n` +
                `3. Make guesses: \`.guess 42\`\n` +
                `4. You'll get hints: "too low" or "too high"\n` +
                `5. Keep guessing until you find the number!\n` +
                `6. The number of attempts is shown when you win.`
            );
        }

        // Find existing game
        let gameKey = null;
        let game = null;
        for (let [key, g] of games.entries()) {
            if (key.startsWith(`guess-${chatId}:${senderId}`)) {
                gameKey = key;
                game = g;
                break;
            }
        }

        if (subCmd === 'start') {
            if (game) games.delete(gameKey);
            const newGame = new GuessNumber();
            const newKey = `guess-${chatId}:${senderId}-${Date.now()}`;
            games.set(newKey, newGame);
            return await reply(`🔢 *Guess the Number Started!*\n\nI'm thinking of a number between 1 and 100. Start guessing with \`.guess <number>\``);
        }

        if (!game) return await reply('❌ No game in progress. Start one with `.guess start`');

        // If the first argument is a number, treat as guess
        const guessNum = parseInt(subCmd);
        if (!isNaN(guessNum)) {
            const result = game.guess(guessNum);
            if (result.error) return await reply(`❌ ${result.error}`);

            if (result.result === 'correct') {
                games.delete(gameKey);
                return await reply(`🎉 *Correct!* You guessed the number in ${game.attempts} attempts.`);
            } else {
                return await reply(`Your guess is ${result.result}.`);
            }
        }

        await reply('❌ Unknown subcommand. Use `.guess guide` for help.');
    }
};
