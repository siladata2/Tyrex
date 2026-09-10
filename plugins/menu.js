/*****************************************************************************
 *                                                                           *
 *                     Developed By Sila Tech                                *
 *                                                                           *
 *  🌐  GitHub   : https://github.com/Sila-Md                               *
 *                                                                           *
 *    © 2026 Sila Tech. All rights reserved.                               *
 *                                                                           *
 *  ✅ SILA X MINI — Professional Menu System                                *
 *  ✅ Clean modern design with unique Unicode symbols                       *
 *  ✅ ButtonV2 interactive menu                                             *
 *****************************************************************************/

const settings = require('../settings');
const commandHandler = require('../lib/commandHandler');
const store = require('../lib/lightweight_store');
const axios = require('axios');

// ── CONFIG ──────────────────────────────────────────────────
const MENU_IMAGE_URL = 'https://i.ibb.co/Gf4fr5BS/silaxmini.jpg';
const CHANNEL_JID = '120363402325089913@newsletter';
const GROUP_LINK = 'https://chat.whatsapp.com/IS276Wg9zcuCnJRiMDI64g';
const REPO_LINK = 'https://github.com/Sila-Md';

// ── UNIQUE SYMBOLS (No emojis, no ASCII drawings) ──────────
const SYMBOLS = {
  bullet: '𖣂',
  diamond: '𖤍',
  star: '𖥔',
  circle: '𖦹',
  leaf: '𖧧',
  cross: '𖨆',
  heart: '𖩘',
  arrow: '𖪊',
  flower: '𖫓',
  wave: '𖬺',
  gem: '𖭧',
  dot: '𖠋',
  sigma: '𖡡',
  omega: '𖢢',
  delta: '𖣃',
  phi: '𖤌',
  psi: '𖥕',
  theta: '𖦺',
  zeta: '𖧻',
  eta: '𖨸',
  iota: '𖩹',
  kappa: '𖪼',
  lambda: '𖫿',
  mu: '𖬼',
  nu: '𖭼',
  xi: '𖮼'
};

// ── IMAGE CACHE ─────────────────────────────────────────────
let _imgCache = { url: null, buf: null, ts: 0 };
const IMG_TTL = 6 * 60 * 60 * 1000;
let _imgInflight = null;

async function getMenuImage(url) {
  const now = Date.now();
  if (_imgCache.buf && _imgCache.url === url && now - _imgCache.ts < IMG_TTL) return _imgCache.buf;
  if (_imgInflight) { try { return await _imgInflight; } catch {} }
  _imgInflight = (async () => {
    try {
      const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 8000 });
      _imgCache = { url, buf: Buffer.from(res.data), ts: now };
      return _imgCache.buf;
    } catch {
      if (url !== MENU_IMAGE_URL) return getMenuImage(MENU_IMAGE_URL);
      return _imgCache.buf || null;
    } finally { _imgInflight = null; }
  })();
  return _imgInflight;
}

getMenuImage(MENU_IMAGE_URL).catch(() => {});

