/* Powerd By TYREX_KSH TECH */

const settings = require('../settings');
const commandHandler = require('../lib/commandHandler');
const store = require('../lib/lightweight_store');
const axios = require('axios');
const { sendInteractiveMessage } = require('gifted-btns');

const MENU_IMAGE_URL = 'https://files.catbox.moe/p8xi4o.jpeg';

// SPEED FIX: cache the menu image buffer
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

// Convert string to small-caps unicode
function toSmallCaps(str) {
    const map = {
        a:'ᴀ', b:'ʙ', c:'ᴄ', d:'ᴅ', e:'ᴇ', f:'ғ', g:'ɢ', h:'ʜ', i:'ɪ', j:'ᴊ',
        k:'ᴋ', l:'ʟ', m:'ᴍ', n:'ɴ', o:'ᴏ', p:'ᴘ', q:'ǫ', r:'ʀ', s:'s', t:'ᴛ',
        u:'ᴜ', v:'ᴠ', w:'ᴡ', x:'x', y:'ʏ', z:'ᴢ'
    };
    return String(str).toLowerCase().replace(/[a-z]/g, c => map[c] || c);
}

// ═══════════════════════════════════════════════
//  5 MODERN MENU STYLES — TYREX-KSH-TECH
// ═══════════════════════════════════════════════
const STYLES = {

    // ─── STYLE 1: NEON GLASS ───────────────────
    1: {
        name: 'NEON GLASS',
        emoji: '💎',
        header: (i) =>
            `╔═══════════════════════╗\n` +
            `║  ✦ 𝐓𝐘𝐑𝐄𝐗-𝐊𝐒𝐇-𝐓𝐄𝐂𝐇 ✦  ║\n` +
            `╚═══════════════════════╝\n` +
            `┏━━━━━━━━━━━━━━━━━━━━━┓\n` +
            `┃ 👑 *Owner*    : ${i.owner}\n` +
            `┃ ⚡ *Commands* : ${i.total}\n` +
            `┃ ⏱️ *Runtime*  : ${i.uptime}\n` +
            `┃ 🔑 *Prefix*   : ${i.prefix}\n` +
            `┃ 🌐 *Mode*     : ${i.mode}\n` +
            `┃ 🧩 *Version*  : ${i.version}\n` +
            `┗━━━━━━━━━━━━━━━━━━━━━┛\n\n`,
        catOpen: (c) => `\n┌───〔 ${c} 〕───┐\n`,
        cmd: (c) => `│ ⬡ ${toSmallCaps(c)}\n`,
        catClose: () => `└───────────────────┘\n`,
        footer: `\n╭━━━━━━━━━━━━━━━━━━━╮\n┃ © 𝐓𝐘𝐑𝐄𝐗-𝐊𝐒𝐇-𝐓𝐄𝐂𝐇 ┃\n╰━━━━━━━━━━━━━━━━━━━╯`,
    },

    // ─── STYLE 2: ROYAL CROWN ──────────────────
    2: {
        name: 'ROYAL CROWN',
        emoji: '👑',
        header: (i) =>
            `♔♕♖♗♘♙ ━━━━━━━ ♙♘♗♖♕♔\n` +
            `       ✦ 𝐓𝐘𝐑𝐄𝐗-𝐊𝐒𝐇-𝐓𝐄𝐂𝐇 ✦\n` +
            `♔♕♖♗♘♙ ━━━━━━━ ♙♘♗♖♕♔\n\n` +
            `╭━━━━━━━━━━━━━━━━━━━╮\n` +
            `┃ 👑 Owner    : ${i.owner}\n` +
            `┃ ⚡ Commands : ${i.total}\n` +
            `┃ ⏱️ Runtime  : ${i.uptime}\n` +
            `┃ 🔑 Prefix   : ${i.prefix}\n` +
            `┃ 🌐 Mode     : ${i.mode}\n` +
            `┃ 🧩 Version  : ${i.version}\n` +
            `╰━━━━━━━━━━━━━━━━━━━╯\n\n`,
        catOpen: (c) => `\n❖ ━━━〔 ${c} 〕━━━ ❖\n`,
        cmd: (c) => `  ⤷ ${toSmallCaps(c)}\n`,
        catClose: () => `❖ ━━━━━━━━━━━━━━━━━ ❖\n`,
        footer: `\n      ♛ 𝐓𝐘𝐑𝐄𝐗-𝐊𝐒𝐇-𝐓𝐄𝐂𝐇 ♛`,
    },

    // ─── STYLE 3: CYBER PULSE ──────────────────
    3: {
        name: 'CYBER PULSE',
        emoji: '⚡',
        header: (i) =>
            `▄▀▄▀▄▀▄▀▄▀▄▀▄▀▄▀▄▀▄▀▄▀▄\n` +
            `█ ⚡ 𝐓𝐘𝐑𝐄𝐗-𝐊𝐒𝐇-𝐓𝐄𝐂𝐇 ⚡ █\n` +
            `▀▄▀▄▀▄▀▄▀▄▀▄▀▄▀▄▀▄▀▄▀▄▀\n\n` +
            `╭─〔 ⚙️ SYSTEM CORE 〕─╮\n` +
            `│ 👑 ${i.owner}\n` +
            `│ ⚡ ${i.total} commands\n` +
            `│ ⏱️ ${i.uptime}\n` +
            `│ 🔑 ${i.prefix}\n` +
            `│ 🌐 ${i.mode}\n` +
            `│ 🧩 v${i.version}\n` +
            `╰──────────────────╯\n\n`,
        catOpen: (c) => `\n⟪ ⚡ ${c} ⚡ ⟫\n╭──────────────────╮\n`,
        cmd: (c) => `│ ▸ ${toSmallCaps(c)}\n`,
        catClose: () => `╰──────────────────╯\n`,
        footer: `\n▄▀▄▀ ⚡ 𝐓𝐘𝐑𝐄𝐗-𝐊𝐒𝐇-𝐓𝐄𝐂𝐇 ⚡ ▀▄▀▄`,
    },

    // ─── STYLE 4: STAR GALAXY ──────────────────
    4: {
        name: 'STAR GALAXY',
        emoji: '🌌',
        header: (i) =>
            `✧･ﾟ: *✧･ﾟ:* 🌌 *:･ﾟ✧*:･ﾟ✧\n` +
            `     ✦ 𝐓𝐘𝐑𝐄𝐗-𝐊𝐒𝐇-𝐓𝐄𝐂𝐇 ✦\n` +
            `✧･ﾟ: *✧･ﾟ:* 🌌 *:･ﾟ✧*:･ﾟ✧\n\n` +
            `╔═══════════════════╗\n` +
            `║ 🌟 COSMOS DATA 🌟 ║\n` +
            `╠═══════════════════╣\n` +
            `║ 👑 ${i.owner}\n` +
            `║ ⚡ ${i.total} commands\n` +
            `║ ⏱️ ${i.uptime}\n` +
            `║ 🔑 ${i.prefix}\n` +
            `║ 🌐 ${i.mode}\n` +
            `║ 🧩 v${i.version}\n` +
            `╚═══════════════════╝\n\n`,
        catOpen: (c) => `\n✩░▒▓ ${c} ▓▒░✩\n`,
        cmd: (c) => `  ✦ ${toSmallCaps(c)}\n`,
        catClose: () => `✩░▒▓▓▒░✩\n`,
        footer: `\n  ✧･ﾟ 🌌 𝐓𝐘𝐑𝐄𝐗-𝐊𝐒𝐇-𝐓𝐄𝐂𝐇 🌌 ﾟ･✧`,
    },

    // ─── STYLE 5: FIRE PHOENIX ─────────────────
    5: {
        name: 'FIRE PHOENIX',
        emoji: '🔥',
        header: (i) =>
            `🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥\n` +
            `🔥  𝐓𝐘𝐑𝐄𝐗-𝐊𝐒𝐇-𝐓𝐄𝐂𝐇  🔥\n` +
            `🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥\n\n` +
            `╭━━〔 🐦‍🔥 PHOENIX 〕━━╮\n` +
            `┃ 👑 ${i.owner}\n` +
            `┃ ⚡ ${i.total} commands\n` +
            `┃ ⏱️ ${i.uptime}\n` +
            `┃ 🔑 ${i.prefix}\n` +
            `┃ 🌐 ${i.mode}\n` +
            `┃ 🧩 v${i.version}\n` +
            `╰━━━━━━━━━━━━━━━━━━╯\n\n`,
        catOpen: (c) => `\n🔥 ━━〔 ${c} 〕━━ 🔥\n`,
        cmd: (c) => `  ▸ ${toSmallCaps(c)}\n`,
        catClose: () => `🔥 ━━━━━━━━━━━━━━ 🔥\n`,
        footer: `\n🔥 𝐓𝐘𝐑𝐄𝐗-𝐊𝐒𝐇-𝐓𝐄𝐂𝐇 🔥`,
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
    text += s.footer;
    return text;
}

const menuCommand = {
    command: 'menu2',
    aliases: ['help2', 'cmd'],
    category: 'main',
    description: 'Show the command menu (5 styles — see .menustyle)',
    usage: '.menu [1-5]',

    async handler(sock, message, args, context) {
        const { chatId, channelInfo } = context;
        try {
            let styleNo = parseInt(args?.[0], 10);
            if (!(styleNo >= 1 && styleNo <= STYLE_COUNT)) styleNo = await getStyleNumber();
            const style = STYLES[styleNo];

            const [prefix, botDesc, botDp, botMode] = await Promise.all([
                store.getSetting('global', 'prefix'),
                store.getSetting('global', 'botDesc'),
                store.getSetting('global', 'botDp'),
                store.getBotMode(),
            ]);

            const up = process.uptime();
            const info = {
                botName: '𝐓𝐘𝐑𝐄𝐗-𝐊𝐒𝐇-𝐓𝐄𝐂𝐇',
                owner: `${settings.botOwner}${settings.secondOwner ? ' & ' + settings.secondOwner : ''}`,
                total: commandHandler.commands.size,
                uptime: `${Math.floor(up / 3600)}h ${Math.floor((up % 3600) / 60)}m ${Math.floor(up % 60)}s`,
                platform: (settings.platform || 'cloud').toUpperCase(),
                prefix: prefix || settings.prefixes[0],
                mode: botMode,
                version: settings.version,
                desc: botDesc || settings.botDesc,
            };

            const menuText = buildMenuText(styleNo, info);

            const imgUrl = (botDp && botDp !== 'uploaded via image') ? botDp : MENU_IMAGE_URL;
            const imageBuffer = await getMenuImage(imgUrl);

            if (imageBuffer) {
                await sock.sendMessage(chatId, { image: imageBuffer, caption: menuText, ...channelInfo }, { quoted: message });
            } else {
                await sock.sendMessage(chatId, { text: menuText, ...channelInfo }, { quoted: message });
            }

            sendInteractiveMessage(sock, chatId, {
                text: '*JOIN OUR COMMUNITY*\n\nTap the button below to join our WhatsApp group.',
                footer: `Style ${styleNo}/${STYLE_COUNT} — ${style.emoji} ${style.name}  change with .menustyle`,
                interactiveButtons: [
                    { name: 'cta_url', buttonParamsJson: JSON.stringify({ display_text: 'WhatsApp Group', url: settings.whatsappGroup || 'https://chat.whatsapp.com/IS276Wg9zcuCnJRiMDI64g' }) },
                ],
            }, { quoted: message }).catch(() => {});
        } catch (error) {
            console.error('Error in menu command:', error);
            await sock.sendMessage(chatId, { text: '❌ An error occurred while displaying the menu.', ...channelInfo }, { quoted: message });
        }
    },
};

const menuStyleCommand = {
    command: 'menu2style',
    aliases: ['setmenu2', 'menutheme'],
    category: 'main',
    description: 'Choose your menu style (1-5)',
    usage: '.menustyle <1-5>',

    async handler(sock, message, args, context) {
        const { chatId, channelInfo } = context;
        try {
            const n = parseInt(args?.[0], 10);
            if (n >= 1 && n <= STYLE_COUNT) {
                await store.saveSetting('global', 'menuStyle', String(n));
                const s = STYLES[n];
                await sock.sendMessage(chatId, {
                    text: `✅ Menu style set to *${n} — ${s.emoji} ${s.name}*\n\nType *.menu* to see it in action!`,
                    ...channelInfo,
                }, { quoted: message });
                return;
            }
            const current = await getStyleNumber();
            let text = `╔═══════════════════╗\n║ 🎨 *MENU STYLES* 🎨 ║\n╚═══════════════════╝\n\n`;
            for (const [no, s] of Object.entries(STYLES)) {
                text += `${Number(no) === current ? '✅' : '▫️'} *${no}.* ${s.emoji} ${s.name}${Number(no) === current ? ' _(current)_' : ''}\n`;
            }
            text += `\n💡 Tip: *.menu 3* previews a style once without saving.`;
            await sock.sendMessage(chatId, { text, ...channelInfo }, { quoted: message });
        } catch (error) {
            console.error('Error in menustyle command:', error);
            await sock.sendMessage(chatId, { text: '❌ Failed to set menu style.', ...channelInfo }, { quoted: message });
        }
    },
};

module.exports = [menuCommand, menuStyleCommand];