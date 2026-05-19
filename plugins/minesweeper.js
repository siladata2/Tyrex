/*****************************************************************************
 *                                                                           *
 *                     Developed By Abdul Rehman Rajpoot                     *
 *                     & Muzamil Khan                                        *
 *                                                                           *
 *****************************************************************************/

// ==================== Game Logic ====================
class Minesweeper {
    constructor(size = 5, mineCount = 5) {
        this.size = size;
        this.mineCount = mineCount;
        this.board = this.createBoard();
        this.revealed = Array(size).fill().map(() => Array(size).fill(false));
        this.flagged = Array(size).fill().map(() => Array(size).fill(false));
        this.gameOver = false;
        this.won = false;
    }

    createBoard() {
        const board = Array(this.size).fill().map(() => Array(this.size).fill(' '));
        let placed = 0;
        while (placed < this.mineCount) {
            const r = Math.floor(Math.random() * this.size);
            const c = Math.floor(Math.random() * this.size);
            if (board[r][c] !== '💣') {
                board[r][c] = '💣';
                placed++;
            }
        }
        return board;
    }

    countAdjacentMines(r, c) {
        let count = 0;
        for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
                if (dr === 0 && dc === 0) continue;
                const nr = r + dr, nc = c + dc;
                if (nr >= 0 && nr < this.size && nc >= 0 && nc < this.size && this.board[nr][nc] === '💣') count++;
            }
        }
        return count;
    }

    reveal(r, c) {
        if (this.gameOver || this.won) return { error: 'Game already ended' };
        if (this.revealed[r][c]) return { error: 'Cell already revealed' };
        if (this.flagged[r][c]) return { error: 'Cell is flagged. Unflag first.' };

        if (this.board[r][c] === '💣') {
            this.gameOver = true;
            return { mine: true };
        }

        const adjacent = this.countAdjacentMines(r, c);
        this.board[r][c] = adjacent === 0 ? ' ' : adjacent.toString();
        this.revealed[r][c] = true;

        if (adjacent === 0) {
            // flood fill
            for (let dr = -1; dr <= 1; dr++) {
                for (let dc = -1; dc <= 1; dc++) {
                    if (dr === 0 && dc === 0) continue;
                    const nr = r + dr, nc = c + dc;
                    if (nr >= 0 && nr < this.size && nc >= 0 && nc < this.size && !this.revealed[nr][nc] && this.board[nr][nc] !== '💣') {
                        this.reveal(nr, nc);
                    }
                }
            }
        }

        // Check win: all non-mine cells revealed
        let allRevealed = true;
        for (let r = 0; r < this.size; r++) {
            for (let c = 0; c < this.size; c++) {
                if (this.board[r][c] !== '💣' && !this.revealed[r][c]) {
                    allRevealed = false;
                    break;
                }
            }
        }
        if (allRevealed) {
            this.won = true;
        }

        return { success: true };
    }

    flag(r, c) {
        if (this.gameOver || this.won) return { error: 'Game already ended' };
        if (this.revealed[r][c]) return { error: 'Cannot flag revealed cell' };
        this.flagged[r][c] = !this.flagged[r][c];
        return { success: true };
    }

    // Display board during gameplay (hides mines)
    getDisplayBoard() {
        let str = '```\n   ';
        for (let c = 0; c < this.size; c++) {
            str += ` ${c+1} `;
        }
        str += '\n';
        for (let r = 0; r < this.size; r++) {
            str += ` ${r+1} `;
            for (let c = 0; c < this.size; c++) {
                if (this.flagged[r][c]) {
                    str += '🚩';
                } else if (this.revealed[r][c]) {
                    const cell = this.board[r][c];
                    if (cell === ' ') {
                        str += '⬜'; // empty revealed
                    } else if (cell === '💣') {
                        str += '💣'; // should never happen during gameplay
                    } else {
                        const numEmoji = ['1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣'];
                        str += numEmoji[parseInt(cell)-1];
                    }
                } else {
                    str += '⬛'; // unrevealed
                }
                str += ' ';
            }
            str += '\n';
        }
        str += '```';
        return str;
    }

    // Final board when game ends (reveals everything)
    getFinalBoard() {
        let str = '```\n   ';
        for (let c = 0; c < this.size; c++) {
            str += ` ${c+1} `;
        }
        str += '\n';
        for (let r = 0; r < this.size; r++) {
            str += ` ${r+1} `;
            for (let c = 0; c < this.size; c++) {
                const cell = this.board[r][c];
                if (cell === '💣') {
                    str += '💣';
                } else if (this.revealed[r][c]) {
                    if (cell === ' ') {
                        str += '⬜';
                    } else {
                        const numEmoji = ['1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣'];
                        str += numEmoji[parseInt(cell)-1];
                    }
                } else {
                    str += '⬛'; // shouldn't happen if we reveal all, but just in case
                }
                str += ' ';
            }
            str += '\n';
        }
        str += '```';
        return str;
    }

    getRemainingMines() {
        let flagged = 0;
        for (let r = 0; r < this.size; r++) {
            for (let c = 0; c < this.size; c++) {
                if (this.flagged[r][c]) flagged++;
            }
        }
        return this.mineCount - flagged;
    }
}