// ── MENU STYLES ─────────────────────────────────────────────
const STYLES = {
  1: {
    name: 'ELEGANT',
    symbol: SYMBOLS.gem,
    header: (i) =>
      `${SYMBOLS.gem} ${i.botName}\n` +
      `\n` +
      `${SYMBOLS.dot} Owner     : ${i.owner}\n` +
      `${SYMBOLS.dot} Commands  : ${i.total}\n` +
      `${SYMBOLS.dot} Runtime   : ${i.uptime}\n` +
      `${SYMBOLS.dot} Platform  : ${i.platform}\n` +
      `${SYMBOLS.dot} Prefix    : ${i.prefix}\n` +
      `${SYMBOLS.dot} Mode      : ${i.mode}\n` +
      `${SYMBOLS.dot} Version   : ${i.version}\n` +
      `\n`,
    catOpen: (c) => `${SYMBOLS.arrow} ${c}\n`,
    cmd: (c) => `  ${SYMBOLS.bullet} ${c}\n`,
    catClose: () => `\n`,
    footer: `${SYMBOLS.heart} ${i => i.botName} — ${i => i.owner}\n𝐏𝐨𝐰𝐞𝐫𝐝 𝐁𝐲 𝐒𝐢𝐥𝐚 𝐓𝐞𝐜𝐡`,
  },
  2: {
    name: 'MODERN',
    symbol: SYMBOLS.diamond,
    header: (i) =>
      `${SYMBOLS.diamond} ${i.botName} ${SYMBOLS.diamond}\n` +
      `\n` +
      `${SYMBOLS.leaf} Owner     ${SYMBOLS.arrow} ${i.owner}\n` +
      `${SYMBOLS.leaf} Commands  ${SYMBOLS.arrow} ${i.total}\n` +
      `${SYMBOLS.leaf} Runtime   ${SYMBOLS.arrow} ${i.uptime}\n` +
      `${SYMBOLS.leaf} Platform  ${SYMBOLS.arrow} ${i.platform}\n` +
      `${SYMBOLS.leaf} Prefix    ${SYMBOLS.arrow} ${i.prefix}\n` +
      `${SYMBOLS.leaf} Mode      ${SYMBOLS.arrow} ${i.mode}\n` +
      `${SYMBOLS.leaf} Version   ${SYMBOLS.arrow} ${i.version}\n` +
      `\n`,
    catOpen: (c) => `${SYMBOLS.sigma} ${c}\n`,
    cmd: (c) => `  ${SYMBOLS.circle} ${c}\n`,
    catClose: () => `\n`,
    footer: `${SYMBOLS.flower} ${i => i.botName} — ${i => i.owner}\n𝐏𝐨𝐰𝐞𝐫𝐝 𝐁𝐲 𝐒𝐢𝐥𝐚 𝐓𝐞𝐜𝐡`,
  },
  3: {
    name: 'MINIMAL',
    symbol: SYMBOLS.dot,
    header: (i) =>
      `${i.botName}\n` +
      `\n` +
      `owner    ${SYMBOLS.arrow} ${i.owner}\n` +
      `commands ${SYMBOLS.arrow} ${i.total}\n` +
      `runtime  ${SYMBOLS.arrow} ${i.uptime}\n` +
      `platform ${SYMBOLS.arrow} ${i.platform}\n` +
      `prefix   ${SYMBOLS.arrow} ${i.prefix}\n` +
      `mode     ${SYMBOLS.arrow} ${i.mode}\n` +
      `version  ${SYMBOLS.arrow} ${i.version}\n` +
      `\n`,
    catOpen: (c) => `${SYMBOLS.bullet} ${c}\n`,
    cmd: (c) => `  ${SYMBOLS.dot} ${c}\n`,
    catClose: () => `\n`,
    footer: `${i => i.botName} — ${i => i.owner}\n𝐏𝐨𝐰𝐞𝐫𝐝 𝐁𝐲 𝐒𝐢𝐥𝐚 𝐓𝐞𝐜𝐡`,
  },
  4: {
    name: 'ROYAL',
    symbol: SYMBOLS.cross,
    header: (i) =>
      `${SYMBOLS.cross} ${i.botName} ${SYMBOLS.cross}\n` +
      `\n` +
      `${SYMBOLS.gem} Owner     ${SYMBOLS.arrow} ${i.owner}\n` +
      `${SYMBOLS.gem} Commands  ${SYMBOLS.arrow} ${i.total}\n` +
      `${SYMBOLS.gem} Runtime   ${SYMBOLS.arrow} ${i.uptime}\n` +
      `${SYMBOLS.gem} Platform  ${SYMBOLS.arrow} ${i.platform}\n` +
      `${SYMBOLS.gem} Prefix    ${SYMBOLS.arrow} ${i.prefix}\n` +
      `${SYMBOLS.gem} Mode      ${SYMBOLS.arrow} ${i.mode}\n` +
      `${SYMBOLS.gem} Version   ${SYMBOLS.arrow} ${i.version}\n` +
      `\n`,
    catOpen: (c) => `${SYMBOLS.delta} ${c}\n`,
    cmd: (c) => `  ${SYMBOLS.phi} ${c}\n`,
    catClose: () => `\n`,
    footer: `${SYMBOLS.omega} ${i => i.botName} — ${i => i.owner}\n𝐏𝐨𝐰𝐞𝐫𝐝 𝐁𝐲 𝐒𝐢𝐥𝐚 𝐓𝐞𝐜𝐡`,
  },
  5: {
    name: 'TECH',
    symbol: SYMBOLS.sigma,
    header: (i) =>
      `${SYMBOLS.sigma} ${i.botName}\n` +
      `\n` +
      `${SYMBOLS.zeta} Owner     ${SYMBOLS.arrow} ${i.owner}\n` +
      `${SYMBOLS.zeta} Commands  ${SYMBOLS.arrow} ${i.total}\n` +
      `${SYMBOLS.zeta} Runtime   ${SYMBOLS.arrow} ${i.uptime}\n` +
      `${SYMBOLS.zeta} Platform  ${SYMBOLS.arrow} ${i.platform}\n` +
      `${SYMBOLS.zeta} Prefix    ${SYMBOLS.arrow} ${i.prefix}\n` +
      `${SYMBOLS.zeta} Mode      ${SYMBOLS.arrow} ${i.mode}\n` +
      `${SYMBOLS.zeta} Version   ${SYMBOLS.arrow} ${i.version}\n` +
      `\n`,
    catOpen: (c) => `${SYMBOLS.theta} ${c}\n`,
    cmd: (c) => `  ${SYMBOLS.psi} ${c}\n`,
    catClose: () => `\n`,
    footer: `${SYMBOLS.lambda} ${i => i.botName} — ${i => i.owner}\n𝐏𝐨𝐰𝐞𝐫𝐝 𝐁𝐲 𝐒𝐢𝐥𝐚 𝐓𝐞𝐜𝐡`,
  },
  6: {
    name: 'NATURAL',
    symbol: SYMBOLS.leaf,
    header: (i) =>
      `${SYMBOLS.leaf} ${i.botName}\n` +
      `\n` +
      `${SYMBOLS.flower} Owner     ${SYMBOLS.arrow} ${i.owner}\n` +
      `${SYMBOLS.flower} Commands  ${SYMBOLS.arrow} ${i.total}\n` +
      `${SYMBOLS.flower} Runtime   ${SYMBOLS.arrow} ${i.uptime}\n` +
      `${SYMBOLS.flower} Platform  ${SYMBOLS.arrow} ${i.platform}\n` +
      `${SYMBOLS.flower} Prefix    ${SYMBOLS.arrow} ${i.prefix}\n` +
      `${SYMBOLS.flower} Mode      ${SYMBOLS.arrow} ${i.mode}\n` +
      `${SYMBOLS.flower} Version   ${SYMBOLS.arrow} ${i.version}\n` +
      `\n`,
    catOpen: (c) => `${SYMBOLS.wave} ${c}\n`,
    cmd: (c) => `  ${SYMBOLS.leaf} ${c}\n`,
    catClose: () => `\n`,
    footer: `${SYMBOLS.heart} ${i => i.botName} — ${i => i.owner}\n𝐏𝐨𝐰𝐞𝐫𝐝 𝐁𝐲 𝐒𝐢𝐥𝐚 𝐓𝐞𝐜𝐡`,
  },
  7: {
    name: 'COSMIC',
    symbol: SYMBOLS.star,
    header: (i) =>
      `${SYMBOLS.star} ${i.botName} ${SYMBOLS.star}\n` +
      `\n` +
      `${SYMBOLS.omega} Owner     ${SYMBOLS.arrow} ${i.owner}\n` +
      `${SYMBOLS.omega} Commands  ${SYMBOLS.arrow} ${i.total}\n` +
      `${SYMBOLS.omega} Runtime   ${SYMBOLS.arrow} ${i.uptime}\n` +
      `${SYMBOLS.omega} Platform  ${SYMBOLS.arrow} ${i.platform}\n` +
      `${SYMBOLS.omega} Prefix    ${SYMBOLS.arrow} ${i.prefix}\n` +
      `${SYMBOLS.omega} Mode      ${SYMBOLS.arrow} ${i.mode}\n` +
      `${SYMBOLS.omega} Version   ${SYMBOLS.arrow} ${i.version}\n` +
      `\n`,
    catOpen: (c) => `${SYMBOLS.xi} ${c}\n`,
    cmd: (c) => `  ${SYMBOLS.iota} ${c}\n`,
    catClose: () => `\n`,
    footer: `${SYMBOLS.gem} ${i => i.botName} — ${i => i.owner}\n𝐏𝐨𝐰𝐞𝐫𝐝 𝐁𝐲 𝐒𝐢𝐥𝐚 𝐓𝐞𝐜𝐡`,
  },
  8: {
    name: 'PREMIUM',
    symbol: SYMBOLS.heart,
    header: (i) =>
      `${SYMBOLS.heart} ${i.botName} ${SYMBOLS.heart}\n` +
      `\n` +
      `${SYMBOLS.diamond} Owner     ${SYMBOLS.arrow} ${i.owner}\n` +
      `${SYMBOLS.diamond} Commands  ${SYMBOLS.arrow} ${i.total}\n` +
      `${SYMBOLS.diamond} Runtime   ${SYMBOLS.arrow} ${i.uptime}\n` +
      `${SYMBOLS.diamond} Platform  ${SYMBOLS.arrow} ${i.platform}\n` +
      `${SYMBOLS.diamond} Prefix    ${SYMBOLS.arrow} ${i.prefix}\n` +
      `${SYMBOLS.diamond} Mode      ${SYMBOLS.arrow} ${i.mode}\n` +
      `${SYMBOLS.diamond} Version   ${SYMBOLS.arrow} ${i.version}\n` +
      `\n`,
    catOpen: (c) => `${SYMBOLS.mu} ${c}\n`,
    cmd: (c) => `  ${SYMBOLS.nu} ${c}\n`,
    catClose: () => `\n`,
    footer: `${SYMBOLS.omega} ${i => i.botName} — ${i => i.owner}\n𝐏𝐨𝐰𝐞𝐫𝐝 𝐁𝐲 𝐒𝐢𝐥𝐚 𝐓𝐞𝐜𝐡`,
  },
};
const STYLE_COUNT = Object.keys(STYLES).length;

