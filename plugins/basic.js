'use strict';
/**
 * 🔥 REDXMINIBOT ULTRA — Basic Plugins
 * sticker · ai · translate · define · weather · tts
 */

const axios = require('axios').default;

const nlCtxBase = () => ({
  forwardingScore: 999,
  isForwarded: true,
  forwardedNewsletterMessageInfo: {
    newsletterJid:  process.env.NEWSLETTER_JID || '120363405513439052@newsletter',
    newsletterName: process.env.NEWSLETTER_NAME || '🔥 REDXMINIBOT ULTRA',
    serverMessageId: -1,
  },
});

// ── STICKER ───────────────────────────────────────────────
const stickerPlugin = {
  pattern: 'sticker',
  description: 'Convert image/video to sticker',
  execute: async (conn, msg, m, opts) => {
    const { from, reply, botName } = opts;
    const quoted = m.quoted || msg;
    const msgType = Object.keys(quoted.message || {})[0];

    if (!['imageMessage','videoMessage','stickerMessage'].includes(msgType)) {
      return reply(`╭━[ 🎭 *STICKER* ]━⊷\n┃ ❌ Reply to an image or video!\n┃ Usage: reply to media + ${opts.prefix}sticker\n╰━━━━━━━━━━━━⊷\n> 🔥 ${botName}`);
    }
    try {
      const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
      const stream   = await downloadContentFromMessage(quoted.message[msgType], msgType.replace('Message',''));
      const chunks   = [];
      for await (const chunk of stream) chunks.push(chunk);
      const buffer   = Buffer.concat(chunks);
      const { exec } = require('child_process');
      const fs       = require('fs');
      const path     = require('path');
      const tmpIn    = path.join(__dirname,'..','temp',`stk_in_${Date.now()}.${msgType==='videoMessage'?'mp4':'jpg'}`);
      const tmpOut   = path.join(__dirname,'..','temp',`stk_out_${Date.now()}.webp`);
      fs.writeFileSync(tmpIn, buffer);

      await new Promise((res, rej) => {
        const ffmpegPath = (() => { try { return require('@ffmpeg-installer/ffmpeg').path; } catch { return 'ffmpeg'; } })();
        const args = msgType === 'videoMessage'
          ? `-i "${tmpIn}" -vf "scale=512:512:force_original_aspect_ratio=decrease,fps=15" -c:v libwebp -loop 0 -an -t 6 "${tmpOut}"`
          : `-i "${tmpIn}" -vf "scale=512:512:force_original_aspect_ratio=decrease" "${tmpOut}"`;
        exec(`${ffmpegPath} ${args}`, (err) => err ? rej(err) : res());
      });

      await conn.sendMessage(from, { sticker: fs.readFileSync(tmpOut) }, { quoted: msg });
      try { fs.unlinkSync(tmpIn); fs.unlinkSync(tmpOut); } catch {}
    } catch (e) {
      reply(`╭━[ ❌ *STICKER ERROR* ]━⊷\n┃ ${e.message}\n╰━━━━━━━━━━━━⊷`);
    }
  },
};

// ── AI CHAT ───────────────────────────────────────────────
const aiPlugin = {
  pattern: 'ai',
  description: 'AI powered chat',
  execute: async (conn, msg, m, opts) => {
    const { q, reply, botName } = opts;
    if (!q) return reply(`╭━[ 🤖 *AI* ]━⊷\n┃ Usage: ${opts.prefix}ai <your question>\n╰━━━━━━━━━━━━⊷`);

    await conn.sendMessage(opts.from, { react: { text: '🤔', key: msg.key } }).catch(()=>{});
    try {
      const r = await axios.get(`https://api.simsimi.vn/v1/simsimi?text=${encodeURIComponent(q)}&lc=en`, { timeout: 15000 });
      const ans = r.data?.success || r.data?.message || r.data?.text || 'No response';
      reply(`╭━[ 🤖 *AI REPLY* ]━⊷\n┃ ❓ *Q:* ${q}\n┃\n┃ 💬 *A:* ${ans}\n╰━━━━━━━━━━━━⊷\n> 🔥 ${botName}`);
    } catch {
      try {
        const r2 = await axios.get(`https://api.popcat.xyz/chatbot?msg=${encodeURIComponent(q)}&owner=${encodeURIComponent(opts.ownerName)}&botname=${encodeURIComponent(botName)}`, { timeout: 15000 });
        const ans = r2.data?.response || 'Sorry, AI is offline right now.';
        reply(`╭━[ 🤖 *AI REPLY* ]━⊷\n┃ ❓ *Q:* ${q}\n┃\n┃ 💬 *A:* ${ans}\n╰━━━━━━━━━━━━⊷\n> 🔥 ${botName}`);
      } catch(e2) {
        reply(`╭━[ ❌ *AI ERROR* ]━⊷\n┃ ${e2.message}\n╰━━━━━━━━━━━━⊷`);
      }
    }
  },
};

