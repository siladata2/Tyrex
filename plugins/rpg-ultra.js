/*****************************************************************************
 *                                                                           *
 *                     Developed By Abdul Rehman Rajpoot                     *
 *                     & Muzamil Khan                                        *
 *                                                                           *
 *****************************************************************************/

// ==================== Game Logic ====================
class RPGUltra {
    constructor(playerId, playerName) {
        this.playerId = playerId;
        this.playerName = playerName;
        this.level = 1;
        this.exp = 0;
        this.expNeeded = 100;
        this.hp = 100;
        this.maxHp = 100;
        this.mp = 50;
        this.maxMp = 50;
        this.gold = 100;
        this.inventory = {
            potion: 3,
            elixir: 1,
            sword: 1,
            shield: 1
        };
        this.equipment = {
            weapon: 'sword',
            armor: 'shield'
        };
        this.stats = {
            strength: 10,
            defense: 8,
            magic: 5,
            speed: 7
        };
        this.location = 'town'; // town, forest, cave, dungeon
        this.quests = [];
        this.currentEnemy = null;
        this.inBattle = false;
    }

    // Experience and leveling
    addExp(amount) {
        this.exp += amount;
        while (this.exp >= this.expNeeded) {
            this.levelUp();
        }
    }

    levelUp() {
        this.level++;
        this.exp -= this.expNeeded;
        this.expNeeded = Math.floor(this.expNeeded * 1.5);
        this.maxHp += 20;
        this.hp = this.maxHp;
        this.maxMp += 10;
        this.mp = this.maxMp;
        this.stats.strength += 3;
        this.stats.defense += 2;
        this.stats.magic += 2;
        this.stats.speed += 1;
    }

    // Movement
    move(location) {
        const locations = ['town', 'forest', 'cave', 'dungeon'];
        if (!locations.includes(location)) return false;
        this.location = location;
        return true;
    }

    // Exploration
    explore() {
        if (this.hp <= 0) return { error: 'You are defeated! Use `.rpg heal` to recover.' };
        
        const encounters = [
            { type: 'monster', rate: 0.6 },
            { type: 'treasure', rate: 0.3 },
            { type: 'nothing', rate: 0.1 }
        ];
        const rand = Math.random();
        let cumulative = 0;
        for (let e of encounters) {
            cumulative += e.rate;
            if (rand < cumulative) {
                if (e.type === 'monster') {
                    const monster = this.generateMonster();
                    this.currentEnemy = monster;
                    this.inBattle = true;
                    return { type: 'monster', monster };
                } else if (e.type === 'treasure') {
                    const treasure = this.generateTreasure();
                    this.applyTreasure(treasure);
                    return { type: 'treasure', treasure };
                } else {
                    return { type: 'nothing' };
                }
            }
        }
    }

    generateMonster() {
        const monsters = {
            forest: [
                { name: 'Goblin 👺', hp: 30, attack: 8, gold: 15, exp: 20 },
                { name: 'Wolf 🐺', hp: 45, attack: 12, gold: 25, exp: 35 }
            ],
            cave: [
                { name: 'Orc 👹', hp: 60, attack: 15, gold: 40, exp: 50 },
                { name: 'Troll 🧌', hp: 90, attack: 18, gold: 60, exp: 70 }
            ],
            dungeon: [
                { name: 'Dragon 🐉', hp: 150, attack: 25, gold: 200, exp: 150 },
                { name: 'Lich 💀', hp: 120, attack: 30, gold: 150, exp: 120 }
            ]
        };
        const locMonsters = monsters[this.location] || monsters.forest;
        const base = locMonsters[Math.floor(Math.random() * locMonsters.length)];
        return { ...base, currentHp: base.hp };
    }

    generateTreasure() {
        const treasures = [
            { type: 'gold', amount: 20 + Math.floor(Math.random() * 50) },
            { type: 'potion', amount: 1 },
            { type: 'elixir', amount: 1 },
            { type: 'exp', amount: 15 + Math.floor(Math.random() * 30) }
        ];
        return treasures[Math.floor(Math.random() * treasures.length)];
    }

