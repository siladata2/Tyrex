/*****************************************************************************
 *                                                                           *
 *                     Developed By Abdul Rehman Rajpoot                     *
 *                     & Muzamil Khan                                        *
 *                                                                           *
 *****************************************************************************/

// ==================== Game Logic ====================
const symbols = ['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼']; // 8 pairs

class Memory {
    constructor() {
        // Create 4x4 board with pairs
        let cards = [...symbols.slice(0,8), ...symbols.slice(0,8)];
        this.board = this.shuffle(cards);
        this.revealed = Array(16).fill(false);
        this.matched = Array(16).fill(false);
        this.selected = null; // index of first card flipped
        this.gameOver = false;
    }

    shuffle(arr) {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    }

    flip(index) {
        if (this.gameOver) return { error: 'Game already ended' };
        if (index < 0 || index >= 16) return { error: 'Invalid card index (1-16)' };
        if (this.matched[index]) return { error: 'That card is already matched' };
        if (this.revealed[index]) return { error: 'Card already flipped' };

        if (this.selected === null) {
            // first card flipped
            this.revealed[index] = true;
            this.selected = index;
            return { success: true, state: 'first' };
        } else {
            // second card flipped
            this.revealed[index] = true;

            // Check match
            if (this.board[this.selected] === this.board[index]) {
                // Match found
                this.matched[this.selected] = true;
                this.matched[index] = true;
                this.revealed[this.selected] = true;
                this.revealed[index] = true;
                this.selected = null;

                // Check win
                if (this.matched.every(v => v)) {
                    this.gameOver = true;
                    return { success: true, win: true };
                }
                return { success: true, match: true };
            } else {
                // No match, will flip back after showing
                return { success: true, match: false, first: this.selected, second: index };
            }
        }
    }

    // Call after showing mismatch to flip back
    resetMismatch(first, second) {
        this.revealed[first] = false;
        this.revealed[second] = false;
        this.selected = null;
    }

    getDisplayBoard() {
        let str = '```\n    1   2   3   4\n';
        for (let r = 0; r < 4; r++) {
            str += ` ${r+1}  `;
            for (let c = 0; c < 4; c++) {
                const idx = r*4 + c;
                if (this.matched[idx]) {
                    str += this.board[idx] + '  ';
                } else if (this.revealed[idx]) {
                    str += this.board[idx] + '  ';
                } else {
                    str += '⬛  ';
                }
            }
            str += '\n';
        }
        str += '```';
        return str;
    }
}

// ==================== Storage ====================
const games = new Map(); // key = `memory-${chatId}:${player}`

module.exports = {
    command: 'memory',
    aliases: ['mem'],
    category: 'games',
    description: 'Flip cards to find matching pairs.',
    usage: 
        '.mem start                  – Start a new game\n' +
        '.mem flip <card>             – Flip a card (1-16, left to right, top to bottom)\n' +
        '.mem guide                    – Show game guide',

    async handler(sock, message, args, context = {}) {
        const chatId = context.chatId || message.key.remoteJid;
        const senderId = (context.senderId || message.key.participant || message.key.remoteJid).split(':')[0];
        const channelInfo = context.channelInfo || {};

        const reply = async (text) => 
            await sock.sendMessage(chatId, { text, ...channelInfo }, { quoted: message });

        if (args.length === 0) {
            return await reply(
                `🧠 *Memory Match Commands*\n\n` +
                `• \`.mem start\` – New game\n` +
                `• \`.mem flip <card>\` – Flip a card (1-16)\n` +
                `• \`.mem guide\` – Show guide`
            );
        }

        const subCmd = args[0].toLowerCase();

        if (subCmd === 'guide') {
            return await reply(
                `📖 *Memory Match Guide*\n\n` +
                `1. Start a game: \`.mem start\`\n` +
                `2. Cards are numbered 1-16 (left to right, top to bottom)\n` +
                `3. Flip two cards: \`.mem flip 5\` then \`.mem flip 8\`\n` +
                `4. If they match, they stay revealed\n` +
                `5. If not, they flip back after a short delay\n` +
                `6. Match all 8 pairs to win!`
            );
        }

        // Find existing game
        let gameKey = null;
        let game = null;
        for (let [key, g] of games.entries()) {
            if (key.startsWith(`memory-${chatId}:${senderId}`)) {
                gameKey = key;
                game = g;
                break;
            }
        }

        if (subCmd === 'start') {
            if (game) games.delete(gameKey);
            const newGame = new Memory();
            const newKey = `memory-${chatId}:${senderId}-${Date.now()}`;
            games.set(newKey, newGame);
            return await reply(
                `🧠 *Memory Match Started!*\n\n${newGame.getDisplayBoard()}\n\nFlip cards with \`.mem flip <card>\``
            );
        }

        if (!game) return await reply('❌ No game in progress. Start one with `.mem start`');

        if (subCmd === 'flip') {
            if (args.length < 2) return await reply('❌ Usage: `.mem flip <card>`');
            const card = parseInt(args[1]);
            if (isNaN(card) || card < 1 || card > 16) return await reply('❌ Card must be between 1 and 16.');

            const result = game.flip(card - 1);
            if (result.error) return await reply(`❌ ${result.error}`);

            if (result.win) {
                games.delete(gameKey);
                return await reply(`🎉 *You Win!*\n\n${game.getDisplayBoard()}`);
            }

            if (result.match === false) {
                // Show mismatch, then flip back after 2 seconds
                await reply(`No match!\n\n${game.getDisplayBoard()}`);
                setTimeout(() => {
                    game.resetMismatch(result.first, result.second);
                    sock.sendMessage(chatId, { text: game.getDisplayBoard(), ...channelInfo });
                }, 2000);
                return;
            }

            await reply(game.getDisplayBoard());
            return;
        }

        await reply('❌ Unknown subcommand. Use `.mem guide` for help.');
    }
};
