/*****************************************************************************
 *                                                                           *
 *                     Developed By Abdul Rehman Rajpoot                     *
 *                     & Muzamil Khan                                        *
 *                                                                           *
 *****************************************************************************/

// ==================== Game Logic ====================
class RPGAdventure {
    constructor(player) {
        this.player = player;
        this.level = 1;
        this.exp = 0;
        this.hp = 100;
        this.maxHp = 100;
        this.gold = 50;
        this.inventory = {
            'potion': 3,
            'sword': 1,
            'shield': 1
        };
        this.currentEnemy = null;
        this.inCombat = false;
    }

    explore() {
        if (this.hp <= 0) return { error: 'You are defeated! Use .rpg heal to recover' };
        
        // Random encounter (60% monster, 40% treasure)
        const encounter = Math.random();
        
        if (encounter < 0.6) {
            // Monster encounter
            const monsters = [
                { name: 'Goblin 👺', hp: 30, attack: 8, gold: 15, exp: 20 },
                { name: 'Orc 👹', hp: 50, attack: 12, gold: 25, exp: 35 },
                { name: 'Troll 🧌', hp: 80, attack: 15, gold: 40, exp: 50 }
            ];
            const monster = monsters[Math.floor(Math.random() * monsters.length)];
            this.currentEnemy = { ...monster, currentHp: monster.hp };
            this.inCombat = true;
            return { type: 'monster', monster: this.currentEnemy };
        } else {
            // Treasure find
            const treasures = [
                { type: 'gold', amount: 20 + Math.floor(Math.random() * 30) },
                { type: 'potion', amount: 1 },
                { type: 'exp', amount: 15 + Math.floor(Math.random() * 20) }
            ];
            const treasure = treasures[Math.floor(Math.random() * treasures.length)];
            
            if (treasure.type === 'gold') {
                this.gold += treasure.amount;
            } else if (treasure.type === 'potion') {
                this.inventory.potion += treasure.amount;
            } else if (treasure.type === 'exp') {
                this.addExp(treasure.amount);
            }
            
            return { type: 'treasure', treasure };
        }
    }

    attack() {
        if (!this.inCombat || !this.currentEnemy) return { error: 'Not in combat' };
        
        // Player attack
        const playerDamage = 10 + Math.floor(Math.random() * 10);
        this.currentEnemy.currentHp -= playerDamage;
        
        if (this.currentEnemy.currentHp <= 0) {
            // Victory
            const goldEarned = this.currentEnemy.gold;
            const expEarned = this.currentEnemy.exp;
            this.gold += goldEarned;
            this.addExp(expEarned);
            
            const result = {
                victory: true,
                enemy: this.currentEnemy.name,
                gold: goldEarned,
                exp: expEarned
            };
            
            this.currentEnemy = null;
            this.inCombat = false;
            return result;
        }
        
        // Enemy counter-attack
        const enemyDamage = Math.floor(Math.random() * this.currentEnemy.attack);
        this.hp = Math.max(0, this.hp - enemyDamage);
        
        return {
            playerDamage,
            enemyDamage,
            enemyHp: this.currentEnemy.currentHp,
            playerHp: this.hp
        };
    }

    usePotion() {
        if (this.inventory.potion <= 0) return { error: 'No potions left' };
        if (this.hp >= this.maxHp) return { error: 'HP already full' };
        
        this.inventory.potion--;
        this.hp = Math.min(this.maxHp, this.hp + 50);
        return { success: true, hp: this.hp };
    }

    addExp(amount) {
        this.exp += amount;
        const expNeeded = this.level * 100;
        if (this.exp >= expNeeded) {
            this.level++;
            this.exp -= expNeeded;
            this.maxHp += 20;
            this.hp = this.maxHp;
            return true; // leveled up
        }
        return false;
    }

    getDisplayBoard() {
        const hpBar = '❤️'.repeat(Math.ceil(this.hp / 10)) + '🖤'.repeat(10 - Math.ceil(this.hp / 10));
        
        let status = '';
        if (this.inCombat && this.currentEnemy) {
            const enemyHpBar = '💔'.repeat(Math.ceil(this.currentEnemy.currentHp / 10)) + '🖤'.repeat(10 - Math.ceil(this.currentEnemy.currentHp / 10));
            status = `⚔️ *IN COMBAT* ⚔️\n\n` +
                    `Enemy: ${this.currentEnemy.name}\n` +
                    `Enemy HP: ${enemyHpBar}\n\n` +
                    `Commands: \`.rpg attack\` or \`.rpg potion\``;
        } else {
            status = `🗺️ *Explore the world* with \`.rpg explore\``;
        }

        return `⚔️ *RPG ADVENTURE* ⚔️\n\n` +
               `Level ${this.level} | EXP: ${this.exp}/${this.level*100}\n` +
               `HP: ${hpBar} (${this.hp}/${this.maxHp})\n` +
               `💰 Gold: ${this.gold}  |  🧪 Potions: ${this.inventory.potion}\n\n` +
               status;
    }
}

// ==================== Storage ====================
const games = new Map(); // key = `rpg-${chatId}:${player}`

