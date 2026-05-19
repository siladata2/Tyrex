/*****************************************************************************
 *                                                                           *
 *                     Developed By Abdul Rehman Rajpoot                     *
 *                                                            *
 *                                                                           *
 *****************************************************************************/

// ==================== Game Logic ====================
class Twenty48 {
    constructor() {
        this.board = Array(4).fill().map(() => Array(4).fill(0));
        this.addRandomTile();
        this.addRandomTile();
        this.gameOver = false;
        this.won = false;
    }

    addRandomTile() {
        const empty = [];
        for (let r = 0; r < 4; r++) {
            for (let c = 0; c < 4; c++) {
                if (this.board[r][c] === 0) empty.push([r, c]);
            }
        }
        if (empty.length === 0) return;
        const [r, c] = empty[Math.floor(Math.random() * empty.length)];
        this.board[r][c] = Math.random() < 0.9 ? 2 : 4;
    }

    move(direction) {
        if (this.gameOver || this.won) return { error: 'Game already ended' };

        // Helper to rotate board
        const rotate = (board) => {
            const newBoard = Array(4).fill().map(() => Array(4).fill(0));
            for (let r = 0; r < 4; r++) {
                for (let c = 0; c < 4; c++) {
                    newBoard[c][3 - r] = board[r][c];
                }
            }
            return newBoard;
        };

        const moveLeft = (board) => {
            let changed = false;
            for (let r = 0; r < 4; r++) {
                let row = board[r].filter(v => v !== 0);
                for (let i = 0; i < row.length - 1; i++) {
                    if (row[i] === row[i + 1]) {
                        row[i] *= 2;
                        row.splice(i + 1, 1);
                        changed = true;
                    }
                }
                while (row.length < 4) row.push(0);
                if (board[r].join(',') !== row.join(',')) changed = true;
                board[r] = row;
            }
            return changed;
        };

        let changed = false;
        let newBoard = this.board.map(row => [...row]);

        if (direction === 'left') {
            changed = moveLeft(newBoard);
        } else if (direction === 'right') {
            newBoard = newBoard.map(row => row.reverse());
            changed = moveLeft(newBoard);
            newBoard = newBoard.map(row => row.reverse());
        } else if (direction === 'up') {
            newBoard = rotate(rotate(rotate(newBoard))); // rotate to left orientation
            changed = moveLeft(newBoard);
            newBoard = rotate(newBoard); // rotate back
        } else if (direction === 'down') {
            newBoard = rotate(newBoard);
            changed = moveLeft(newBoard);
            newBoard = rotate(rotate(rotate(newBoard)));
        }

        if (!changed) return { success: true, noMove: true };

        this.board = newBoard;
        this.addRandomTile();

        // Check win (2048 tile present)
        for (let r = 0; r < 4; r++) {
            for (let c = 0; c < 4; c++) {
                if (this.board[r][c] === 2048) {
                    this.won = true;
                    return { success: true, win: true };
                }
            }
        }

        // Check game over (no empty cells and no adjacent equal)
        let hasEmpty = false;
        for (let r = 0; r < 4; r++) {
            for (let c = 0; c < 4; c++) {
                if (this.board[r][c] === 0) hasEmpty = true;
            }
        }
        if (!hasEmpty) {
            // Check for possible merges
            let possible = false;
            for (let r = 0; r < 4; r++) {
                for (let c = 0; c < 3; c++) {
                    if (this.board[r][c] === this.board[r][c+1]) possible = true;
                }
            }
            for (let c = 0; c < 4; c++) {
                for (let r = 0; r < 3; r++) {
                    if (this.board[r][c] === this.board[r+1][c]) possible = true;
                }
            }
            if (!possible) this.gameOver = true;
        }

        return { success: true };
    }

