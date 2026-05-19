/*****************************************************************************
 *                                                                           *
 *                     Developed By Abdul Rehman Rajpoot                     *
 *                     & Muzamil Khan                                        *
 *                                                                           *
 *  🌐  GitHub   : https://github.com/AbdulRehman19721986/redxbot302          *
 *  ▶️  YouTube  : https://youtube.com/@rootmindtech                         *
 *  💬  WhatsApp : https://whatsapp.com/channel/0029VbCPnYf96H4SNehkev10     *
 *  🔗  Telegram : https://t.me/TeamRedxhacker2                              *
 *                                                                           *
 *    © 2026 Abdul Rehman Rajpoot. All rights reserved.                      *
 *                                                                           *
 *****************************************************************************/

const settings = require('../settings');
const commandHandler = require('../lib/commandHandler');
const store = require('../lib/lightweight_store');
const axios = require('axios');

let sendInteractiveMessage;
try {
  ({ sendInteractiveMessage } = require('gifted-btns'));
} catch (e) {
  sendInteractiveMessage = null;
}

const MENU_IMAGE_URL = 'https://files.catbox.moe/dfseqs.jpg';

// Category definitions with emojis — order matters (displayed top→bottom)
const CATEGORIES = [
  { id: 'main',       emoji: '🏠', name: 'MAIN MENU'       },
  { id: 'ai',         emoji: '🤖', name: 'AI MENU'         },
  { id: 'owner',      emoji: '👑', name: 'OWNER MENU'      },
  { id: 'group',      emoji: '👥', name: 'GROUP MENU'      },
  { id: 'downloader', emoji: '📥', name: 'DOWNLOAD MENU'   },
  { id: 'audio',      emoji: '🎵', name: 'AUDIO MENU'      },
  { id: 'sticker',    emoji: '🖼️',  name: 'STICKER MENU'   },
  { id: 'fun',        emoji: '🎯', name: 'FUN MENU'        },
  { id: 'games',      emoji: '🎮', name: 'GAMES MENU'      },
  { id: 'tools',      emoji: '🔧', name: 'TOOLS MENU'      },
  { id: 'search',     emoji: '🔍', name: 'SEARCH MENU'     },
  { id: 'utility',    emoji: '⚙️',  name: 'UTILITY MENU'   },
  { id: 'reaction',   emoji: '💫', name: 'REACTION MENU'   },
  { id: 'setting',    emoji: '🛠️',  name: 'SETTING MENU'   },
  { id: 'general',    emoji: '📋', name: 'GENERAL MENU'    },
  { id: 'other',      emoji: '🧩', name: 'OTHER MENU'      },
];

function getCatEmoji(catId) {
  const found = CATEGORIES.find(c => c.id === catId);
  return found ? found.emoji : '📂';
}

function getRuntime() {
  const s = process.uptime();
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  return `${h}h ${m}m ${sec}s`;
}

async function fetchImage(url, fallback) {
  try {
    const r = await axios.get(url, { responseType: 'arraybuffer', timeout: 10000 });
    return Buffer.from(r.data);
  } catch {
    if (fallback && fallback !== url) {
      try {
        const r2 = await axios.get(fallback, { responseType: 'arraybuffer', timeout: 10000 });
        return Buffer.from(r2.data);
      } catch { return null; }
    }
    return null;
  }
}