// ── TRANSLATE ─────────────────────────────────────────────
const translatePlugin = {
  pattern: 'translate',
  description: 'Translate text',
  execute: async (conn, msg, m, opts) => {
    const { q, reply, botName } = opts;
    if (!q) return reply(`╭━[ 🌐 *TRANSLATE* ]━⊷\n┃ Usage: ${opts.prefix}translate <lang> <text>\n┃ Example: ${opts.prefix}translate en Bonjour!\n╰━━━━━━━━━━━━⊷`);
    const parts = q.split(' ');
    const lang  = parts[0];
    const text  = parts.slice(1).join(' ');
    if (!text) return reply('❌ Provide text to translate!');
    try {
      const r = await axios.get(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=auto|${lang}`, { timeout: 15000 });
      const translated = r.data?.responseData?.translatedText || 'Translation failed';
      reply(`╭━[ 🌐 *TRANSLATION* ]━⊷\n┃ 📝 *Original:* ${text}\n┃ 🌍 *Language:* ${lang}\n┃ ✅ *Result:* ${translated}\n╰━━━━━━━━━━━━⊷\n> 🔥 ${botName}`);
    } catch(e) { reply(`❌ Translation error: ${e.message}`); }
  },
};

// ── DEFINE ────────────────────────────────────────────────
const definePlugin = {
  pattern: 'define',
  description: 'Dictionary definition',
  execute: async (conn, msg, m, opts) => {
    const { q, reply, botName } = opts;
    if (!q) return reply(`Usage: ${opts.prefix}define <word>`);
    try {
      const r = await axios.get(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(q)}`, { timeout: 15000 });
      const entry = r.data?.[0];
      if (!entry) return reply('❌ Word not found.');
      const meaning = entry.meanings?.[0];
      const def     = meaning?.definitions?.[0]?.definition || 'No definition';
      const example = meaning?.definitions?.[0]?.example || '';
      reply(`╭━[ 📚 *DEFINE* ]━⊷\n┃ 📝 *Word:* ${entry.word}\n┃ 🏷️ *Type:* ${meaning?.partOfSpeech||'?'}\n┃ 📖 *Definition:* ${def}\n${example?`┃ 💬 *Example:* ${example}\n`:''}╰━━━━━━━━━━━━⊷\n> 🔥 ${botName}`);
    } catch(e) { reply(`❌ Dictionary error: ${e.message}`); }
  },
};

// ── WEATHER ───────────────────────────────────────────────
const weatherPlugin = {
  pattern: 'weather',
  description: 'Get weather info',
  execute: async (conn, msg, m, opts) => {
    const { q, reply, botName } = opts;
    if (!q) return reply(`Usage: ${opts.prefix}weather <city>`);
    try {
      const r = await axios.get(`https://wttr.in/${encodeURIComponent(q)}?format=j1`, { timeout: 15000 });
      const w = r.data?.current_condition?.[0];
      if (!w) return reply('❌ Location not found.');
      reply(`╭━[ 🌤️ *WEATHER* ]━⊷\n┃ 📍 *City:* ${q}\n┃ 🌡️ *Temp:* ${w.temp_C}°C / ${w.temp_F}°F\n┃ 💧 *Humidity:* ${w.humidity}%\n┃ 💨 *Wind:* ${w.windspeedKmph} km/h\n┃ ☁️ *Feels like:* ${w.FeelsLikeC}°C\n┃ 🌈 *Condition:* ${w.weatherDesc?.[0]?.value||'?'}\n╰━━━━━━━━━━━━⊷\n> 🔥 ${botName}`);
    } catch(e) { reply(`❌ Weather error: ${e.message}`); }
  },
};

