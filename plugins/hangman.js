/*****************************************************************************
 *                                                                           *
 *                     Developed By Abdul Rehman Rajpoot                     *
 *                     & Muzamil Khan                                        *
 *                                                                           *
 *****************************************************************************/

// ==================== Game Logic ====================
const words = ['apple', 'banana', 'cherry', 'dog', 'elephant', 'flower', 'guitar', 'house', 'ice', 'jungle'];

class Hangman {
    constructor() {
        this.word = words[Math.floor(Math.random() * words.length)].toUpperCase();
        this.guessed = new Set();
        this.remainingAttempts = 6;
        this.gameOver = false;
        this.won = false;
    }

    guess(letter) {
        if (this.gameOver || this.won) return { error: 'Game already ended' };
        letter = letter.toUpperCase();
        if (!/^[A-Z]$/.test(letter)) return { error: 'Please guess a single letter A-Z' };
        if (this.guessed.has(letter)) return { error: 'You already guessed that letter' };

        this.guessed.add(letter);
        if (!this.word.includes(letter)) {
            this.remainingAttempts--;
        }

        // Check win
        const wordLetters = new Set(this.word);
        let allGuessed = true;
        for (let l of wordLetters) {
            if (!this.guessed.has(l)) {
                allGuessed = false;
                break;
            }
        }
        if (allGuessed) {
            this.won = true;
        }

        if (this.remainingAttempts <= 0) {
            this.gameOver = true;
        }

        return { success: true };
    }

    getDisplayBoard() {
        const hangmanStages = [
            '```\n  +---+\n  |   |\n      |\n      |\n      |\n      |\n=========```',
            '```\n  +---+\n  |   |\n  O   |\n      |\n      |\n      |\n=========```',
            '```\n  +---+\n  |   |\n  O   |\n  |   |\n      |\n      |\n=========```',
            '```\n  +---+\n  |   |\n  O   |\n /|   |\n      |\n      |\n=========```',
            '```\n  +---+\n  |   |\n  O   |\n /|\\  |\n      |\n      |\n=========```',
            '```\n  +---+\n  |   |\n  O   |\n /|\\  |\n /    |\n      |\n=========```',
            '```\n  +---+\n  |   |\n  O   |\n /|\\  |\n / \\  |\n      |\n=========```'
        ];
        const stage = 6 - this.remainingAttempts;
        let display = hangmanStages[stage] + '\n\nWord: ';
        for (let char of this.word) {
            display += this.guessed.has(char) ? char + ' ' : '_ ';
        }
        display += `\nGuessed: ${Array.from(this.guessed).join(', ')}`;
        display += `\nAttempts left: ${this.remainingAttempts}`;
        return display;
    }
}

// ==================== Storage ====================
const games = new Map(); // key = `hangman-${chatId}:${player}`

module.exports = {
    command: 'hangman',
    aliases: ['hm'],
    category: 'games',
    description: 'Guess the word letter by letter.',
    usage: 
        '.hm start                  – Start a new game\n' +
        '.hm guess <letter>          – Guess a letter\n' +
        '.hm guide                    – Show game guide',

    async handler(sock, message, args, context = {}) {
        const chatId = context.chatId || message.key.remoteJid;
        const senderId = (context.senderId || message.key.participant || message.key.remoteJid).split(':')[0];
        const channelInfo = context.channelInfo || {};

        const reply = async (text) => 
            await sock.sendMessage(chatId, { text, ...channelInfo }, { quoted: message });

        if (args.length === 0) {
            return await reply(
                `🎯 *Hangman Commands*\n\n` +
                `• \`.hm start\` – New game\n` +
                `• \`.hm guess <letter>\` – Guess a letter\n` +
                `• \`.hm guide\` – Show guide`
            );
        }

        const subCmd = args[0].toLowerCase();

        if (subCmd === 'guide') {
            return await reply(
                `📖 *Hangman Guide*\n\n` +
                `1. Start a game: \`.hm start\`\n` +
                `2. Guess letters one at a time: \`.hm guess a\`\n` +
                `3. Each wrong guess adds a part to the hangman\n` +
                `4. Guess the whole word before the hangman is complete!\n` +
                `5. Letters already guessed are shown.`
            );
        }

        // Find existing game
        let gameKey = null;
        let game = null;
        for (let [key, g] of games.entries()) {
            if (key.startsWith(`hangman-${chatId}:${senderId}`)) {
                gameKey = key;
                game = g;
                break;
            }
        }

        if (subCmd === 'start') {
            if (game) games.delete(gameKey);
            const newGame = new Hangman();
            const newKey = `hangman-${chatId}:${senderId}-${Date.now()}`;
            games.set(newKey, newGame);
            return await reply(
                `🎯 *Hangman Started!*\n\n${newGame.getDisplayBoard()}\n\nStart guessing with \`.hm guess <letter>\``
            );
        }

        if (!game) return await reply('❌ No game in progress. Start one with `.hm start`');

        if (subCmd === 'guess') {
            if (args.length < 2) return await reply('❌ Usage: `.hm guess <letter>`');
            const letter = args[1];
            const result = game.guess(letter);
            if (result.error) return await reply(`❌ ${result.error}`);

            if (game.won) {
                games.delete(gameKey);
                return await reply(`🎉 *You Win!*\n\nThe word was: ${game.word}\n\n${game.getDisplayBoard()}`);
            }
            if (game.gameOver) {
                games.delete(gameKey);
                return await reply(`💀 *Game Over!* The word was: ${game.word}\n\n${game.getDisplayBoard()}`);
            }

            await reply(game.getDisplayBoard());
            return;
        }

        await reply('❌ Unknown subcommand. Use `.hm guide` for help.');
    }
};
