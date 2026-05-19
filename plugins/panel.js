/*****************************************************************************
 *  REDX BOT — .panel command
 *  Password-protected advanced control panel for owner/sudo
 *  Default password: redx  (changeable inside panel)
 *****************************************************************************/

const fs = require('fs');
const path = require('path');
const store = require('../lib/lightweight_store');

const PANEL_CONFIG_PATH = path.join(__dirname, '../data/panel.json');
const HAS_DB = !!(process.env.MONGO_URL || process.env.POSTGRES_URL || process.env.DB_URL);

// In-memory sessions: key = senderId, value = { unlocked, expires }
const sessions = new Map();
const SESSION_TTL = 10 * 60 * 1000; // 10 minutes

async function loadPanelConfig() {
    try {
        if (HAS_DB) {
            const cfg = await store.getSetting('global', 'panel');
            return cfg || { password: 'redx' };
        }
        if (!fs.existsSync(PANEL_CONFIG_PATH)) return { password: 'redx' };
        return JSON.parse(fs.readFileSync(PANEL_CONFIG_PATH, 'utf8'));
    } catch { return { password: 'redx' }; }
}

async function savePanelConfig(cfg) {
    try {
        if (HAS_DB) return await store.saveSetting('global', 'panel', cfg);
        if (!fs.existsSync(path.dirname(PANEL_CONFIG_PATH))) fs.mkdirSync(path.dirname(PANEL_CONFIG_PATH), { recursive: true });
        fs.writeFileSync(PANEL_CONFIG_PATH, JSON.stringify(cfg, null, 2));
    } catch (e) { console.error('[PANEL] save error:', e.message); }
}

function isUnlocked(senderId) {
    const session = sessions.get(senderId);
    if (!session) return false;
    if (Date.now() > session.expires) { sessions.delete(senderId); return false; }
    return session.unlocked;
}

function unlock(senderId) {
    sessions.set(senderId, { unlocked: true, expires: Date.now() + SESSION_TTL });
}

function lock(senderId) {
    sessions.delete(senderId);
}

function panelMenu() {
    return `╔══════════════════════════╗
║  🔐  R E D X  P A N E L  ║
╚══════════════════════════╝

*⚙️ BOT CONTROLS*
├ \`.panel restart\` — Restart bot process
├ \`.panel stop\` — Stop bot (careful!)
├ \`.panel cleartmp\` — Clear temp files
├ \`.panel clearmem\` — Force memory cleanup
├ \`.panel status\` — Show RAM/uptime stats

*👥 USER MANAGEMENT*
├ \`.panel ban <number>\` — Ban a user
├ \`.panel unban <number>\` — Unban a user
├ \`.panel sudo add <number>\` — Add sudo user
├ \`.panel sudo remove <number>\` — Remove sudo
├ \`.panel listbanned\` — List banned users
├ \`.panel listsudo\` — List sudo users

*🔧 BOT SETTINGS*
├ \`.panel setname <name>\` — Change bot name
├ \`.panel setprefix <prefix>\` — Change prefix
├ \`.panel mode public\` — Set bot to public
├ \`.panel mode private\` — Set bot to private
├ \`.panel setowner <number>\` — Change owner

*🔑 SECURITY*
├ \`.panel changepass <new>\` — Change panel password
├ \`.panel lock\` — Lock panel session
└ \`.panel logout\` — Logout from panel

⏳ Session expires in 10 minutes of inactivity`;
}