// ── JOKE ──────────────────────────────────────────────────
const jokePlugin = {
  pattern: 'joke',
  description: 'Random joke',
  execute: async (conn, msg, m, opts) => {
    const { reply, botName } = opts;
    try {
      const r = await axios.get('https://v2.jokeapi.dev/joke/Any?blacklistFlags=nsfw,racist,sexist', { timeout: 15000 });
      const j = r.data;
      const text = j.type === 'twopart' ? `${j.setup}\n\n😂 ${j.delivery}` : j.joke;
      reply(`╭━[ 😂 *JOKE* ]━⊷\n┃\n┃ ${text}\n┃\n╰━━━━━━━━━━━━⊷\n> 🔥 ${botName}`);
    } catch { reply('😂 Why did the bot fail? Because the jokes API took a break! 😅'); }
  },
};

// ── FACT ──────────────────────────────────────────────────
const factPlugin = {
  pattern: 'fact',
  description: 'Random fact',
  execute: async (conn, msg, m, opts) => {
    const { reply, botName } = opts;
    try {
      const r = await axios.get('https://api.api-ninjas.com/v1/facts?limit=1', {
        headers: { 'X-Api-Key': 'fake-key' }, timeout: 10000
      });
      const fact = r.data?.[0]?.fact || 'Honey never spoils. Archaeologists have found 3,000-year-old honey in Egyptian tombs that was still good to eat!';
      reply(`╭━[ 🧠 *RANDOM FACT* ]━⊷\n┃\n┃ 💡 ${fact}\n┃\n╰━━━━━━━━━━━━⊷\n> 🔥 ${botName}`);
    } catch {
      const facts = [
        'Honey never spoils — archaeologists found 3,000-year-old edible honey!',
        'A group of flamingos is called a "flamboyance".',
        'Octopuses have three hearts and blue blood.',
        'A day on Venus is longer than a year on Venus.',
        'Bananas are slightly radioactive due to potassium-40.',
      ];
      reply(`╭━[ 🧠 *RANDOM FACT* ]━⊷\n┃\n┃ 💡 ${facts[Math.floor(Math.random()*facts.length)]}\n┃\n╰━━━━━━━━━━━━⊷\n> 🔥 ${botName}`);
    }
  },
};

// ── QUOTE ─────────────────────────────────────────────────
const quotePlugin = {
  pattern: 'quote',
  description: 'Inspirational quote',
  execute: async (conn, msg, m, opts) => {
    const { reply, botName } = opts;
    try {
      const r = await axios.get('https://api.quotable.io/random', { timeout: 10000 });
      const { content, author } = r.data;
      reply(`╭━[ 💬 *QUOTE* ]━⊷\n┃\n┃ _"${content}"_\n┃\n┃ — *${author}*\n┃\n╰━━━━━━━━━━━━⊷\n> 🔥 ${botName}`);
    } catch {
      reply(`╭━[ 💬 *QUOTE* ]━⊷\n┃\n┃ _"The only way to do great work is to love what you do."_\n┃\n┃ — *Steve Jobs*\n┃\n╰━━━━━━━━━━━━⊷`);
    }
  },
};