    applyTreasure(treasure) {
        if (treasure.type === 'gold') this.gold += treasure.amount;
        else if (treasure.type === 'potion') this.inventory.potion += treasure.amount;
        else if (treasure.type === 'elixir') this.inventory.elixir += treasure.amount;
        else if (treasure.type === 'exp') this.addExp(treasure.amount);
    }

    // Battle actions
    attack() {
        if (!this.inBattle) return { error: 'Not in battle' };
        const playerDamage = Math.floor(this.stats.strength + Math.random() * 10);
        this.currentEnemy.currentHp -= playerDamage;

        if (this.currentEnemy.currentHp <= 0) {
            // Victory
            this.addExp(this.currentEnemy.exp);
            this.gold += this.currentEnemy.gold;
            const result = {
                victory: true,
                enemy: this.currentEnemy.name,
                exp: this.currentEnemy.exp,
                gold: this.currentEnemy.gold
            };
            this.currentEnemy = null;
            this.inBattle = false;
            return result;
        }

        // Enemy counter
        const enemyDamage = Math.floor(Math.random() * this.currentEnemy.attack);
        this.hp = Math.max(0, this.hp - enemyDamage);
        if (this.hp <= 0) {
            this.inBattle = false;
            return { defeat: true, enemy: this.currentEnemy.name };
        }

        return {
            playerDamage,
            enemyDamage,
            enemyHp: this.currentEnemy.currentHp,
            playerHp: this.hp
        };
    }

    useItem(item) {
        if (!this.inventory[item] || this.inventory[item] <= 0) return false;
        if (item === 'potion') {
            this.hp = Math.min(this.maxHp, this.hp + 50);
            this.inventory.potion--;
        } else if (item === 'elixir') {
            this.mp = Math.min(this.maxMp, this.mp + 30);
            this.inventory.elixir--;
        }
        return true;
    }

    flee() {
        if (!this.inBattle) return false;
        const chance = this.stats.speed / (this.stats.speed + this.currentEnemy.attack);
        if (Math.random() < chance) {
            this.inBattle = false;
            this.currentEnemy = null;
            return true;
        }
        // Failed flee, enemy attacks
        const enemyDamage = Math.floor(Math.random() * this.currentEnemy.attack);
        this.hp = Math.max(0, this.hp - enemyDamage);
        return false;
    }

    // Shop
    buy(item, cost) {
        if (this.gold < cost) return false;
        this.gold -= cost;
        if (!this.inventory[item]) this.inventory[item] = 0;
        this.inventory[item]++;
        return true;
    }

    sell(item, price) {
        if (!this.inventory[item] || this.inventory[item] <= 0) return false;
        this.inventory[item]--;
        this.gold += price;
        return true;
    }

    getDisplayBoard() {
        const hpBar = '❤️'.repeat(Math.ceil(this.hp / 10)) + '🖤'.repeat(10 - Math.ceil(this.hp / 10));
        const mpBar = '💙'.repeat(Math.ceil(this.mp / 10)) + '🖤'.repeat(5 - Math.ceil(this.mp / 10));

        let status = '';
        if (this.inBattle && this.currentEnemy) {
            const enemyHpBar = '💔'.repeat(Math.ceil(this.currentEnemy.currentHp / 10)) + '🖤'.repeat(10 - Math.ceil(this.currentEnemy.currentHp / 10));
            status = `⚔️ *BATTLE* ⚔️\n\n` +
                    `Enemy: ${this.currentEnemy.name}\n` +
                    `Enemy HP: ${enemyHpBar}\n\n` +
                    `Commands: \`.rpg attack\`, \`.rpg potion\`, \`.rpg flee\``;
        } else {
            status = `📍 Location: *${this.location}*\n` +
                    `Use \`.rpg explore\` to find adventure.`;
        }

        return `⚔️ *RPG-ULTRA* ⚔️\n\n` +
               `Player: ${this.playerName} (Lv.${this.level})\n` +
               `EXP: ${this.exp}/${this.expNeeded}\n` +
               `HP: ${hpBar} (${this.hp}/${this.maxHp})\n` +
               `MP: ${mpBar} (${this.mp}/${this.maxMp})\n` +
               `💰 Gold: ${this.gold}\n` +
               `🧪 Potions: ${this.inventory.potion}  |  ✨ Elixirs: ${this.inventory.elixir}\n\n` +
               status;
    }
}