// ─────────────────────────────────────────────
//  .menu  — interactive numbered category menu
// ─────────────────────────────────────────────
const menuCommand = {
  command: 'menu',
  aliases: ['help', 'cmd', 'start'],
  category: 'main',
  description: 'Show main command list with category buttons',
  usage: '.menu',

  async handler(sock, message, args, context) {
    const { chatId, channelInfo } = context;
    try {
      const prefix      = await store.getSetting('global', 'prefix')  || settings.prefix;
      const botName     = await store.getSetting('global', 'botName') || settings.botName;
      const botDesc     = await store.getSetting('global', 'botDesc') || settings.botDesc;
      const botDp       = await store.getSetting('global', 'botDp')   || settings.botDp;
      const botMode     = await store.getBotMode();
      const totalCmds   = commandHandler.commands.size;
      const runtime     = getRuntime();

      // ── Build menu text ──
      let txt = `╭┈┄───【 *${botName}* 】───┄┈╮\n`;
      txt += `├■ 🤖 *Owner:* ${settings.botOwner}\n`;
      txt += `├■ 👑 *Co-Owner:* ${settings.secondOwner}\n`;
      txt += `├■ 📜 *Commands:* ${totalCmds}\n`;
      txt += `├■ ⏱️ *Runtime:* ${runtime}\n`;
      txt += `├■ 📡 *Baileys:* Multi Device\n`;
      txt += `├■ ☁️ *Platform:* ${settings.platform.toUpperCase()}\n`;
      txt += `├■ 📦 *Prefix:* [ ${prefix} ]\n`;
      txt += `├■ ⚙️ *Mode:* ${botMode}\n`;
      txt += `├■ 🖼️ *Version:* ${settings.version}\n`;
      txt += `├■ 📝 *About:* ${botDesc}\n`;
      txt += `╰───────────────┄┈╯\n\n`;

      // ── Categories list ──
      txt += `╭───【 📋 *CATEGORIES* 】───\n`;
      let num = 1;
      const cats = Array.from(commandHandler.categories.keys()).sort();
      for (const cat of cats) {
        const cmds = commandHandler.getCommandsByCategory(cat);
        if (!cmds.length) continue;
        const emoji = getCatEmoji(cat);
        txt += `┋ ${num}. ${emoji} *${cat.toUpperCase()}* — ${cmds.length} cmds\n`;
        num++;
      }
      txt += `╰────────────────────\n\n`;
      txt += `> 💡 _Reply with a number to see that category_\n`;
      txt += `> *© Powered by REDX BOT 🔥*`;

      // ── Fetch image ──
      const imgUrl = (botDp && botDp !== 'uploaded via image') ? botDp : MENU_IMAGE_URL;
      const imgBuf = await fetchImage(imgUrl, MENU_IMAGE_URL);

      if (imgBuf) {
        await sock.sendMessage(chatId, { image: imgBuf, caption: txt, ...channelInfo }, { quoted: message });
      } else {
        await sock.sendMessage(chatId, { text: txt, ...channelInfo }, { quoted: message });
      }

      // ── Quick-link buttons ──
      if (sendInteractiveMessage) {
        const buttons = [
          {
            name: 'cta_url',
            buttonParamsJson: JSON.stringify({
              display_text: '👥 WhatsApp Group',
              url: settings.whatsappGroup
            })
          },
          {
            name: 'cta_url',
            buttonParamsJson: JSON.stringify({
              display_text: '💬 Telegram Group',
              url: settings.telegramGroup
            })
          },
          {
            name: 'cta_url',
            buttonParamsJson: JSON.stringify({
              display_text: '🌐 GitHub Repo',
              url: settings.repoLink
            })
          }
        ];
        await sendInteractiveMessage(sock, chatId, {
          text: '🔗 *JOIN OUR COMMUNITIES*\n\nTap a button below to connect with us.',
          footer: '© REDXBOT302 🔥',
          interactiveButtons: buttons
        }, { quoted: message });
      }

    } catch (err) {
      console.error('menu error:', err);
      await sock.sendMessage(chatId, { text: '❌ Failed to load menu.', ...channelInfo }, { quoted: message });
    }
  }
};