// ── CALC ──────────────────────────────────────────────────
const calcPlugin = {
  pattern: 'calc',
  description: 'Calculator',
  execute: async (conn, msg, m, opts) => {
    const { q, reply, botName } = opts;
    if (!q) return reply(`Usage: ${opts.prefix}calc 2 + 2`);
    try {
      const safe = q.replace(/[^0-9+\-*/().% ]/g,'');
      // eslint-disable-next-line no-eval
      const result = Function(`"use strict"; return (${safe})`)();
      reply(`╭━[ 🧮 *CALCULATOR* ]━⊷\n┃ 📝 *Input:* ${q}\n┃ ✅ *Result:* ${result}\n╰━━━━━━━━━━━━⊷\n> 🔥 ${botName}`);
    } catch { reply('❌ Invalid math expression!'); }
  },
};

// ── TICTACTOE ─────────────────────────────────────────────
const tttGames = new Map();
const tttPlugin = {
  pattern: 'ttt',
  description: 'TicTacToe game',
  execute: async (conn, msg, m, opts) => {
    const { q, reply, from, sender, botName } = opts;
    const gameKey = from;
    let game = tttGames.get(gameKey);

    if (!game || q === 'new') {
      game = { board: Array(9).fill(null), turn: 'X', players: { X: sender, O: null }, active: true };
      tttGames.set(gameKey, game);
      if (!game.players.O) game.players.O = 'bot';
    }

    const drawBoard = (b) =>
      `${b[0]||'1'} │ ${b[1]||'2'} │ ${b[2]||'3'}\n──┼───┼──\n${b[3]||'4'} │ ${b[4]||'5'} │ ${b[5]||'6'}\n──┼───┼──\n${b[6]||'7'} │ ${b[7]||'8'} │ ${b[8]||'9'}`;

    const checkWin = (b) => {
      const wins = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
      for (const [a,b2,c] of wins) if (b[a] && b[a]===b[b2] && b[a]===b[c]) return b[a];
      return b.every(x=>x) ? 'draw' : null;
    };

    const pos = parseInt(q);
    if (!isNaN(pos) && pos >= 1 && pos <= 9 && game.active) {
      const idx = pos - 1;
      if (game.board[idx]) return reply('❌ That cell is already taken!');
      if (game.players[game.turn] !== sender && game.players[game.turn] !== 'bot') return reply(`⏳ Wait for your turn! It's ${game.turn}'s turn.`);
      game.board[idx] = game.turn;
      const winner = checkWin(game.board);
      if (winner) {
        game.active = false;
        return reply(`╭━[ 🎮 *TIC TAC TOE* ]━⊷\n┃\n┃${drawBoard(game.board)}\n┃\n┃ ${winner==='draw'?'🤝 *DRAW!*':`🏆 *${winner} WINS!*`}\n╰━━━━━━━━━━━━⊷`);
      }
      game.turn = game.turn === 'X' ? 'O' : 'X';
      // Bot move
      if (game.players[game.turn] === 'bot') {
        const empty = game.board.map((v,i)=>v?null:i).filter(v=>v!==null);
        if (empty.length) {
          game.board[empty[Math.floor(Math.random()*empty.length)]] = game.turn;
          const w2 = checkWin(game.board);
          game.turn = game.turn === 'X' ? 'O' : 'X';
          if (w2) {
            game.active = false;
            return reply(`╭━[ 🎮 *TIC TAC TOE* ]━⊷\n┃\n┃${drawBoard(game.board)}\n┃\n┃ ${w2==='draw'?'🤝 *DRAW!*':`🏆 *${w2} WINS!*`}\n╰━━━━━━━━━━━━⊷`);
          }
        }
      }
    }

    reply(`╭━[ 🎮 *TIC TAC TOE* ]━⊷\n┃ Turn: *${game.turn}*\n┃\n┃ ${drawBoard(game.board).split('\n').join('\n┃ ')}\n┃\n┃ Send: ${opts.prefix}ttt <1-9>\n┃ New: ${opts.prefix}ttt new\n╰━━━━━━━━━━━━⊷`);
  },
};

