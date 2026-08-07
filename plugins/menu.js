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
 *  ✅ NEW: 5 professional menu styles (.menustyle 1-5) + animated render    *
 *  ✅ SPEED: menu image cached in memory (no re-download per .menu)         *
 *****************************************************************************/

const settings = require('../settings');
const commandHandler = require('../lib/commandHandler');
const store = require('../lib/lightweight_store');
const axios = require('axios');
const { sendInteractiveMessage } = require('gifted-btns');

const MENU_IMAGE_URL = 'https://files.catbox.moe/dfseqs.jpg';

// ✅ SPEED FIX: cache the menu image buffer — old code downloaded it on EVERY
// .menu call (1-10s network hit). 30-min TTL, keyed by URL.
let _imgCache = { url: null, buf: null, ts: 0 };
const IMG_TTL = 30 * 60 * 1000;
async function getMenuImage(url) {
    const now = Date.now();
    if (_imgCache.buf && _imgCache.url === url && now - _imgCache.ts < IMG_TTL) return _imgCache.buf;
    try {
        const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 8000 });
        _imgCache = { url, buf: Buffer.from(res.data), ts: now };
        return _imgCache.buf;
    } catch {
        if (url !== MENU_IMAGE_URL) return getMenuImage(MENU_IMAGE_URL);
        return _imgCache.buf || null; // stale is better than nothing
    }
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ───────────────────────── 5 MENU STYLES ─────────────────────────
const STYLES = {
    1: {
        name: 'REDX CLASSIC',
        emoji: '⚔️',
        header: (i) =>
            `╭┈┄───【 *${i.botName}* 】───┄┈╮\n` +
            `├■ 🤖 *Owner:* ${i.owner}\n` +
            `├■ 📜 *Commands:* ${i.total}\n` +
            `├■ ⏱️ *Runtime:* ${i.uptime}\n` +
            `├■ ☁️ *Platform:* ${i.platform}\n` +
            `├■ 📦 *Prefix:* ${i.prefix}\n` +
            `├■ ⚙️ *Mode:* ${i.mode}\n` +
            `├■ 🖼️ *Version:* ${i.version}\n` +
            `╰───────────────┄┈╯\n\n`,
        catOpen: (c) => `『 *${c}* 』\n╭───────────────┄┈╮\n`,
        cmd: (c) => `┋ ➜ *${c}*\n`,
        catClose: () => `╰───────────────┄┈╯\n\n`,
        footer: `> *© Powered by REDX BOT*`,
    },
    2: {
        name: 'NEON CYBER',
        emoji: '🔮',
        header: (i) =>
            `▄▀▄▀▄ *${i.botName}* ▄▀▄▀▄\n\n` +
            `┏━━⟪ ⚡ *SYSTEM* ⟫━━┓\n` +
            `┃ 👑 Owner   : ${i.owner}\n` +
            `┃ 🧩 Commands: ${i.total}\n` +
            `┃ ⏳ Uptime  : ${i.uptime}\n` +
            `┃ 🌐 Platform: ${i.platform}\n` +
            `┃ 🔑 Prefix  : ${i.prefix}\n` +
            `┃ 🛰️ Mode    : ${i.mode}\n` +
            `┃ 💠 Version : ${i.version}\n` +
            `┗━━━━━━━━━━━━━━┛\n\n`,
        catOpen: (c) => `◢◤ *${c}* ◥◣\n┏━━━━━━━━━━━┓\n`,
        cmd: (c) => `┃ ⟡ ${c}\n`,
        catClose: () => `┗━━━━━━━━━━━┛\n\n`,
        footer: `▄▀▄▀ *© REDX BOT — NEON EDITION* ▀▄▀▄`,
    },
    3: {
        name: 'MINIMAL CLEAN',
        emoji: '🤍',
        header: (i) =>
            `*${i.botName}*\n` +
            `─────────────────\n` +
            `owner    : ${i.owner}\n` +
            `commands : ${i.total}\n` +
            `uptime   : ${i.uptime}\n` +
            `platform : ${i.platform}\n` +
            `prefix   : ${i.prefix}\n` +
            `mode     : ${i.mode}\n` +
            `version  : ${i.version}\n` +
            `─────────────────\n\n`,
        catOpen: (c) => `• *${c.toLowerCase()}*\n`,
        cmd: (c) => `   ${c}\n`,
        catClose: () => `\n`,
        footer: `— redx bot`,
    },
    4: {
        name: 'ROYAL ELEGANT',
        emoji: '👑',
        header: (i) =>
            `✦•┈๑⋅⋯ ⋯⋅๑┈•✦\n` +
            `   ♛ *${i.botName}* ♛\n` +
            `✦•┈๑⋅⋯ ⋯⋅๑┈•✦\n\n` +
            `╔═══ ❖ *ROYAL COURT* ❖ ═══╗\n` +
            `║ ♔ Owner    ﾒ ${i.owner}\n` +
            `║ ♜ Commands ﾒ ${i.total}\n` +
            `║ ⌛ Uptime   ﾒ ${i.uptime}\n` +
            `║ 🏰 Platform ﾒ ${i.platform}\n` +
            `║ ✒️ Prefix   ﾒ ${i.prefix}\n` +
            `║ ⚜️ Mode     ﾒ ${i.mode}\n` +
            `║ 💎 Version  ﾒ ${i.version}\n` +
            `╚═══════ ❖ ═══════╝\n\n`,
        catOpen: (c) => `❖─── *${c}* ───❖\n`,
        cmd: (c) => `  ⚜️ ${c}\n`,
        catClose: () => `❖──────────❖\n\n`,
        footer: `♛ *© REDX BOT — ROYAL EDITION* ♛`,
    },
    5: {
        name: 'MATRIX HACKER',
        emoji: '🟢',
        header: (i) =>
            '```' + `\n[root@redx ~]# ./launch ${String(i.botName).replace(/\s+/g, '_')}\n` +
            `[OK] identity  -> ${i.owner}\n` +
            `[OK] commands  -> ${i.total} loaded\n` +
            `[OK] uptime    -> ${i.uptime}\n` +
            `[OK] platform  -> ${i.platform}\n` +
            `[OK] prefix    -> "${i.prefix}"\n` +
            `[OK] mode      -> ${i.mode}\n` +
            `[OK] version   -> ${i.version}\n` +
            `[OK] status    -> ONLINE\n` + '```\n\n',
        catOpen: (c) => '```# ' + c + '```\n',
        cmd: (c) => `> ${c}\n`,
        catClose: () => `\n`,
        footer: '```[© REDX BOT] session secured — 0 errors```',
    },
};

