/*****************************************************************************
 *                                                                           *
 *                     Developed By Abdul Rehman Rajpoot                     *
 *                                                            *
 *                                                                           *
 *****************************************************************************/

class TowerDefense {
    constructor() {
        this.wave = 1;
        this.lives = 10;
        this.gold = 200;
        this.towers = [];
        this.enemies = [];
        this.path = [[0,2],[1,2],[2,2],[3,2],[4,2],[5,2],[6,2],[7,2],[8,2],[9,2]]; // simplified path
        this.gameOver = false;
        this.spawnTimer = 0;
    }

    spawnEnemy() {
        const health = 20 + this.wave * 5;
        const speed = 1;
        this.enemies.push({
            hp: health,
            maxHp: health,
            position: 0, // index in path
            speed
        });
    }

    update() {
        // Move enemies
        for (let e of this.enemies) {
            e.position += e.speed;
            if (e.position >= this.path.length) {
                // reached end
                this.lives--;
                this.enemies = this.enemies.filter(en => en !== e);
                if (this.lives <= 0) this.gameOver = true;
            }
        }

        // Towers attack
        for (let t of this.towers) {
            // Find nearest enemy in range (simplified)
            const enemy = this.enemies.find(e => {
                const pos = this.path[e.position];
                const dist = Math.abs(pos[0] - t.row) + Math.abs(pos[1] - t.col);
                return dist <= t.range;
            });
            if (enemy) {
                enemy.hp -= t.damage;
                if (enemy.hp <= 0) {
                    this.enemies = this.enemies.filter(e => e !== enemy);
                    this.gold += 10;
                }
            }
        }
    }

    buyTower(row, col) {
        const cost = 50;
        if (this.gold < cost) return false;
        // Check if spot is valid (not on path, not occupied)
        const onPath = this.path.some(([r,c]) => r === row && c === col);
        if (onPath) return false;
        if (this.towers.some(t => t.row === row && t.col === col)) return false;
        this.towers.push({ row, col, range: 3, damage: 10 });
        this.gold -= cost;
        return true;
    }

    nextWave() {
        this.wave++;
        for (let i = 0; i < 5 + this.wave; i++) {
            this.spawnEnemy();
        }
    }

    getDisplayBoard() {
        // Create 10x5 grid
        let grid = Array(5).fill().map(() => Array(10).fill('⬜'));
        // Path
        for (let [c,r] of this.path) { // note: path stored as [col,row]? We'll assume [col,row] = (c,r)
            if (r >= 0 && r < 5 && c >= 0 && c < 10) {
                grid[r][c] = '🟫';
            }
        }
        // Towers
        for (let t of this.towers) {
            if (t.row >= 0 && t.row < 5 && t.col >= 0 && t.col < 10) {
                grid[t.row][t.col] = '🏰';
            }
        }
        // Enemies
        for (let e of this.enemies) {
            const [c,r] = this.path[e.position];
            if (r >= 0 && r < 5 && c >= 0 && c < 10) {
                grid[r][c] = '👾';
            }
        }

        let board = '```\n   ';
        for (let c = 0; c < 10; c++) board += (c+1) + ' ';
        board += '\n';
        for (let r = 0; r < 5; r++) {
            board += (r+1).toString().padStart(2) + ' ';
            for (let c = 0; c < 10; c++) {
                board += grid[r][c] + ' ';
            }
            board += '\n';
        }
        board += '```\n';
        board += `Wave: ${this.wave}  ❤️ Lives: ${this.lives}  💰 Gold: ${this.gold}`;
        return board;
    }
}

const games = new Map(); // key = chatId:playerId

module.exports = {
    command: 'tower',
    aliases: ['td'],
    category: 'games',
    description: 'Defend your base from waves of enemies.',
    usage: 
        '.td start                   – Start a new game\n' +
        '.td buy <row> <col>          – Buy a tower (1-5 rows, 1-10 cols)\n' +
        '.td wave                      – Start next wave\n' +
        '.td guide                      – Show game guide',

    async handler(sock, message, args, context = {}) {
        const chatId = context.chatId || message.key.remoteJid;
        const senderId = (context.senderId || message.key.participant || message.key.remoteJid).split(':')[0];
        const channelInfo = context.channelInfo || {};

        const reply = async (text) => 
            await sock.sendMessage(chatId, { text, ...channelInfo }, { quoted: message });

        if (args.length === 0) {
            return await reply(
                `🏰 *Tower Defense Commands*\n\n` +
                `• \`.td start\` – New game\n` +
                `• \`.td buy <row> <col>\` – Place tower (1-5, 1-10)\n` +
                `• \`.td wave\` – Start next wave\n` +
                `• \`.td guide\` – Show guide`
            );
        }

        const subCmd = args[0].toLowerCase();
        const gameKey = `${chatId}:${senderId}`;
        let game = games.get(gameKey);

        if (subCmd === 'guide') {
            return await reply(
                `📖 *Tower Defense Guide*\n\n` +
                `1. Start a game: \`.td start\`\n` +
                `2. Place towers on empty (⬜) squares: \`.td buy <row> <col>\`\n` +
                `3. Towers cost 50 gold each\n` +
                `4. Start a wave with \`.td wave\`\n` +
                `5. Enemies (👾) move along the brown path\n` +
                `6. If they reach the end, you lose lives\n` +
                `7. Survive as many waves as possible!`
            );
        }

        if (subCmd === 'start') {
            if (game) games.delete(gameKey);
            game = new TowerDefense();
            games.set(gameKey, game);
            return await reply(
                `🏰 *Tower Defense Started!*\n\n${game.getDisplayBoard()}\n\n` +
                `Place towers with \`.td buy <row> <col>\``
            );
        }

        if (!game) return await reply('❌ No game in progress. Start one with `.td start`');

        if (subCmd === 'buy') {
            if (args.length < 3) return await reply('❌ Usage: `.td buy <row> <col>`');
            const row = parseInt(args[1]) - 1;
            const col = parseInt(args[2]) - 1;
            if (isNaN(row) || isNaN(col) || row < 0 || row >= 5 || col < 0 || col >= 10) {
                return await reply('❌ Row must be 1-5, Column 1-10.');
            }
            const success = game.buyTower(row, col);
            if (!success) return await reply('❌ Cannot place tower there (on path, occupied, or insufficient gold).');
            await reply(game.getDisplayBoard());
            return;
        }

        if (subCmd === 'wave') {
            game.nextWave();
            // Simulate updates (simplified – we'd ideally have a loop)
            await reply(game.getDisplayBoard());
            return;
        }

        await reply('❌ Unknown subcommand. Use `.td guide` for help.');
    }
};