async function getStyleNumber() {
  const raw = await store.getSetting('global', 'menuStyle');
  const n = parseInt(raw, 10);
  return (n >= 1 && n <= STYLE_COUNT) ? n : 1;
}

function buildMenuText(styleNo, info) {
  const s = STYLES[styleNo] || STYLES[1];
  let text = s.header(info);
  const categories = Array.from(commandHandler.categories.keys()).sort();
  for (const cat of categories) {
    const cmdList = commandHandler.getCommandsByCategory(cat);
    if (!cmdList.length) continue;
    text += s.catOpen(cat.toUpperCase());
    for (const cmd of cmdList) text += s.cmd(cmd);
    text += s.catClose();
  }
  // Footer - handle as function with info
  if (typeof s.footer === 'function') {
    text += s.footer(info);
  } else {
    text += s.footer;
  }
  return text;
}

// ── BUTTON MENU COMMAND ─────────────────────────────────────
const menuCommand = {
  command: 'menu',
  aliases: ['help', 'cmd'],
  category: 'main',
  description: 'Show interactive menu with buttons',
  usage: '.menu',

  async handler(sock, message, args, context) {
    const { chatId, channelInfo } = context;
    try {
      let styleNo = parseInt(args?.[0], 10);
      if (!(styleNo >= 1 && styleNo <= STYLE_COUNT)) styleNo = await getStyleNumber();
      const style = STYLES[styleNo];

      const [prefix, botName, botDesc, botDp, botMode] = await Promise.all([
        store.getSetting('global', 'prefix'),
        store.getSetting('global', 'botName'),
        store.getSetting('global', 'botDesc'),
        store.getSetting('global', 'botDp'),
        store.getBotMode(),
      ]);

      const up = process.uptime();
      const info = {
        botName: botName || settings.botName,
        owner: settings.botOwner || 'Richard Besisila',
        total: commandHandler.commands.size,
        uptime: `${Math.floor(up / 3600)}h ${Math.floor((up % 3600) / 60)}m ${Math.floor(up % 60)}s`,
        platform: (settings.platform || 'cloud').toUpperCase(),
        prefix: prefix || settings.prefixes[0],
        mode: botMode || 'public',
        version: settings.version || 'v1.0',
        desc: botDesc || settings.botDesc,
      };

      const menuText = buildMenuText(styleNo, info);
      const imgUrl = (botDp && botDp !== 'uploaded via image') ? botDp : MENU_IMAGE_URL;
      const imageBuffer = await getMenuImage(imgUrl);

      // ── SEND IMAGE + CAPTION ──────────────────────────────
      if (imageBuffer) {
        await sock.sendMessage(chatId, { 
          image: imageBuffer, 
          caption: menuText,
          ...channelInfo 
        }, { quoted: message });
      } else {
        await sock.sendMessage(chatId, { 
          text: menuText,
          ...channelInfo 
        }, { quoted: message });
      }

      // ── SEND INTERACTIVE BUTTONS ──────────────────────────
      const buttonMessage = {
        text: `${SYMBOLS.gem} ${info.botName}\n\n${SYMBOLS.arrow} Explore our communities and resources\n${SYMBOLS.heart} Powered By 𝐒𝐢𝐥𝐚 𝐓𝐞𝐜𝐡`,
        footer: `Style ${styleNo}/${STYLE_COUNT} • ${style.name}`,
        interactiveButtons: [
          {
            name: 'cta_url',
            buttonParamsJson: JSON.stringify({
              display_text: 'WhatsApp Channel',
              url: `https://whatsapp.com/channel/${CHANNEL_JID.split('@')[0]}`
            })
          },
          {
            name: 'cta_url',
            buttonParamsJson: JSON.stringify({
              display_text: 'WhatsApp Group',
              url: GROUP_LINK
            })
          },
          {
            name: 'cta_url',
            buttonParamsJson: JSON.stringify({
              display_text: 'GitHub Repo',
              url: REPO_LINK
            })
          }
        ]
      };

      try {
        const { sendInteractiveMessage } = require('gifted-btns');
        await sendInteractiveMessage(sock, chatId, buttonMessage, { quoted: message });
      } catch (e) {
        // Fallback - send simple text with links
        await sock.sendMessage(chatId, {
          text: `\n${SYMBOLS.arrow} Resources:\n${SYMBOLS.bullet} Channel: https://whatsapp.com/channel/${CHANNEL_JID.split('@')[0]}\n${SYMBOLS.bullet} Group: ${GROUP_LINK}\n${SYMBOLS.bullet} GitHub: ${REPO_LINK}`,
          ...channelInfo
        }, { quoted: message });
      }

    } catch (error) {
      console.error('Error in menu command:', error);
      await sock.sendMessage(chatId, { 
        text: `${SYMBOLS.cross} An error occurred while displaying the menu.`,
        ...channelInfo 
      }, { quoted: message });
    }
  },
};

