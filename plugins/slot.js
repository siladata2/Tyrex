/*****************************************************************************
 *                                                                           *
 *                     Developed By Abdul Rehman Rajpoot                     *
 *                     & Muzamil Khan                                        *
 *                                                                           *
 *****************************************************************************/

// ==================== Game Logic ====================
const slotSymbols = ['🍒', '🍋', '🍊', '🍇', '💎', '7️⃣'];
const payouts = {
  '🍒': 2,
  '🍋': 3,
  '🍊': 4,
  '🍇': 5,
  '💎': 10,
  '7️⃣': 20
};

class SlotMachine {
    constructor() {
        this.balance = 100;
        this.lastSpin = null;
        this.spinning = false;
    }

    spin(bet = 10) {
        if (this.spinning) return { error: 'Already spinning!' };
        if (bet > this.balance) return { error: 'Insufficient balance' };
        if (bet < 5) return { error: 'Minimum bet is 5' };

        this.spinning = true;
        this.balance -= bet;

        // Generate result
        const reels = [
            slotSymbols[Math.floor(Math.random() * slotSymbols.length)],
            slotSymbols[Math.floor(Math.random() * slotSymbols.length)],
            slotSymbols[Math.floor(Math.random() * slotSymbols.length)]
        ];

        // Check win (all three same)
        const win = reels[0] === reels[1] && reels[1] === reels[2];
        const multiplier = win ? payouts[reels[0]] || 2 : 0;
        const winnings = win ? bet * multiplier : 0;

        if (win) this.balance += winnings;

        this.lastSpin = { reels, win, winnings, bet };
        return { reels, win, winnings, bet };
    }

    getDisplayBoard(spinning = false) {
        if (spinning) {
            return `🎰 *SLOT MACHINE* 🎰\n\n` +
                   `[ 🎲 | 🎲 | 🎲 ]\n` +
                   `[ 🎰 | ⏳ | 🎰 ]\n` +
                   `[ 🎲 | 🎲 | 🎲 ]\n\n` +
                   `*SPINNING...*`;
        }

        const spin = this.lastSpin || { reels: ['❓', '❓', '❓'] };
        const result = spin.reels.map(r => r).join(' | ');
        
        let status = '';
        if (spin.win) {
            status = `\n\n🎉 *YOU WIN ${spin.winnings}!* 🎉`;
        } else if (spin.winnings !== undefined) {
            status = `\n\n😢 *Try again!*`;
        }

        return `🎰 *SLOT MACHINE* 🎰\n\n` +
               `[ ${spin.reels[0]} | ${spin.reels[1]} | ${spin.reels[2]} ]\n\n` +
               `Balance: 💰 ${this.balance}` +
               status;
    }
}

// ==================== Storage ====================
const games = new Map(); // key = `slot-${chatId}:${player}`

module.exports = {
    command: 'slot',
    aliases: ['slots'],
    category: 'games',
    description: 'Play the slot machine with emoji reels.',
    usage: 
        '.slot start                – Start a new game\n' +
        '.slot spin <bet>            – Spin the reels (bet 5-100)\n' +
        '.slot guide                  – Show game guide',

    async handler(sock, message, args, context = {}) {
        const chatId = context.chatId || message.key.remoteJid;
        const senderId = (context.senderId || message.key.participant || message.key.remoteJid).split(':')[0];
        const channelInfo = context.channelInfo || {};

        const reply = async (text) => 
            await sock.sendMessage(chatId, { text, ...channelInfo }, { quoted: message });

        if (args.length === 0) {
            return await reply(
                `🎰 *Slot Machine Commands*\n\n` +
                `• \`.slot start\` – New game\n` +
                `• \`.slot spin <bet>\` – Spin (bet 5-100)\n` +
                `• \`.slot guide\` – Show guide`
            );
        }

        const subCmd = args[0].toLowerCase();

        if (subCmd === 'guide') {
            return await reply(
                `📖 *Slot Machine Guide*\n\n` +
                `1. Start a game: \`.slot start\` (get 100 chips)\n` +
                `2. Spin with: \`.slot spin 10\`\n` +
                `3. Match all three symbols to win!\n` +
                `4. Payouts: 🍒=2x, 🍋=3x, 🍊=4x, 🍇=5x, 💎=10x, 7️⃣=20x\n` +
                `5. Watch the animation as reels spin!\n` +
                `6. Balance persists until you start a new game.`
            );
        }

        // Find existing game
        let gameKey = null;
        let game = null;
        for (let [key, g] of games.entries()) {
            if (key.startsWith(`slot-${chatId}:${senderId}`)) {
                gameKey = key;
                game = g;
                break;
            }
        }

        if (subCmd === 'start') {
            if (game) games.delete(gameKey);
            const newGame = new SlotMachine();
            const newKey = `slot-${chatId}:${senderId}-${Date.now()}`;
            games.set(newKey, newGame);
            return await reply(
                `🎰 *Slot Machine Started!*\n\n` +
                `${newGame.getDisplayBoard()}\n\n` +
                `Spin with \`.slot spin <bet>\``
            );
        }

        if (!game) return await reply('❌ No game in progress. Start one with `.slot start`');

        if (subCmd === 'spin') {
            if (args.length < 2) return await reply('❌ Usage: `.slot spin <bet>`');
            const bet = parseInt(args[1]);
            if (isNaN(bet)) return await reply('❌ Bet must be a number');

            // Show spinning animation
            const spinMsg = await reply(game.getDisplayBoard(true));
            
            // Simulate spinning delay
            setTimeout(async () => {
                const result = game.spin(bet);
                if (result.error) {
                    await sock.sendMessage(chatId, { 
                        text: `❌ ${result.error}`, 
                        ...channelInfo,
                        edit: spinMsg.key?.id 
                    });
                    return;
                }

                // Send final result
                await sock.sendMessage(chatId, { 
                    text: game.getDisplayBoard(), 
                    ...channelInfo,
                    edit: spinMsg.key?.id 
                });

                // If game over (optional), could end here
            }, 2000);
            
            return;
        }

        await reply('❌ Unknown subcommand. Use `.slot guide` for help.');
    }
};