    getDisplayBoard() {
        const numEmoji = ['0️⃣','2️⃣','4️⃣','8️⃣','🔟','💯','🎲']; // simplified
        const getEmoji = (val) => {
            if (val === 0) return '⬛';
            const map = { 2:'2️⃣',4:'4️⃣',8:'8️⃣',16:'🔟',32:'💯',64:'🎲',128:'1️⃣2️⃣8️⃣',256:'2️⃣5️⃣6️⃣',512:'5️⃣1️⃣2️⃣',1024:'1️⃣0️⃣2️⃣4️⃣',2048:'🏆' };
            return map[val] || val.toString();
        };
        let str = '```\n';
        for (let r = 0; r < 4; r++) {
            for (let c = 0; c < 4; c++) {
                str += getEmoji(this.board[r][c]) + ' ';
            }
            str += '\n';
        }
        str += '```';
        return str;
    }
}

// ==================== Storage ====================
const games = new Map(); // key = `2048-${chatId}:${player}`

module.exports = {
    command: '2048',
    aliases: ['twenty48'],
    category: 'games',
    description: 'Slide tiles to combine and reach 2048.',
    usage: 
        '.2048 start                  – Start a new game\n' +
        '.2048 <left|right|up|down>   – Move tiles\n' +
        '.2048 guide                   – Show game guide',

    async handler(sock, message, args, context = {}) {
        const chatId = context.chatId || message.key.remoteJid;
        const senderId = (context.senderId || message.key.participant || message.key.remoteJid).split(':')[0];
        const channelInfo = context.channelInfo || {};

        const reply = async (text) => 
            await sock.sendMessage(chatId, { text, ...channelInfo }, { quoted: message });

        if (args.length === 0) {
            return await reply(
                `🎲 *2048 Commands*\n\n` +
                `• \`.2048 start\` – New game\n` +
                `• \`.2048 left\`, \`.2048 right\`, \`.2048 up\`, \`.2048 down\` – Move\n` +
                `• \`.2048 guide\` – Show guide`
            );
        }

        const subCmd = args[0].toLowerCase();

        if (subCmd === 'guide') {
            return await reply(
                `📖 *2048 Guide*\n\n` +
                `1. Start a game: \`.2048 start\`\n` +
                `2. Use arrow commands to slide all tiles:\n` +
                `   \`.2048 left\`, \`.2048 right\`, \`.2048 up\`, \`.2048 down\`\n` +
                `3. Tiles with the same number merge when they collide\n` +
                `4. After each move, a new 2 or 4 appears\n` +
                `5. Aim to create a tile with 2048!\n` +
                `6. Game ends when no moves are possible.`
            );
        }

        // Find existing game
        let gameKey = null;
        let game = null;
        for (let [key, g] of games.entries()) {
            if (key.startsWith(`2048-${chatId}:${senderId}`)) {
                gameKey = key;
                game = g;
                break;
            }
        }

        if (subCmd === 'start') {
            if (game) games.delete(gameKey);
            const newGame = new Twenty48();
            const newKey = `2048-${chatId}:${senderId}-${Date.now()}`;
            games.set(newKey, newGame);
            return await reply(
                `🎲 *2048 Started!*\n\n${newGame.getDisplayBoard()}\n\nMove with \`.2048 left/right/up/down\``
            );
        }

        if (!game) return await reply('❌ No game in progress. Start one with `.2048 start`');

        const directions = ['left', 'right', 'up', 'down'];
        if (directions.includes(subCmd)) {
            const result = game.move(subCmd);
            if (result.error) return await reply(`❌ ${result.error}`);
            if (result.noMove) return await reply('No tiles moved.');

            if (result.win) {
                games.delete(gameKey);
                return await reply(`🎉 *You Win!* You reached 2048!\n\n${game.getDisplayBoard()}`);
            }
            if (game.gameOver) {
                games.delete(gameKey);
                return await reply(`💀 *Game Over!* No moves left.\n\n${game.getDisplayBoard()}`);
            }

            await reply(game.getDisplayBoard());
            return;
        }

        await reply('❌ Unknown subcommand. Use `.2048 guide` for help.');
    }
};