// ── MENU STYLE COMMAND ──────────────────────────────────────
const menuStyleCommand = {
  command: 'menustyle',
  aliases: ['setmenu', 'menutheme'],
  category: 'main',
  description: 'Choose your menu style (1-8)',
  usage: '.menustyle <1-8>',

  async handler(sock, message, args, context) {
    const { chatId, channelInfo } = context;
    try {
      const n = parseInt(args?.[0], 10);
      if (n >= 1 && n <= STYLE_COUNT) {
        await store.saveSetting('global', 'menuStyle', String(n));
        const s = STYLES[n];
        await sock.sendMessage(chatId, {
          text: `${SYMBOLS.gem} Menu style set to ${n} — ${s.symbol} ${s.name}\n\n${SYMBOLS.arrow} Type .menu to see it in action!`,
          ...channelInfo,
        }, { quoted: message });
        return;
      }
      const current = await getStyleNumber();
      let text = `${SYMBOLS.diamond} MENU STYLE SELECTOR\n\n${SYMBOLS.arrow} Reply with .menustyle <number>\n\n`;
      for (const [no, s] of Object.entries(STYLES)) {
        text += `${Number(no) === current ? SYMBOLS.omega : SYMBOLS.dot} ${no}. ${s.symbol} ${s.name}${Number(no) === current ? '  (active)' : ''}\n`;
      }
      text += `\n${SYMBOLS.leaf} Tip: .menu 3 previews a style once without saving.`;
      await sock.sendMessage(chatId, { text, ...channelInfo }, { quoted: message });
    } catch (error) {
      console.error('Error in menustyle command:', error);
      await sock.sendMessage(chatId, { 
        text: `${SYMBOLS.cross} Failed to set menu style.`,
        ...channelInfo 
      }, { quoted: message });
    }
  },
};

module.exports = [menuCommand, menuStyleCommand];