module.exports = {
    command: 'rpg',
    aliases: ['adventure'],
    category: 'games',
    description: 'Embark on a text-based RPG adventure.',
    usage: 
        '.rpg start                  – Start a new game\n' +
        '.rpg explore                 – Explore the world\n' +
        '.rpg attack                   – Attack current enemy\n' +
        '.rpg potion                    – Use a healing potion\n' +
        '.rpg stats                     – View your stats\n' +
        '.rpg guide                      – Show game guide',

    async handler(sock, message, args, context = {}) {
        const chatId = context.chatId || message.key.remoteJid;
        const senderId = (context.senderId || message.key.participant || message.key.remoteJid).split(':')[0];
        const channelInfo = context.channelInfo || {};

        const reply = async (text, mentions = []) => 
            await sock.sendMessage(chatId, { text, mentions, ...channelInfo }, { quoted: message });

        if (args.length === 0) {
            return await reply(
                `⚔️ *RPG Adventure Commands*\n\n` +
                `• \`.rpg start\` – New game\n` +
                `• \`.rpg explore\` – Explore for monsters/treasure\n` +
                `• \`.rpg attack\` – Attack current enemy\n` +
                `• \`.rpg potion\` – Use healing potion\n` +
                `• \`.rpg stats\` – View your stats\n` +
                `• \`.rpg guide\` – Show guide`
            );
        }

        const subCmd = args[0].toLowerCase();

        if (subCmd === 'guide') {
            return await reply(
                `📖 *RPG Adventure Guide*\n\n` +
                `1. Start a game: \`.rpg start\`\n` +
                `2. Explore to find monsters and treasure\n` +
                `3. Fight monsters with \`.rpg attack\`\n` +
                `4. Use potions to heal: \`.rpg potion\`\n` +
                `5. Gain EXP and gold from battles\n` +
                `6. Level up to increase max HP!\n\n` +
                `*Stats:*\n` +
                `❤️ = Health | 🧪 = Potions | 💰 = Gold\n` +
                `⚔️ = Attack power | 🛡️ = Defense`
            );
        }

        // Find existing game
        let gameKey = null;
        let game = null;
        for (let [key, g] of games.entries()) {
            if (key.startsWith(`rpg-${chatId}:${senderId}`)) {
                gameKey = key;
                game = g;
                break;
            }
        }

        if (subCmd === 'start') {
            if (game) games.delete(gameKey);
            const newGame = new RPGAdventure(senderId);
            const newKey = `rpg-${chatId}:${senderId}-${Date.now()}`;
            games.set(newKey, newGame);
            return await reply(
                `⚔️ *RPG Adventure Started!*\n\n` +
                `${newGame.getDisplayBoard()}\n\n` +
                `Begin your journey with \`.rpg explore\``
            );
        }

        if (!game) return await reply('❌ No game in progress. Start one with `.rpg start`');

        if (subCmd === 'stats') {
            return await reply(game.getDisplayBoard());
        }

        if (subCmd === 'explore') {
            const result = game.explore();
            if (result.error) return await reply(`❌ ${result.error}`);
            
            if (result.type === 'monster') {
                await reply(
                    `⚔️ *A wild ${result.monster.name} appears!* ⚔️\n\n` +
                    `${game.getDisplayBoard()}`
                );
            } else if (result.type === 'treasure') {
                let msg = `✨ *You found treasure!* ✨\n\n`;
                if (result.treasure.type === 'gold') {
                    msg += `💰 +${result.treasure.amount} gold!`;
                } else if (result.treasure.type === 'potion') {
                    msg += `🧪 +1 healing potion!`;
                } else if (result.treasure.type === 'exp') {
                    msg += `✨ +${result.treasure.amount} EXP!`;
                }
                await reply(`${msg}\n\n${game.getDisplayBoard()}`);
            }
            return;
        }

        if (subCmd === 'attack') {
            const result = game.attack();
            if (result.error) return await reply(`❌ ${result.error}`);
            
            if (result.victory) {
                const levelUp = game.addExp(result.exp);
                let msg = `🎉 *Victory!* You defeated the ${result.enemy}! 🎉\n\n` +
                         `💰 +${result.gold} gold\n` +
                         `✨ +${result.exp} EXP`;
                if (levelUp) msg += `\n\n🌟 *LEVEL UP!* You are now level ${game.level}! 🌟`;
                
                await reply(`${msg}\n\n${game.getDisplayBoard()}`);
            } else {
                await reply(
                    `⚔️ *Combat continues!*\n\n` +
                    `You dealt ${result.playerDamage} damage!\n` +
                    `Enemy counter-attacked for ${result.enemyDamage} damage!\n\n` +
                    `${game.getDisplayBoard()}`
                );
            }
            return;
        }

        if (subCmd === 'potion') {
            const result = game.usePotion();
            if (result.error) return await reply(`❌ ${result.error}`);
            await reply(
                `🧪 *Potion used!* HP restored to ${result.hp}\n\n` +
                `${game.getDisplayBoard()}`
            );
            return;
        }

        await reply('❌ Unknown subcommand. Use `.rpg guide` for help.');
    }
};
