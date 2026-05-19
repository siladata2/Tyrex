/*****************************************************************************
 *                                                                           *
 *                     Developed By Abdul Rehman Rajpoot                     *
 *                                                            *
 *                                                                           *
 *  🌐  GitHub   : https://github.com/AbdulRehman19721986/redxbot302          *
 *  ▶️  YouTube  : https://youtube.com/@rootmindtech                         *
 *  💬  WhatsApp : https://whatsapp.com/channel/0029VbCPnYf96H4SNehkev10     *
 *  🔗  Telegram : https://t.me/TeamRedxhacker2                              *
 *                                                                           *
 *    © 2026 Abdul Rehman Rajpoot. All rights reserved.                      *
 *                                                                           *
 *****************************************************************************/

// plugins/wordle.js
const games = new Map();
const words = [
    'APPLE', 'BRAIN', 'CHAIR', 'DANCE', 'EAGLE', 'FLAME', 'GRACE', 'HEART',
    'IMAGE', 'JOKER', 'KNIFE', 'LEMON', 'MONEY', 'NIGHT', 'OCEAN', 'PIANO',
    'QUEEN', 'RADIO', 'SNAKE', 'TABLE', 'UMBRE', 'VOICE', 'WATER', 'XENON',
    'YACHT', 'ZEBRA'
];

module.exports = {
    command: 'wordle',
    aliases: ['wd'],
    category: 'games',
    description: 'Play Wordle. Guess a 5-letter word in 6 attempts.',
    usage: '.wordle start\n.wordle guess <word>\n.wordle surrender',

    async handler(sock, message, args, context = {}) {
        const chatId = context.chatId || message.key.remoteJid;
        const senderId = context.senderId || message.key.participant || message.key.remoteJid;
        const sub = args[0]?.toLowerCase();

        let userGame = null;
        let gameId = null;
        for (let [id, g] of games.entries()) {
            if (g.player === senderId && g.state === 'playing') {
                userGame = g;
                gameId = id;
                break;
            }
        }

        if (sub === 'start') {
            if (userGame) {
                return await sock.sendMessage(chatId, {
                    text: '❌ You already have an ongoing game. Use .wordle surrender to quit.'
                }, { quoted: message });
            }
            const word = words[Math.floor(Math.random() * words.length)];
            const game = {
                word,
                guesses: [],
                attempts: 0,
                maxAttempts: 6,
                player: senderId,
                state: 'playing',
                chatId
            };
            const newId = `wordle-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
            games.set(newId, game);

            await sock.sendMessage(chatId, {
                text: `🎮 *Wordle Started!*\n\nGuess a 5-letter word. You have 6 attempts.\n\nUse .wordle guess <word> to play.`
            }, { quoted: message });
            return;
        }

        if (sub === 'surrender') {
            if (!userGame) {
                return await sock.sendMessage(chatId, {
                    text: '❌ You have no ongoing game.'
                }, { quoted: message });
            }
            games.delete(gameId);
            await sock.sendMessage(chatId, {
                text: `🏳️ Game surrendered. The word was: *${userGame.word}*`
            }, { quoted: message });
            return;
        }

        if (sub === 'guess') {
            const guess = args[1]?.toUpperCase();
            if (!guess || guess.length !== 5 || !/^[A-Z]{5}$/.test(guess)) {
                return await sock.sendMessage(chatId, {
                    text: '❌ Please guess a 5-letter word (A-Z).'
                }, { quoted: message });
            }

            if (!userGame) {
                return await sock.sendMessage(chatId, {
                    text: '❌ No game in progress. Start one with .wordle start'
                }, { quoted: message });
            }

            userGame.guesses.push(guess);
            userGame.attempts++;

            const target = userGame.word;
            let feedback = '';
            for (let i = 0; i < 5; i++) {
                if (guess[i] === target[i]) {
                    feedback += '🟩'; // correct position
                } else if (target.includes(guess[i])) {
                    feedback += '🟨'; // wrong position
                } else {
                    feedback += '⬛'; // not in word
                }
            }

            let display = '';
            for (let g of userGame.guesses) {
                let line = '';
                for (let i = 0; i < 5; i++) {
                    if (g[i] === target[i]) {
                        line += '🟩';
                    } else if (target.includes(g[i])) {
                        line += '🟨';
                    } else {
                        line += '⬛';
                    }
                }
                display += `${g} : ${line}\n`;
            }

            if (guess === target) {
                games.delete(gameId);
                await sock.sendMessage(chatId, {
                    text: `🎉 *You Win!*\n\n${display}\n\nWord: ${target}\nAttempts: ${userGame.attempts}`
                }, { quoted: message });
                return;
            }

            if (userGame.attempts >= userGame.maxAttempts) {
                games.delete(gameId);
                await sock.sendMessage(chatId, {
                    text: `💀 *Game Over!*\n\n${display}\n\nThe word was: ${target}\n\nBetter luck next time!`
                }, { quoted: message });
                return;
            }

            await sock.sendMessage(chatId, {
                text: `*Wordle*\n\n${display}\n\nAttempts left: ${userGame.maxAttempts - userGame.attempts}`
            }, { quoted: message });
            return;
        }

        await sock.sendMessage(chatId, {
            text: `📖 *Wordle*\n\nCommands:\n.wordle start - Start a new game\n.wordle guess <word> - Guess a 5-letter word\n.wordle surrender - Give up`
        }, { quoted: message });
    }
};