async function getStyleNumber() {
    const raw = await store.getSetting('global', 'menuStyle');
    const n = parseInt(raw, 10);
    return (n >= 1 && n <= 5) ? n : 1;
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

// Animated loading frames (message-edit based — supported by Baileys)
const FRAMES = (styleName, emoji) => [
    `${emoji} Booting *${styleName}* menu…\n▰▱▱▱▱▱▱▱ 10%`,
    `${emoji} Loading commands…\n▰▰▰▱▱▱▱▱ 45%`,
    `${emoji} Rendering interface…\n▰▰▰▰▰▰▱▱ 80%`,
];

const menuCommand = {
    command: 'menu',
    aliases: ['help', 'cmd'],
    category: 'main',
    description: 'Show the command menu (5 styles — see .menustyle)',
    usage: '.menu [1-5]',

    async handler(sock, message, args, context) {
        const { chatId, channelInfo } = context;
        try {
            // Optional one-shot style override: .menu 3
            let styleNo = parseInt(args?.[0], 10);
            if (!(styleNo >= 1 && styleNo <= 5)) styleNo = await getStyleNumber();
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
                owner: `${settings.botOwner} & ${settings.secondOwner}`,
                total: commandHandler.commands.size,
                uptime: `${Math.floor(up / 3600)}h ${Math.floor((up % 3600) / 60)}m ${Math.floor(up % 60)}s`,
                platform: (settings.platform || 'cloud').toUpperCase(),
                prefix: prefix || settings.prefixes[0],
                mode: botMode,
                version: settings.version,
                desc: botDesc || settings.botDesc,
            };

            const menuText = buildMenuText(styleNo, info);

            // ── Animated render: quick edit frames, then final menu ──
            let anim = null;
            try {
                anim = await sock.sendMessage(chatId, { text: FRAMES(style.name, style.emoji)[0], ...channelInfo }, { quoted: message });
                for (const frame of FRAMES(style.name, style.emoji).slice(1)) {
                    await sleep(450);
                    await sock.sendMessage(chatId, { text: frame, edit: anim.key });
                }
                await sleep(350);
            } catch { anim = null; /* edits unsupported → just send final */ }

            // Fetch image from cache (fast after first call)
            const imgUrl = (botDp && botDp !== 'uploaded via image') ? botDp : MENU_IMAGE_URL;
            const imageBuffer = await getMenuImage(imgUrl);

            if (imageBuffer) {
                // Finish the animation, then deliver the image menu
                if (anim) { try { await sock.sendMessage(chatId, { text: `${style.emoji} *${style.name}* ready — 100% ✅`, edit: anim.key }); } catch {} }
                await sock.sendMessage(chatId, { image: imageBuffer, caption: menuText, ...channelInfo }, { quoted: message });
            } else if (anim) {
                // No image → morph the animation message itself into the menu
                await sock.sendMessage(chatId, { text: menuText, edit: anim.key });
            } else {
                await sock.sendMessage(chatId, { text: menuText, ...channelInfo }, { quoted: message });
            }

            // Quick-link buttons (best-effort)
            try {
                await sendInteractiveMessage(sock, chatId, {
                    text: '🔗 *JOIN OUR COMMUNITIES*\n\nTap the buttons below to join our WhatsApp and Telegram groups.',
                    footer: `Style ${styleNo}/5 — ${style.name} • change with .menustyle`,
                    interactiveButtons: [
                        { name: 'cta_url', buttonParamsJson: JSON.stringify({ display_text: '👥 WhatsApp Group', url: settings.whatsappGroup || 'https://chat.whatsapp.com/LhSmx2SeXX75r8I2bxsNDo' }) },
                        { name: 'cta_url', buttonParamsJson: JSON.stringify({ display_text: '💬 Telegram Group', url: settings.telegramGroup || 'https://t.me/TeamRedxhacker2' }) },
                    ],
                }, { quoted: message });
            } catch {}
        } catch (error) {
            console.error('Error in menu command:', error);
            await sock.sendMessage(chatId, { text: '❌ An error occurred while displaying the menu.', ...channelInfo }, { quoted: message });
        }
    },
};

const menuStyleCommand = {
    command: 'menustyle',
    aliases: ['setmenu', 'menutheme'],
    category: 'main',
    description: 'Choose your menu style (1-5)',
    usage: '.menustyle <1-5>',

    async handler(sock, message, args, context) {
        const { chatId, channelInfo } = context;
        try {
            const n = parseInt(args?.[0], 10);
            if (n >= 1 && n <= 5) {
                await store.saveSetting('global', 'menuStyle', String(n));
                const s = STYLES[n];
                await sock.sendMessage(chatId, {
                    text: `✅ Menu style set to *${n} — ${s.emoji} ${s.name}*\n\nType *.menu* to see it in action!`,
                    ...channelInfo,
                }, { quoted: message });
                return;
            }
            const current = await getStyleNumber();
            let text = `🎨 *MENU STYLE SELECTOR*\n\nReply with *.menustyle <number>*\n\n`;
            for (const [no, s] of Object.entries(STYLES)) {
                text += `${Number(no) === current ? '▶️' : '▫️'} *${no}.* ${s.emoji} ${s.name}${Number(no) === current ? '  _(current)_' : ''}\n`;
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