// ── 8BALL ─────────────────────────────────────────────────
const eightBallPlugin = {
  pattern: '8ball',
  description: 'Magic 8-ball',
  execute: async (conn, msg, m, opts) => {
    const { q, reply, botName } = opts;
    if (!q) return reply(`Usage: ${opts.prefix}8ball <question>`);
    const answers = [
      '🟢 It is certain.','🟢 Without a doubt.','🟢 Yes, definitely!','🟢 You may rely on it.',
      '🟡 Ask again later.','🟡 Cannot predict now.','🟡 Concentrate and ask again.',
      '🔴 My sources say no.','🔴 Very doubtful.','🔴 Don\'t count on it.',
    ];
    const ans = answers[Math.floor(Math.random()*answers.length)];
    reply(`╭━[ 🎱 *MAGIC 8-BALL* ]━⊷\n┃ ❓ *Q:* ${q}\n┃\n┃ 🎱 *A:* ${ans}\n╰━━━━━━━━━━━━⊷\n> 🔥 ${botName}`);
  },
};

// ── COIN ─────────────────────────────────────────────────
const coinPlugin = {
  pattern: 'coin',
  description: 'Flip a coin',
  execute: async (conn, msg, m, opts) => {
    const { reply, botName } = opts;
    const result = Math.random() < 0.5 ? '🪙 *HEADS!*' : '🔄 *TAILS!*';
    reply(`╭━[ 🪙 *COIN FLIP* ]━⊷\n┃\n┃ ${result}\n┃\n╰━━━━━━━━━━━━⊷\n> 🔥 ${botName}`);
  },
};

// ── DICE ─────────────────────────────────────────────────
const dicePlugin = {
  pattern: 'dice',
  description: 'Roll a dice',
  execute: async (conn, msg, m, opts) => {
    const { reply, botName } = opts;
    const faces = ['1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣'];
    const n     = Math.floor(Math.random()*6);
    reply(`╭━[ 🎲 *DICE ROLL* ]━⊷\n┃\n┃ ${faces[n]} You rolled: *${n+1}*\n┃\n╰━━━━━━━━━━━━⊷\n> 🔥 ${botName}`);
  },
};

// ── CHOOSE ────────────────────────────────────────────────
const choosePlugin = {
  pattern: 'choose',
  description: 'Pick from options',
  execute: async (conn, msg, m, opts) => {
    const { q, reply, botName } = opts;
    if (!q) return reply(`Usage: ${opts.prefix}choose option1 | option2 | option3`);
    const options = q.split('|').map(o=>o.trim()).filter(Boolean);
    if (options.length < 2) return reply('❌ Provide at least 2 options separated by |');
    const pick = options[Math.floor(Math.random()*options.length)];
    reply(`╭━[ 🎯 *CHOOSE* ]━⊷\n┃ Options: ${options.map((o,i)=>`\n┃ ${i+1}. ${o}`).join('')}\n┃\n┃ 🎯 *Picked:* ${pick}\n╰━━━━━━━━━━━━⊷\n> 🔥 ${botName}`);
  },
};

// ── MEME TEXT ─────────────────────────────────────────────
const memePlugin = {
  pattern: 'meme',
  description: 'Generate meme text',
  execute: async (conn, msg, m, opts) => {
    const { reply, botName } = opts;
    try {
      const r = await axios.get('https://meme-api.com/gimme', { timeout: 15000 });
      const meme = r.data;
      if (meme?.url) {
        await conn.sendMessage(opts.from, { image: { url: meme.url }, caption: `╭━[ 😂 *MEME* ]━⊷\n┃ 📝 ${meme.title}\n┃ 👍 ${meme.ups} upvotes\n╰━━━━━━━━━━━━⊷\n> 🔥 ${botName}`, contextInfo: nlCtxBase() }, { quoted: msg });
      } else reply('❌ No meme found!');
    } catch(e) { reply(`❌ Meme error: ${e.message}`); }
  },
};

module.exports = [
  stickerPlugin,
  aiPlugin,
  translatePlugin,
  definePlugin,
  weatherPlugin,
  jokePlugin,
  factPlugin,
  quotePlugin,
  calcPlugin,
  tttPlugin,
  eightBallPlugin,
  coinPlugin,
  dicePlugin,
  choosePlugin,
  memePlugin,
];
