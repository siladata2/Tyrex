/*****************************************************************************
 *                                                                           *
 *                     Developed By Abdul Rehman Rajpoot                     *
 *                     & Muzamil Khan                                        *
 *                                                                           *
 *****************************************************************************/

class MemoryPuzzle {
    constructor(size = 4) {
        this.size = size;
        this.cards = this.createCards();
        this.revealed = Array(size).fill().map(() => Array(size).fill(false));
        this.matched = Array(size).fill().map(() => Array(size).fill(false));
        this.selected = null; // { r, c }
        this.moves = 0;
        this.startTime = Date.now();
        this.gameOver = false;
    }

    createCards() {
        const symbols = ['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐸','🐧','🐦','🐤','🐴','🦄','🐲'];
        const pairs = this.size * this.size / 2;
        const selected = symbols.slice(0, pairs);
        const deck = [...selected, ...selected];
        return this.shuffle(deck);
    }

    shuffle(arr) {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        // Convert to 2D
        const grid = [];
        for (let r = 0; r < this.size; r++) {
            grid.push(arr.slice(r * this.size, (r+1) * this.size));
        }
        return grid;
    }

    flip(r, c) {
        if (this.gameOver) return { error: 'Game already ended' };
        if (this.matched[r][c]) return { error: 'Already matched' };
        if (this.revealed[r][c]) return { error: 'Already flipped' };

        this.revealed[r][c] = true;
        this.moves++;

        if (this.selected) {
            // Second card
            const first = this.selected;
            const second = { r, c };
            const match = this.cards[first.r][first.c] === this.cards[second.r][second.c];

            if (match) {
                this.matched[first.r][first.c] = true;
                this.matched[second.r][second.c] = true;
                this.selected = null;

                // Check win
                let allMatched = true;
                for (let r = 0; r < this.size; r++) {
                    for (let c = 0; c < this.size; c++) {
                        if (!this.matched[r][c]) allMatched = false;
                    }
                }
                if (allMatched) {
                    this.gameOver = true;
                    return { match: true, win: true, moves: this.moves, time: (Date.now() - this.startTime)/1000 };
                }
                return { match: true };
            } else {
                // No match, will hide after delay
                return { match: false, first, second };
            }
        } else {
            // First card
            this.selected = { r, c };
            return { first: true };
        }
    }

    resetMismatch(first, second) {
        this.revealed[first.r][first.c] = false;
        this.revealed[second.r][second.c] = false;
        this.selected = null;
    }

    getDisplayBoard() {
        let board = '```\n   ';
        for (let c = 0; c < this.size; c++) board += (c+1) + ' ';
        board += '\n';
        for (let r = 0; r < this.size; r++) {
            board += (r+1).toString().padStart(2) + ' ';
            for (let c = 0; c < this.size; c++) {
                if (this.matched[r][c]) {
                    board += this.cards[r][c] + ' ';
                } else if (this.revealed[r][c]) {
                    board += this.cards[r][c] + ' ';
                } else {
                    board += '⬛ ';
                }
            }
            board += '\n';
        }
        board += '```';
        board += `\nMoves: ${this.moves}  Time: ${Math.floor((Date.now() - this.startTime)/1000)}s`;
        return board;
    }
}

const games = new Map(); // key = chatId:playerId

module.exports = {
    command: 'memory',
    aliases: ['mem'],
    category: 'games',
    description: 'Test your memory by matching pairs.',
    usage: 
        '.mem start [size]           – Start new game (size 4 or 6)\n' +
        '.mem flip <row> <col>        – Flip a card\n' +
        '.mem guide                     – Show game guide',

    async handler(sock, message, args, context = {}) {
        const chatId = context.chatId || message.key.remoteJid;
        const senderId = (context.senderId || message.key.participant || message.key.remoteJid).split(':')[0];
        const channelInfo = context.channelInfo || {};

        const reply = async (text) => 
            await sock.sendMessage(chatId, { text, ...channelInfo }, { quoted: message });

        if (args.length === 0) {
            return await reply(
                `🧩 *Memory Puzzle Commands*\n\n` +
                `• \`.mem start [size]\` – New game (4 or 6)\n` +
                `• \`.mem flip <row> <col>\` – Flip card\n` +
                `• \`.mem guide\` – Show guide`
            );
        }

        const subCmd = args[0].toLowerCase();
        const gameKey = `${chatId}:${senderId}`;
        let game = games.get(gameKey);

        if (subCmd === 'guide') {
            return await reply(
                `📖 *Memory Puzzle Guide*\n\n` +
                `1. Start a game: \`.mem start 4\` (4x4 or 6x6)\n` +
                `2. Flip two cards to find matching pairs\n` +
                `3. If they match, they stay revealed\n` +
                `4. If not, they flip back after a short delay\n` +
                `5. Match all pairs to win!\n` +
                `6. Try to do it in as few moves as possible.`
            );
        }

        if (subCmd === 'start') {
            if (game) games.delete(gameKey);
            const size = args.length > 1 ? parseInt(args[1]) : 4;
            if (size !== 4 && size !== 6) return await reply('❌ Size must be 4 or 6.');
            game = new MemoryPuzzle(size);
            games.set(gameKey, game);
            return await reply(
                `🧩 *Memory Puzzle Started!*\n\n${game.getDisplayBoard()}\n\nFlip cards with \`.mem flip <row> <col>\``
            );
        }

        if (!game) return await reply('❌ No game in progress. Start one with `.mem start`');

        if (subCmd === 'flip') {
            if (args.length < 3) return await reply('❌ Usage: `.mem flip <row> <col>`');
            const row = parseInt(args[1]) - 1;
            const col = parseInt(args[2]) - 1;
            if (isNaN(row) || isNaN(col) || row < 0 || row >= game.size || col < 0 || col >= game.size) {
                return await reply(`❌ Coordinates must be 1-${game.size}.`);
            }

            const result = game.flip(row, col);
            if (result.error) return await reply(`❌ ${result.error}`);

            if (result.win) {
                await reply(
                    `🎉 *You Win!*\n\n${game.getDisplayBoard()}\n\n` +
                    `Moves: ${result.moves}  Time: ${result.time.toFixed(1)}s`
                );
                games.delete(gameKey);
                return;
            }

            if (result.match === false) {
                // Show mismatch, then flip back
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