module.exports = {
    command: 'panel',
    aliases: ['admin-panel', 'cp'],
    category: 'owner',
    description: 'Password-protected admin control panel',
    usage: '.panel <password>  or  .panel <command>',
    ownerOnly: true,

    async handler(sock, message, args, context = {}) {
        const chatId = context.chatId || message.key.remoteJid;
        const senderId = message.key.participant || message.key.remoteJid;
        const channelInfo = context.channelInfo || {};
        const settings = require('../settings');

        // Check if already unlocked
        if (!isUnlocked(senderId)) {
            const input = args[0];
            if (!input) {
                return sock.sendMessage(chatId, {
                    text: `🔐 *REDX PANEL*\n\nThis panel is password protected.\n\nUse: \`.panel <password>\` to unlock\n\n_Default password: \`redx\`_`
                }, { quoted: message });
            }
            const cfg = await loadPanelConfig();
            if (input !== cfg.password) {
                return sock.sendMessage(chatId, { text: `❌ *Wrong password!*\n\nTry again with \`.panel <password>\`` }, { quoted: message });
            }
            unlock(senderId);
            return sock.sendMessage(chatId, {
                text: `✅ *Panel Unlocked!*\n\n${panelMenu()}`
            }, { quoted: message });
        }

        // Panel is unlocked — process command
        const cmd = args[0]?.toLowerCase();

        if (!cmd) {
            return sock.sendMessage(chatId, { text: panelMenu() }, { quoted: message });
        }

        // Refresh session on each interaction
        unlock(senderId);

        switch (cmd) {
            case 'status': {
                const mem = process.memoryUsage();
                const uptime = process.uptime();
                const h = Math.floor(uptime / 3600);
                const m = Math.floor((uptime % 3600) / 60);
                const s = Math.floor(uptime % 60);
                return sock.sendMessage(chatId, {
                    text: `📊 *BOT STATUS*\n\n` +
                        `🔧 *Name:* ${settings.botName || 'REDXBOT302'}\n` +
                        `⏱️ *Uptime:* ${h}h ${m}m ${s}s\n` +
                        `💾 *Heap:* ${(mem.heapUsed / 1024 / 1024).toFixed(1)}MB / ${(mem.heapTotal / 1024 / 1024).toFixed(1)}MB\n` +
                        `📦 *RSS:* ${(mem.rss / 1024 / 1024).toFixed(1)}MB\n` +
                        `🌐 *Platform:* ${process.platform}\n` +
                        `📌 *Node:* ${process.version}\n` +
                        `🔗 *Prefix:* ${settings.prefixes?.[0] || '.'}`
                }, { quoted: message });
            }

            case 'cleartmp': {
                let count = 0;
                for (const dir of ['tmp', 'temp']) {
                    const dp = path.join(process.cwd(), dir);
                    if (fs.existsSync(dp)) {
                        fs.readdirSync(dp).forEach(f => { try { fs.unlinkSync(path.join(dp, f)); count++; } catch {} });
                    }
                }
                return sock.sendMessage(chatId, { text: `✅ Cleared *${count}* temp files.` }, { quoted: message });
            }

            case 'clearmem': {
                const mm = require('../lib/memoryManager');
                await mm.cleanupMemory('aggressive');
                const mem = process.memoryUsage();
                return sock.sendMessage(chatId, { text: `✅ Memory cleaned.\n\nCurrent RSS: ${(mem.rss / 1024 / 1024).toFixed(1)}MB` }, { quoted: message });
            }

            case 'restart': {
                await sock.sendMessage(chatId, { text: `🔄 *Restarting bot...*\n\nWill be back online in ~15 seconds.` }, { quoted: message });
                setTimeout(() => process.exit(0), 2000);
                return;
            }

            case 'stop': {
                if (args[1] !== 'confirm') {
                    return sock.sendMessage(chatId, { text: `⚠️ *Are you sure?*\n\nThis will stop the bot completely.\nUse: \`.panel stop confirm\`` }, { quoted: message });
                }
                await sock.sendMessage(chatId, { text: `🛑 *Bot stopping...*` }, { quoted: message });
                setTimeout(() => process.exit(1), 2000);
                return;
            }

            case 'ban': {
                const num = args[1]?.replace(/[^0-9]/g, '');
                if (!num) return sock.sendMessage(chatId, { text: `❌ Usage: \`.panel ban <number>\`` }, { quoted: message });
                const jid = `${num}@s.whatsapp.net`;
                try {
                    const bannedPath = path.join(process.cwd(), 'data/banned.json');
                    let banned = [];
                    if (fs.existsSync(bannedPath)) banned = JSON.parse(fs.readFileSync(bannedPath, 'utf8'));
                    if (!banned.includes(jid)) banned.push(jid);
                    fs.writeFileSync(bannedPath, JSON.stringify(banned, null, 2));
                    return sock.sendMessage(chatId, { text: `✅ Banned: *+${num}*` }, { quoted: message });
                } catch (e) {
                    return sock.sendMessage(chatId, { text: `❌ Error: ${e.message}` }, { quoted: message });
                }
            }

            case 'unban': {
                const num = args[1]?.replace(/[^0-9]/g, '');
                if (!num) return sock.sendMessage(chatId, { text: `❌ Usage: \`.panel unban <number>\`` }, { quoted: message });
                const jid = `${num}@s.whatsapp.net`;
                try {
                    const bannedPath = path.join(process.cwd(), 'data/banned.json');
                    let banned = [];
                    if (fs.existsSync(bannedPath)) banned = JSON.parse(fs.readFileSync(bannedPath, 'utf8'));
                    banned = banned.filter(b => b !== jid);
                    fs.writeFileSync(bannedPath, JSON.stringify(banned, null, 2));
                    return sock.sendMessage(chatId, { text: `✅ Unbanned: *+${num}*` }, { quoted: message });
                } catch (e) {
                    return sock.sendMessage(chatId, { text: `❌ Error: ${e.message}` }, { quoted: message });
                }
            }

            case 'sudo': {
                const action2 = args[1]?.toLowerCase();
                const num = args[2]?.replace(/[^0-9]/g, '');
                if (!action2 || !num) return sock.sendMessage(chatId, { text: `❌ Usage: \`.panel sudo add/remove <number>\`` }, { quoted: message });
                try {
                    const sudoPath = path.join(process.cwd(), 'data/sudo.json');
                    let sudo = [];
                    if (fs.existsSync(sudoPath)) sudo = JSON.parse(fs.readFileSync(sudoPath, 'utf8'));
                    if (action2 === 'add') {
                        if (!sudo.includes(num)) sudo.push(num);
                        fs.writeFileSync(sudoPath, JSON.stringify(sudo, null, 2));
                        return sock.sendMessage(chatId, { text: `✅ Added sudo: *+${num}*` }, { quoted: message });
                    } else if (action2 === 'remove') {
                        sudo = sudo.filter(s => s !== num);
                        fs.writeFileSync(sudoPath, JSON.stringify(sudo, null, 2));
                        return sock.sendMessage(chatId, { text: `✅ Removed sudo: *+${num}*` }, { quoted: message });
                    }
                } catch (e) {
                    return sock.sendMessage(chatId, { text: `❌ Error: ${e.message}` }, { quoted: message });
                }
                break;
            }

            case 'setname': {
                const newName = args.slice(1).join(' ');
                if (!newName) return sock.sendMessage(chatId, { text: `❌ Usage: \`.panel setname <name>\`` }, { quoted: message });
                try {
                    await sock.updateProfileName(newName);
                    return sock.sendMessage(chatId, { text: `✅ Bot name changed to: *${newName}*` }, { quoted: message });
                } catch (e) {
                    return sock.sendMessage(chatId, { text: `❌ Error: ${e.message}` }, { quoted: message });
                }
            }

            case 'setprefix': {
                const np = args[1];
                if (!np) return sock.sendMessage(chatId, { text: `❌ Usage: \`.panel setprefix <prefix>\`` }, { quoted: message });
                settings.prefixes = [np];
                return sock.sendMessage(chatId, { text: `✅ Prefix changed to: *${np}*` }, { quoted: message });
            }

            case 'mode': {
                const mode = args[1]?.toLowerCase();
                if (!['public', 'private'].includes(mode)) return sock.sendMessage(chatId, { text: `❌ Usage: \`.panel mode public/private\`` }, { quoted: message });
                settings.mode = mode;
                return sock.sendMessage(chatId, { text: `✅ Bot mode set to: *${mode}*` }, { quoted: message });
            }

            case 'changepass': {
                const newPass = args[1];
                if (!newPass) return sock.sendMessage(chatId, { text: `❌ Usage: \`.panel changepass <newpassword>\`` }, { quoted: message });
                const cfg = await loadPanelConfig();
                cfg.password = newPass;
                await savePanelConfig(cfg);
                return sock.sendMessage(chatId, { text: `✅ Panel password changed to: *${newPass}*\n\nNext time use this password to unlock panel.` }, { quoted: message });
            }

            case 'lock':
            case 'logout': {
                lock(senderId);
                return sock.sendMessage(chatId, { text: `🔒 *Panel locked.*\n\nUse \`.panel <password>\` to unlock again.` }, { quoted: message });
            }

            case 'listbanned': {
                try {
                    const bannedPath = path.join(process.cwd(), 'data/banned.json');
                    const banned = fs.existsSync(bannedPath) ? JSON.parse(fs.readFileSync(bannedPath, 'utf8')) : [];
                    if (!banned.length) return sock.sendMessage(chatId, { text: `✅ No banned users.` }, { quoted: message });
                    const list = banned.map((b, i) => `${i + 1}. +${b.split('@')[0]}`).join('\n');
                    return sock.sendMessage(chatId, { text: `🚫 *Banned Users (${banned.length}):*\n\n${list}` }, { quoted: message });
                } catch (e) {
                    return sock.sendMessage(chatId, { text: `❌ Error: ${e.message}` }, { quoted: message });
                }
            }

            case 'listsudo': {
                try {
                    const sudoPath = path.join(process.cwd(), 'data/sudo.json');
                    const sudo = fs.existsSync(sudoPath) ? JSON.parse(fs.readFileSync(sudoPath, 'utf8')) : [];
                    if (!sudo.length) return sock.sendMessage(chatId, { text: `✅ No sudo users.` }, { quoted: message });
                    const list = sudo.map((s, i) => `${i + 1}. +${s}`).join('\n');
                    return sock.sendMessage(chatId, { text: `👑 *Sudo Users (${sudo.length}):*\n\n${list}` }, { quoted: message });
                } catch (e) {
                    return sock.sendMessage(chatId, { text: `❌ Error: ${e.message}` }, { quoted: message });
                }
            }

            default:
                return sock.sendMessage(chatId, { text: `❌ Unknown command: \`${cmd}\`\n\n${panelMenu()}` }, { quoted: message });
        }
    }
};