const games = new Map(); // key = chatId:playerId

module.exports = {
    command: 'rpg',
    aliases: ['rpg-ultra'],
    category: 'games',
    description: 'Embark on an epic RPG adventure!',
    usage: 
        '.rpg start                  – Start a new game\n' +
        '.rpg explore                 – Explore current area\n' +
        '.rpg attack                   – Attack enemy in battle\n' +
        '.rpg potion                    – Use healing potion\n' +
        '.rpg elixir                     – Use MP elixir\n' +
        '.rpg flee                        – Flee from battle\n' +
        '.rpg move <location>            – Move to town/forest/cave/dungeon\n' +
        '.rpg shop                         – Show shop items\n' +
        '.rpg buy <item>                   – Buy item (potion/elixir)\n' +
        '.rpg stats                         – Show character stats\n' +
        '.rpg guide                           – Show game guide',

    async handler(sock, message, args, context = {}) {
        const chatId = context.chatId || message.key.remoteJid;
        const senderId = (context.senderId || message.key.participant || message.key.remoteJid).split(':')[0];
        const senderName = message.pushName || senderId.split('@')[0];
        const channelInfo = context.channelInfo || {};

        const reply = async (text, mentions = []) => 
            await sock.sendMessage(chatId, { text, mentions, ...channelInfo }, { quoted: message });

        if (args.length === 0) {
            return await reply(
                `⚔️ *RPG Commands*\n\n` +
                `• \`.rpg start\` – New game\n` +
                `• \`.rpg explore\` – Explore area\n` +
                `• \`.rpg attack\` – Attack enemy\n` +
                `• \`.rpg potion\` – Use potion\n` +
                `• \`.rpg elixir\` – Use elixir\n` +
                `• \`.rpg flee\` – Flee battle\n` +
                `• \`.rpg move <loc>\` – Move location\n` +
                `• \`.rpg shop\` – Show shop\n` +
                `• \`.rpg buy <item>\` – Buy item\n` +
                `• \`.rpg stats\` – View stats\n` +
                `• \`.rpg guide\` – Show guide`
            );
        }

        const subCmd = args[0].toLowerCase();

        if (subCmd === 'guide') {
            return await reply(
                `📖 *RPG-Ultra Guide*\n\n` +
                `1. Start your adventure: \`.rpg start\`\n` +
                `2. Explore to find monsters and treasure\n` +
                `3. Fight monsters with \`.rpg attack\`\n` +
                `4. Use potions to heal, elixirs for MP\n` +
                `5. Flee if battle is too hard\n` +
                `6. Move between locations: town, forest, cave, dungeon\n` +
                `7. Buy items in town with \`.rpg shop\` and \`.rpg buy\`\n` +
                `8. Gain EXP and level up!\n\n` +
                `*Stats:*\n` +
                `❤️ HP | 💙 MP | 💰 Gold | 🧪 Potion | ✨ Elixir`
            );
        }

        const gameKey = `${chatId}:${senderId}`;
        let game = games.get(gameKey);

        if (subCmd === 'start') {
            if (game) games.delete(gameKey);
            game = new RPGUltra(senderId, senderName);
            games.set(gameKey, game);
            return await reply(
                `⚔️ *RPG-Ultra Started!*\n\n` +
                `${game.getDisplayBoard()}\n\n` +
                `Begin with \`.rpg explore\``
            );
        }

        if (!game) return await reply('❌ No game in progress. Start one with `.rpg start`');

        if (subCmd === 'stats') {
            return await reply(game.getDisplayBoard());
        }

        if (subCmd === 'explore') {
            if (game.hp <= 0) return await reply('❌ You are defeated! Use `.rpg heal` to recover.');
            const result = game.explore();
            if (result.error) return await reply(`❌ ${result.error}`);

            if (result.type === 'monster') {
                await reply(
                    `⚔️ *A wild ${result.monster.name} appears!* ⚔️\n\n` +
                    `${game.getDisplayBoard()}`
                );
            } else if (result.type === 'treasure') {
                let msg = `✨ *You found treasure!* ✨\n\n`;
                if (result.treasure.type === 'gold') msg += `💰 +${result.treasure.amount} gold!`;
                else if (result.treasure.type === 'potion') msg += `🧪 +1 potion!`;
                else if (result.treasure.type === 'elixir') msg += `✨ +1 elixir!`;
                else if (result.treasure.type === 'exp') msg += `✨ +${result.treasure.amount} EXP!`;
                await reply(`${msg}\n\n${game.getDisplayBoard()}`);
            } else {
                await reply(`🍃 You found nothing interesting.\n\n${game.getDisplayBoard()}`);
            }
            return;
        }

        if (subCmd === 'attack') {
            const result = game.attack();
            if (result.error) return await reply(`❌ ${result.error}`);

            if (result.victory) {
                await reply(
                    `🎉 *Victory!* You defeated ${result.enemy}!\n` +
                    `💰 +${result.gold} gold  ✨ +${result.exp} EXP\n\n` +
                    `${game.getDisplayBoard()}`
                );
            } else if (result.defeat) {
                await reply(
                    `💀 *You were defeated by ${result.enemy}!*\n\n` +
                    `${game.getDisplayBoard()}\n\n` +
                    `Use potions to heal.`
                );
            } else {
                await reply(
                    `⚔️ You dealt ${result.playerDamage} damage!\n` +
                    `💥 Enemy counter: ${result.enemyDamage} damage!\n\n` +
                    `${game.getDisplayBoard()}`
                );
            }
            return;
        }

        if (subCmd === 'potion') {
            const used = game.useItem('potion');
            if (!used) return await reply('❌ No potions left!');
            await reply(`🧪 *Potion used!* HP restored.\n\n${game.getDisplayBoard()}`);
            return;
        }

        if (subCmd === 'elixir') {
            const used = game.useItem('elixir');
            if (!used) return await reply('❌ No elixirs left!');
            await reply(`✨ *Elixir used!* MP restored.\n\n${game.getDisplayBoard()}`);
            return;
        }

        if (subCmd === 'flee') {
            if (!game.inBattle) return await reply('❌ Not in battle.');
            const success = game.flee();
            if (success) {
                await reply(`🏃 *You fled successfully!*\n\n${game.getDisplayBoard()}`);
            } else {
                await reply(`💥 *Failed to flee!* Enemy attacked!\n\n${game.getDisplayBoard()}`);
            }
            return;
        }

        if (subCmd === 'move') {
            if (args.length < 2) return await reply('❌ Usage: `.rpg move <town/forest/cave/dungeon>`');
            const loc = args[1].toLowerCase();
            const success = game.move(loc);
            if (!success) return await reply(`❌ Invalid location. Choose: town, forest, cave, dungeon.`);
            await reply(`📍 Moved to *${loc}*.\n\n${game.getDisplayBoard()}`);
            return;
        }

        if (subCmd === 'shop') {
            return await reply(
                `🏪 *SHOP*\n\n` +
                `🟢 Potion: 30 gold (heal 50 HP)\n` +
                `🔵 Elixir: 50 gold (restore 30 MP)\n` +
                `🛡️ Shield: 100 gold (+2 defense)\n` +
                `⚔️ Sword: 150 gold (+3 strength)\n\n` +
                `Use \`.rpg buy <item>\` to purchase.\n` +
                `Your gold: ${game.gold}`
            );
        }

        if (subCmd === 'buy') {
            if (args.length < 2) return await reply('❌ Usage: `.rpg buy <item>`');
            const item = args[1].toLowerCase();
            const prices = { potion: 30, elixir: 50, shield: 100, sword: 150 };
            if (!prices[item]) return await reply('❌ Item not available. Choose potion, elixir, shield, sword.');
            if (game.gold < prices[item]) return await reply('❌ Not enough gold.');
            game.gold -= prices[item];
            if (item === 'shield' || item === 'sword') {
                game.inventory[item] = (game.inventory[item] || 0) + 1;
            } else {
                game.inventory[item]++;
            }
            await reply(`✅ Purchased 1 ${item}! Remaining gold: ${game.gold}\n\n${game.getDisplayBoard()}`);
            return;
        }

        await reply('❌ Unknown subcommand. Use `.rpg guide` for help.');
    }
};