// ─────────────────────────────────────────────
//  .allmenu  — all commands in one big list
// ─────────────────────────────────────────────
const allMenuCommand = {
  command: 'allmenu',
  aliases: ['allcmd', 'allcommands'],
  category: 'main',
  description: 'Show every command across all categories',
  usage: '.allmenu',

  async handler(sock, message, args, context) {
    const { chatId, channelInfo } = context;
    try {
      const prefix    = await store.getSetting('global', 'prefix')  || settings.prefix;
      const botName   = await store.getSetting('global', 'botName') || settings.botName;
      const totalCmds = commandHandler.commands.size;
      const runtime   = getRuntime();

      let txt = `╭┈┄───【 *${botName}* 】───┄┈╮\n`;
      txt += `├■ 🤖 *Owner:* ${settings.botOwner} & ${settings.secondOwner}\n`;
      txt += `├■ 📜 *Commands:* ${totalCmds}\n`;
      txt += `├■ ⏱️ *Runtime:* ${runtime}\n`;
      txt += `├■ 📡 *Baileys:* Multi Device\n`;
      txt += `├■ 📦 *Prefix:* ${prefix}\n`;
      txt += `├■ 🖼️ *Version:* ${settings.version}\n`;
      txt += `╰───────────────┄┈╯\n\n`;

      const cats = Array.from(commandHandler.categories.keys()).sort();
      for (const cat of cats) {
        const cmds = commandHandler.getCommandsByCategory(cat);
        if (!cmds.length) continue;
        const emoji = getCatEmoji(cat);
        txt += `╭──${emoji} *${cat.toUpperCase()}* (${cmds.length})\n`;
        for (const cmd of cmds.sort()) {
          txt += `┋ ➜ *${prefix}${cmd}*\n`;
        }
        txt += `╰──────────────\n\n`;
      }
      txt += `> *© Powered by REDX BOT 🔥*`;

      // send as document if too long, else text
      if (txt.length > 65000) {
        const buf = Buffer.from(txt, 'utf8');
        await sock.sendMessage(chatId, {
          document: buf, mimetype: 'text/plain',
          fileName: 'all-commands.txt', caption: '📋 All commands list (file)',
          ...channelInfo
        }, { quoted: message });
      } else {
        await sock.sendMessage(chatId, { text: txt, ...channelInfo }, { quoted: message });
      }
    } catch (err) {
      console.error('allmenu error:', err);
      await sock.sendMessage(chatId, { text: '❌ Failed to load allmenu.', ...channelInfo }, { quoted: message });
    }
  }
};

// ─────────────────────────────────────────────
//  .catmenu <cat>  — commands for one category
// ─────────────────────────────────────────────
const catMenuCommand = {
  command: 'catmenu',
  aliases: ['cat', 'category'],
  category: 'main',
  description: 'Show commands for a specific category',
  usage: '.catmenu <category>  e.g. .catmenu ai',

  async handler(sock, message, args, context) {
    const { chatId, channelInfo } = context;
    const prefix = await store.getSetting('global', 'prefix') || settings.prefix;
    const catId  = args[0]?.toLowerCase();

    if (!catId) {
      const cats = Array.from(commandHandler.categories.keys()).sort();
      const list = cats.map(c => `• ${getCatEmoji(c)} *${c}*`).join('\n');
      return await sock.sendMessage(chatId, {
        text: `📋 *Available Categories:*\n\n${list}\n\nUsage: *${prefix}catmenu <name>*`,
        ...channelInfo
      }, { quoted: message });
    }

    const cmds = commandHandler.getCommandsByCategory(catId);
    if (!cmds || !cmds.length) {
      return await sock.sendMessage(chatId, {
        text: `❌ No category *${catId}* found or it has no commands.`,
        ...channelInfo
      }, { quoted: message });
    }

    const emoji = getCatEmoji(catId);
    let txt = `╭┈───〔 *${emoji} ${catId.toUpperCase()} MENU* 〕───⊷\n`;
    txt += `┆ Total: *${cmds.length} commands*\n`;
    txt += `╰────────────────────⊷\n`;
    for (const cmd of cmds.sort()) {
      txt += `┋ ➜ *${prefix}${cmd}*\n`;
    }
    txt += `╰────────────────────⊷\n`;
    txt += `> *© REDXBOT302 🔥*`;

    await sock.sendMessage(chatId, { text: txt, ...channelInfo }, { quoted: message });
  }
};

module.exports = [menuCommand, allMenuCommand, catMenuCommand];