// ==================== Storage ====================
const games = new Map(); // key = `ms-${chatId}:${player}` (only one game per player at a time)

module.exports = {
    command: 'minesweeper',
    aliases: ['ms'],
    category: 'games',
    description: 'Play Minesweeper (5x5 with 5 mines).',
    usage: 
        '.ms start                  – Start a new game\n' +
        '.ms open <row> <col>       – Reveal a cell (1-5)\n' +
        '.ms flag <row> <col>       – Place/remove a flag\n' +
        '.ms guide                   – Show game guide',
    groupOnly: true,

    async handler(sock, message, args, context = {}) {
        const chatId = context.chatId || message.key.remoteJid;
        const senderId = (context.senderId || message.key.participant || message.key.remoteJid).split(':')[0];
        const channelInfo = context.channelInfo || {};

        const reply = async (text, mentions = []) => 
            await sock.sendMessage(chatId, { text, mentions, ...channelInfo }, { quoted: message });

        if (args.length === 0) {
            return await reply(
                `💣 *Minesweeper Commands*\n\n` +
                `• \`.ms start\` – Start a new game\n` +
                `• \`.ms open <row> <col>\` – Reveal a cell (1-5)\n` +
                `• \`.ms flag <row> <col>\` – Place/remove a flag\n` +
                `• \`.ms guide\` – Show game guide`
            );
        }

        const subCmd = args[0].toLowerCase();

        if (subCmd === 'guide') {
            return await reply(
                `📖 *Minesweeper Guide*\n\n` +
                `1. Start a game: \`.ms start\`\n` +
                `2. Reveal cells with \`.ms open <row> <col>\` (rows/cols 1-5)\n` +
                `3. Flag potential mines with \`.ms flag <row> <col>\`\n` +
                `4. Numbers show adjacent mines\n` +
                `5. Reveal all safe cells to win\n` +
                `6. Hit a mine and you lose!\n` +
                `7. Remaining mines are shown at the bottom.`
            );
        }

        // Find existing game for this player
        let gameKey = null;
        let game = null;
        for (let [key, g] of games.entries()) {
            if (key.startsWith(`ms-${chatId}:${senderId}`)) {
                gameKey = key;
                game = g;
                break;
            }
        }

        if (subCmd === 'start') {
            if (game) {
                games.delete(gameKey);
            }
            const newGame = new Minesweeper();
            const newKey = `ms-${chatId}:${senderId}-${Date.now()}`;
            games.set(newKey, newGame);

            await reply(
                `💣 *Minesweeper Started!*\n\n` +
                `${newGame.getDisplayBoard()}\n\n` +
                `Mines left: ${newGame.getRemainingMines()}\n\n` +
                `Commands:\n` +
                `• \`.ms open <row> <col>\` – reveal\n` +
                `• \`.ms flag <row> <col>\` – flag/unflag`
            );
            return;
        }

        if (!game) {
            return await reply('❌ No game in progress. Start one with `.ms start`');
        }

        if (subCmd === 'open') {
            if (args.length < 3) return await reply('❌ Usage: `.ms open <row> <col>`');
            const row = parseInt(args[1]) - 1;
            const col = parseInt(args[2]) - 1;
            if (isNaN(row) || isNaN(col) || row < 0 || row >= 5 || col < 0 || col >= 5) {
                return await reply('❌ Coordinates must be numbers between 1 and 5.');
            }

            const result = game.reveal(row, col);
            if (result.error) {
                return await reply(`❌ ${result.error}`);
            }

            if (result.mine) {
                games.delete(gameKey);
                return await reply(
                    `💥 *Boom!* You hit a mine!\n\n` +
                    `${game.getFinalBoard()}\n\nGame over.`
                );
            }

            if (game.won) {
                games.delete(gameKey);
                return await reply(
                    `🎉 *You Win!*\n\n${game.getFinalBoard()}\n\nCongratulations!`
                );
            }

            await reply(
                `${game.getDisplayBoard()}\n\n` +
                `Mines left: ${game.getRemainingMines()}\n\n` +
                `Revealed (${args[1]},${args[2]}) – ${game.countAdjacentMines(row, col)} adjacent mines.`
            );
            return;
        }

        if (subCmd === 'flag') {
            if (args.length < 3) return await reply('❌ Usage: `.ms flag <row> <col>`');
            const row = parseInt(args[1]) - 1;
            const col = parseInt(args[2]) - 1;
            if (isNaN(row) || isNaN(col) || row < 0 || row >= 5 || col < 0 || col >= 5) {
                return await reply('❌ Coordinates must be numbers between 1 and 5.');
            }

            const result = game.flag(row, col);
            if (result.error) {
                return await reply(`❌ ${result.error}`);
            }

            await reply(
                `${game.getDisplayBoard()}\n\n` +
                `Mines left: ${game.getRemainingMines()}\n\n` +
                `Flag toggled at (${args[1]},${args[2]}).`
            );
            return;
        }

        await reply('❌ Unknown subcommand. Use `.ms guide` for help.');
    }
};
