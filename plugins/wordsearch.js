/*****************************************************************************
 *                                                                           *
 *                     Developed By Abdul Rehman Rajpoot                     *
 *                                                            *
 *                                                                           *
 *****************************************************************************/

class WordSearch {
    constructor(size = 10) {
        this.size = size;
        this.grid = this.createEmptyGrid();
        this.words = [];
        this.foundWords = [];
        this.letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        this.gameOver = false;
    }

    createEmptyGrid() {
        return Array(this.size).fill().map(() => Array(this.size).fill(''));
    }

    addWord(word) {
        word = word.toUpperCase();
        if (word.length > this.size) return false;
        
        // Try to place horizontally or vertically
        const directions = [
            { dr: 0, dc: 1 }, // right
            { dr: 1, dc: 0 }  // down
        ];
        
        for (let attempt = 0; attempt < 100; attempt++) {
            const dir = directions[Math.floor(Math.random() * directions.length)];
            const maxRow = dir.dr === 0 ? this.size : this.size - word.length;
            const maxCol = dir.dc === 0 ? this.size - word.length : this.size;
            if (maxRow < 0 || maxCol < 0) continue;
            
            const r = Math.floor(Math.random() * maxRow);
            const c = Math.floor(Math.random() * maxCol);
            
            // Check if cells are empty or matching
            let conflict = false;
            for (let i = 0; i < word.length; i++) {
                const nr = r + i * dir.dr;
                const nc = c + i * dir.dc;
                if (this.grid[nr][nc] !== '' && this.grid[nr][nc] !== word[i]) {
                    conflict = true;
                    break;
                }
            }
            if (conflict) continue;
            
            // Place word
            for (let i = 0; i < word.length; i++) {
                const nr = r + i * dir.dr;
                const nc = c + i * dir.dc;
                this.grid[nr][nc] = word[i];
            }
            this.words.push(word);
            return true;
        }
        return false;
    }

    fillRemaining() {
        for (let r = 0; r < this.size; r++) {
            for (let c = 0; c < this.size; c++) {
                if (this.grid[r][c] === '') {
                    this.grid[r][c] = this.letters[Math.floor(Math.random() * this.letters.length)];
                }
            }
        }
    }

    findWord(word) {
        word = word.toUpperCase();
        if (this.foundWords.includes(word)) return false;
        if (!this.words.includes(word)) return false;
        
        // Check all directions
        const dirs = [
            [0,1], [1,0], [0,-1], [-1,0],
            [1,1], [1,-1], [-1,1], [-1,-1]
        ];
        
        for (let r = 0; r < this.size; r++) {
            for (let c = 0; c < this.size; c++) {
                for (let [dr, dc] of dirs) {
                    let found = true;
                    for (let i = 0; i < word.length; i++) {
                        const nr = r + i * dr;
                        const nc = c + i * dc;
                        if (nr < 0 || nr >= this.size || nc < 0 || nc >= this.size || this.grid[nr][nc] !== word[i]) {
                            found = false;
                            break;
                        }
                    }
                    if (found) {
                        this.foundWords.push(word);
                        return true;
                    }
                }
            }
        }
        return false;
    }

    getDisplayBoard() {
        let board = '```\n   ';
        for (let c = 0; c < this.size; c++) board += (c+1).toString().padStart(2, ' ') + ' ';
        board += '\n';
        for (let r = 0; r < this.size; r++) {
            board += (r+1).toString().padStart(2, ' ') + ' ';
            for (let c = 0; c < this.size; c++) {
                board += ' ' + this.grid[r][c] + ' ';
            }
            board += '\n';
        }
        board += '```\n\n';
        board += `Words to find: ${this.words.join(', ')}\n`;
        board += `Found: ${this.foundWords.join(', ') || 'None'}`;
        return board;
    }
}

const games = new Map(); // key = chatId:playerId

module.exports = {
    command: 'wordsearch',
    aliases: ['ws'],
    category: 'games',
    description: 'Find hidden words in a letter grid.',
    usage: 
        '.ws start [size]            – Start a new game (size 8-15)\n' +
        '.ws find <word>               – Try to find a word\n' +
        '.ws guide                       – Show game guide',

    async handler(sock, message, args, context = {}) {
        const chatId = context.chatId || message.key.remoteJid;
        const senderId = (context.senderId || message.key.participant || message.key.remoteJid).split(':')[0];
        const channelInfo = context.channelInfo || {};

        const reply = async (text) => 
            await sock.sendMessage(chatId, { text, ...channelInfo }, { quoted: message });

        if (args.length === 0) {
            return await reply(
                `🔍 *Word Search Commands*\n\n` +
                `• \`.ws start [size]\` – New game (size 8-15, default 10)\n` +
                `• \`.ws find <word>\` – Find a word\n` +
                `• \`.ws guide\` – Show guide`
            );
        }

        const subCmd = args[0].toLowerCase();
        const gameKey = `${chatId}:${senderId}`;
        let game = games.get(gameKey);

        if (subCmd === 'guide') {
            return await reply(
                `📖 *Word Search Guide*\n\n` +
                `1. Start a game: \`.ws start 10\`\n` +
                `2. A grid of letters will appear\n` +
                `3. Words are hidden horizontally, vertically, or diagonally\n` +
                `4. Use \`.ws find <word>\` to mark a word as found\n` +
                `5. Find all words to win!`
            );
        }

        if (subCmd === 'start') {
            if (game) games.delete(gameKey);
            const size = args.length > 1 ? parseInt(args[1]) : 10;
            if (isNaN(size) || size < 8 || size > 15) return await reply('❌ Size must be 8-15.');
            
            game = new WordSearch(size);
            // Add some words
            const wordList = ['DOG', 'CAT', 'BIRD', 'FISH', 'TREE', 'HOUSE', 'CAR', 'BOOK', 'PEN', 'SUN'];
            for (let w of wordList) {
                if (w.length <= size) game.addWord(w);
            }
            game.fillRemaining();
            games.set(gameKey, game);
            return await reply(game.getDisplayBoard());
        }

        if (!game) return await reply('❌ No game in progress. Start one with `.ws start`');

        if (subCmd === 'find') {
            if (args.length < 2) return await reply('❌ Usage: `.ws find <word>`');
            const word = args.slice(1).join('').toUpperCase();
            const found = game.findWord(word);
            if (!found) return await reply('❌ Word not found or already found.');
            
            if (game.foundWords.length === game.words.length) {
                await reply(`🎉 *You found all words!* 🎉\n\n${game.getDisplayBoard()}`);
                games.delete(gameKey);
            } else {
                await reply(`✅ Found *${word}*!\n\n${game.getDisplayBoard()}`);
            }
            return;
        }

        await reply('❌ Unknown subcommand. Use `.ws guide` for help.');
    }
};
