'use strict';
/**
 * ╔══════════════════════════════════════════════════════╗
 * ║   🔥 REDXMINIBOT ULTRA v8.0 — FULL BEAST EDITION    ║
 * ║   Merged: minibot + minibot_backend + MUZAMIL-XD     ║
 * ║         + REDXBOT302 v7 ULTRA plugins                ║
 * ║   Owner : Abdul Rehman Rajpoot (+923009842133)       ║
 * ║   Co    : Muzamil Khan (+923183928892)               ║
 * ╚══════════════════════════════════════════════════════╝
 */

const express  = require('express');
const cors     = require('cors');
const http     = require('http');
const socketIo = require('socket.io');
const path     = require('path');
const fs       = require('fs');
const crypto   = require('crypto');
require('dotenv').config();

const {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  Browsers,
  getContentType,
  downloadContentFromMessage,
  jidNormalizedUser,
} = require('@whiskeysockets/baileys');

const P = require('pino');

// ─── APP BOOTSTRAP ────────────────────────────────────────
const app    = express();
const server = http.createServer(app);
const io     = socketIo(server, { cors: { origin: '*' } });
const PORT   = process.env.PORT || 3000;
const START_TIME = Date.now();

app.use(cors({ origin: '*', methods: ['GET','POST','DELETE','PUT','OPTIONS'], allowedHeaders: ['Content-Type','x-admin-token','x-deploy-key'] }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── SETTINGS ─────────────────────────────────────────────
const BOT_NAME      = process.env.BOT_NAME       || '🔥 REDXMINIBOT ULTRA 🔥';
const OWNER_NAME    = process.env.OWNER_NAME      || 'Abdul Rehman Rajpoot';
const OWNER_NUM     = process.env.OWNER_NUMBER    || '923009842133';
const CO_OWNER_NAME = process.env.CO_OWNER_NAME   || 'Muzamil Khan';
const CO_OWNER_NUM  = process.env.CO_OWNER_NUM    || '923183928892';
const PREFIX        = process.env.PREFIX          || '.';
const BOT_IMG       = process.env.MENU_IMAGE      || 'https://files.catbox.moe/s36b12.jpg';
const REPO_LINK     = process.env.REPO_LINK       || 'https://github.com/AbdulRehman19721986/REDXBOT-MD';

// ─── OWNER's NEWSLETTER / CHANNEL JID ─────────────────────
// Set your WhatsApp Channel JID here (from WA channel URL)
const NL_JID    = process.env.NEWSLETTER_JID || '120363405513439052@newsletter';
const NL_NAME   = process.env.NEWSLETTER_NAME || '🔥 REDXMINIBOT ULTRA';
const NL_LINK   = process.env.CHANNEL_LINK   || 'https://whatsapp.com/channel/0029VbCkm3rAe5VzCYLtNb2u';
const WA_GROUP  = process.env.WA_GROUP       || 'https://chat.whatsapp.com/LhSmx2SeXX75r8I2bxsNDo';
const TG_LINK   = process.env.TG_GROUP       || 'https://t.me/TeamRedxhacker2';

global.BOT_MODE = process.env.BOT_MODE || 'public';

// ─── ADMIN CREDENTIALS ─────────────────────────────────────
let adminUsername = process.env.ADMIN_USERNAME || 'redx';
let adminPassword = process.env.ADMIN_PASSWORD || 'redx302';
const adminSessions = new Map();

// ─── DIRECTORIES & FILES ──────────────────────────────────
const SESSIONS_DIR   = path.join(__dirname, 'sessions');
const DATA_FILE      = path.join(__dirname, 'data.json');
const DEPLOYS_FILE   = path.join(__dirname, 'deploys.json');
const DEPLOY_ID_FILE = path.join(__dirname, 'deploy_id.txt');

[SESSIONS_DIR, path.join(__dirname,'temp'), path.join(__dirname,'data')].forEach(d => {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});

// ─── DEPLOY ID ────────────────────────────────────────────
const DEPLOY_ID = (() => {
  if (fs.existsSync(DEPLOY_ID_FILE)) return fs.readFileSync(DEPLOY_ID_FILE,'utf8').trim();
  const id = process.env.DEPLOY_ID || ('REDX-' + crypto.randomBytes(4).toString('hex').toUpperCase());
  fs.writeFileSync(DEPLOY_ID_FILE, id);
  return id;
})();

const detectPlatform = () => {
  if (process.env.DYNO)                return 'Heroku';
  if (process.env.RAILWAY_ENVIRONMENT) return 'Railway';
  if (process.env.RENDER)              return 'Render';
  return 'Local';
};

// ─── PERSISTENT DATA ──────────────────────────────────────
let statsData = { totalUsers: 0, pairCount: 0 };
const loadStats  = () => { try { if (fs.existsSync(DATA_FILE)) statsData = { ...statsData, ...JSON.parse(fs.readFileSync(DATA_FILE,'utf8')) }; } catch {} };
const saveStats  = () => { try { fs.writeFileSync(DATA_FILE, JSON.stringify({ ...statsData, lastUpdated: new Date().toISOString() },null,2)); } catch {} };
loadStats(); setInterval(saveStats, 30000);

let deploys = {};
const loadDeploys = () => { try { if (fs.existsSync(DEPLOYS_FILE)) deploys = JSON.parse(fs.readFileSync(DEPLOYS_FILE,'utf8')); } catch {} };
const saveDeploys = () => { try { fs.writeFileSync(DEPLOYS_FILE, JSON.stringify(deploys,null,2)); } catch {} };
loadDeploys();

if (!deploys[DEPLOY_ID]) {
  deploys[DEPLOY_ID] = {
    id: DEPLOY_ID, platform: detectPlatform(),
    createdAt: new Date().toISOString(), numbers: [], pairCount: 0,
    botName: BOT_NAME, ownerName: OWNER_NAME, prefix: PREFIX,
    mode: global.BOT_MODE, deployKey: crypto.randomBytes(16).toString('hex'),
  };
}
deploys[DEPLOY_ID].lastSeen = new Date().toISOString();
deploys[DEPLOY_ID].platform = detectPlatform();
saveDeploys();

// ─── ACTIVE CONNECTIONS ────────────────────────────────────
const activeConnections = new Map();

const broadcastStats = () => {
  const connected = [...activeConnections.values()].filter(c=>c.connected).length;
  io.emit('statsUpdate', { activeSockets: connected, totalUsers: statsData.totalUsers, pairCount: statsData.pairCount });
};

// ─── EMOJIS ───────────────────────────────────────────────
const REACT_EMOJIS = ['🔥','⚡','💯','👑','🚀','💎','❤️','💜','✨','🌟','😍','🤩','💪','🔱','⚜️','🎯','🏆','🌈','💫','🎉'];

// ─── NEWSLETTER CONTEXT ───────────────────────────────────
const nlCtx = () => ({
  forwardingScore: 999,
  isForwarded: true,
  forwardedNewsletterMessageInfo: { newsletterJid: NL_JID, newsletterName: NL_NAME, serverMessageId: -1 },
});

// ═══════════════════════════════════════════════════════════
//  PLUGIN SYSTEM
// ═══════════════════════════════════════════════════════════
const commands   = new Map();
const pluginsDir = path.join(__dirname, 'plugins');
let cmdCount     = 0;

const loadPlugins = () => {
  commands.clear(); cmdCount = 0;
  if (!fs.existsSync(pluginsDir)) { fs.mkdirSync(pluginsDir,{recursive:true}); return; }
  const files = fs.readdirSync(pluginsDir).filter(f=>f.endsWith('.js')&&!f.startsWith('.'));
  for (const file of files) {
    try {
      const fp = path.join(pluginsDir, file);
      delete require.cache[require.resolve(fp)];
      const mod = require(fp);
      const list = Array.isArray(mod) ? mod : [mod];
      for (const raw of list) {
        if (!raw || typeof raw !== 'object') continue;
        const pattern = raw.pattern || raw.command;
        const execute = raw.execute || raw.handler;
        if (!pattern || !execute) continue;
        commands.set(pattern.toLowerCase(), { ...raw, pattern, execute });
        cmdCount++;
      }
    } catch(e) { console.error(`Plugin load error [${file}]:`, e.message); }
  }
  console.log(`📦 Loaded ${cmdCount} plugins from ${files.length} files`);
};

// ═══════════════════════════════════════════════════════════
//  CONNECTION INIT
// ═══════════════════════════════════════════════════════════
async function initConnection(number) {
  const sessionDir = path.join(SESSIONS_DIR, number);
  if (!fs.existsSync(sessionDir)) fs.mkdirSync(sessionDir,{recursive:true});

  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
  const { version }          = await fetchLatestBaileysVersion();

  const conn = makeWASocket({
    version,
    logger: P({ level: 'silent' }),
    printQRInTerminal: false,
    auth: state,
    browser: Browsers.macOS('Safari'),
    connectTimeoutMs:      35000,
    keepAliveIntervalMs:   10000,
    defaultQueryTimeoutMs: 35000,
    retryRequestDelayMs:   200,
    maxRetries:            8,
    markOnlineOnConnect:   true,
    syncFullHistory:       false,
    getMessage: async () => ({ conversation: '' }),
  });

  let entry = activeConnections.get(number);
  if (!entry) {
    entry = { conn, saveCreds, connected: false, hasWelcomed: false, reconnectAttempts: 0 };
    activeConnections.set(number, entry);
  } else {
    entry.conn = conn; entry.saveCreds = saveCreds; entry.connected = false;
  }

  setupHandlers(conn, number, saveCreds);
  return conn;
}

// ═══════════════════════════════════════════════════════════
//  EVENT HANDLERS
// ═══════════════════════════════════════════════════════════
function setupHandlers(conn, number, saveCreds) {
  const entry = activeConnections.get(number);

  conn.ev.on('creds.update', async () => { try { await saveCreds(); } catch {} });

  conn.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === 'open') {
      entry.connected = true;
      entry.reconnectAttempts = 0;
      statsData.pairCount++;
      statsData.totalUsers++;
      saveStats();

      const dep = deploys[DEPLOY_ID];
      if (!dep.numbers.includes(number)) dep.numbers.push(number);
      dep.pairCount = (dep.pairCount||0)+1;
      dep.lastPaired = new Date().toISOString();
      saveDeploys();

      broadcastStats();
      io.emit('linked',    { sessionId: number, number });
      io.emit('botStatus', { connected: true, number, deployId: DEPLOY_ID, platform: detectPlatform() });
      console.log(`✅ [${number}] CONNECTED — ${BOT_NAME}`);

      if (!entry.hasWelcomed) {
        entry.hasWelcomed = true;
        setTimeout(async () => {
          try {
            await sendWelcome(conn, number);
            // Auto-follow owner's newsletter channel
            await autoFollowChannel(conn, number);
          } catch(e) { console.error('Welcome/follow error:', e.message); }
        }, 3000);
      }
    }

    if (connection === 'close') {
      entry.connected = false;
      broadcastStats();
      io.emit('botStatus', { connected: false, number });

      const code        = lastDisconnect?.error?.output?.statusCode;
      const isLoggedOut = code === DisconnectReason.loggedOut || code === 401 || code === 405;

      if (isLoggedOut) {
        try { fs.rmSync(path.join(SESSIONS_DIR,number),{recursive:true,force:true}); } catch {}
        activeConnections.delete(number);
        io.emit('unlinked', { sessionId: number, number });
        return;
      }

      if (entry.reconnectAttempts < 12) {
        entry.reconnectAttempts++;
        const wait = Math.min(2000 * entry.reconnectAttempts, 25000);
        console.log(`🔄 [${number}] reconnect in ${wait/1000}s (${entry.reconnectAttempts}/12)`);
        setTimeout(async () => {
          try {
            conn.ev.removeAllListeners();
            try { conn.ws?.terminate(); } catch {}
            await initConnection(number);
          } catch(e) { console.error(`Reconnect ${number}: ${e.message}`); }
        }, wait);
      } else {
        activeConnections.delete(number);
        io.emit('unlinked', { sessionId: number, number });
      }
    }
  });

  conn.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const msg of messages) {
      try { await handleMessage(conn, msg, number); } catch(e) { console.error(`msg err: ${e.message}`); }
    }
  });

  conn.ev.on('messages.update', async (updates) => {
    for (const update of updates) {
      if (update.update?.protocolMessage?.type === 1) {
        try { await handleAntiDelete(conn, update, number); } catch {}
      }
    }
  });

  conn.ev.on('group-participants.update', async (update) => {
    try { await handleGroupEvents(conn, update, number); } catch(e) { console.error('GroupEvent:', e.message); }
  });
}

// ═══════════════════════════════════════════════════════════
//  AUTO-FOLLOW CHANNEL + AUTO-REACT
// ═══════════════════════════════════════════════════════════
async function autoFollowChannel(conn, number) {
  try {
    // Follow owner's newsletter channel
    await conn.newsletterFollow(NL_JID);
    console.log(`📢 [${number}] Auto-followed newsletter: ${NL_JID}`);
  } catch(e) {
    console.warn(`⚠️ Newsletter follow failed for ${number}: ${e.message}`);
  }
}

// ═══════════════════════════════════════════════════════════
//  ANTI-DELETE HANDLER
// ═══════════════════════════════════════════════════════════
const msgStore = new Map();
async function handleAntiDelete(conn, update, sessionId) {
  const from   = update.key?.remoteJid;
  const stored = msgStore.get(update.key?.id);
  if (!stored || !from) return;
  const dep = deploys[DEPLOY_ID];
  const pfx = dep?.prefix || PREFIX;
  await conn.sendMessage(from, {
    text: `🔴 *ᴀɴᴛɪ-ᴅᴇʟᴇᴛᴇ* — Message was deleted!\n\n${stored}\n\n> 🔥 ${BOT_NAME}`,
    contextInfo: nlCtx(),
  }).catch(()=>{});
}

// ═══════════════════════════════════════════════════════════
//  GROUP EVENTS
// ═══════════════════════════════════════════════════════════
async function handleGroupEvents(conn, update, sessionId) {
  const { id, participants, action } = update;
  const dep     = deploys[DEPLOY_ID];
  const botNum  = `${sessionId}@s.whatsapp.net`;

  if (action === 'add') {
    let meta;
    try { meta = await conn.groupMetadata(id); } catch { return; }
    const grpName = meta.subject || 'Group';

    for (const jid of participants) {
      const name = jid.split('@')[0];
      await conn.sendMessage(id, {
        text: `╭━━━[ 🔥 *WELCOME* ]━━━⊷\n┃\n┃ 👋 Welcome *@${name}* to\n┃ *${grpName}*!\n┃\n┃ 🔥 Bot: ${BOT_NAME}\n┃ 📌 Prefix: ${dep?.prefix||PREFIX}\n┃ 🌐 Type *${dep?.prefix||PREFIX}menu* for help\n┃\n╰━━━━━━━━━━━━━━━━⊷`,
        mentions: [jid],
        contextInfo: nlCtx(),
      }).catch(()=>{});
    }
  }

  if (action === 'remove') {
    for (const jid of participants) {
      const name = jid.split('@')[0];
      await conn.sendMessage(id, {
        text: `╭━━━[ 👋 *GOODBYE* ]━━━⊷\n┃\n┃ 😢 *@${name}* has left\n┃ the group. Goodbye!\n┃\n╰━━━━━━━━━━━━━━━━⊷`,
        mentions: [jid],
        contextInfo: nlCtx(),
      }).catch(()=>{});
    }
  }
}

// ═══════════════════════════════════════════════════════════
//  WELCOME MESSAGE
// ═══════════════════════════════════════════════════════════
async function sendWelcome(conn, number) {
  const userJid = `${number}@s.whatsapp.net`;
  const dep = deploys[DEPLOY_ID];
  let name = 'User';
  try { name = conn.user?.name || conn.user?.notify || 'User'; } catch {}

  const text = `╭━━[ 🔥 *${BOT_NAME}* ]━━⊷
┃
┃ 👋 *Hey ${name}!*
┃ 🎉 *Pairing Completed!*
┃
┃ 📱 *Number:* +${number}
┃ 🆔 *Deploy ID:* \`${DEPLOY_ID}\`
┃ 🔑 *Deploy Key:* \`${dep.deployKey}\`
┃ 🌐 *Platform:* ${detectPlatform()}
┃ 👑 *Owner:* ${OWNER_NAME}
┃ 📦 *Commands:* ${cmdCount+10}+
┃ 📌 *Prefix:* ${dep?.prefix||PREFIX}
┃ 🌍 *Mode:* ${global.BOT_MODE.toUpperCase()}
┃
┃ 📢 *Auto-joined update channel!*
┃ 🔗 ${NL_LINK}
┃
┃ 💬 *WA Group:* ${WA_GROUP}
┃
┃ > Type *${dep?.prefix||PREFIX}menu* to see all commands!
┃ > 🔒 Keep your Deploy Key private!
┃
╰━━━━━━━━━━━━━━━━━━━⊷
🔥 _${BOT_NAME} — By ${OWNER_NAME}_`;

  await conn.sendMessage(userJid, {
    text,
    contextInfo: {
      ...nlCtx(),
      externalAdReply: {
        title: `${BOT_NAME} Connected 🚀`,
        body: `Deploy ID: ${DEPLOY_ID} | ${detectPlatform()}`,
        thumbnailUrl: BOT_IMG,
        sourceUrl: REPO_LINK,
        mediaType: 1,
        renderLargerThumbnail: true,
      },
    },
  });
}

// ═══════════════════════════════════════════════════════════
//  MESSAGE HANDLER
// ═══════════════════════════════════════════════════════════
async function handleMessage(conn, msg, sessionId) {
  const from   = msg.key.remoteJid;
  const sender = msg.key.participant || msg.key.remoteJid;
  const sNum   = sender.split('@')[0].split(':')[0];
  const isOwner = sNum === OWNER_NUM || sNum === CO_OWNER_NUM || sNum === sessionId;
  const isGroup = from?.endsWith('@g.us');

  // ── STATUS (story) handling ────────────────────────────
  if (from === 'status@broadcast') {
    // Auto-view
    await conn.readMessages([msg.key]).catch(()=>{});
    // Auto-react with random emoji
    const emoji = REACT_EMOJIS[Math.floor(Math.random() * REACT_EMOJIS.length)];
    await conn.sendMessage(from, { react: { text: emoji, key: msg.key } }, { statusJidList: [sender, conn.user?.id] }).catch(()=>{});
    return;
  }

  // ── Newsletter messages ────────────────────────────────
  if (from?.endsWith('@newsletter')) {
    // Auto-react to channel posts
    const emoji = REACT_EMOJIS[Math.floor(Math.random() * REACT_EMOJIS.length)];
    await conn.sendMessage(from, { react: { text: emoji, key: msg.key } }).catch(()=>{});
    return;
  }

  if (!msg.message) return;
  if (global.BOT_MODE === 'private' && !isOwner) return;

  const body = msg.message?.conversation
    || msg.message?.extendedTextMessage?.text
    || msg.message?.imageMessage?.caption
    || msg.message?.videoMessage?.caption || '';

  // Store message for antidelete
  if (body) msgStore.set(msg.key.id, body);
  if (msgStore.size > 1000) { const first = msgStore.keys().next().value; msgStore.delete(first); }

  // ── LINK DETECTION: send channel info ─────────────────
  if (!isOwner) {
    const hasLink = /https?:\/\/[^\s]+/i.test(body) || /wa\.me\/[^\s]+/i.test(body);
    if (hasLink && !body.startsWith(deploys[DEPLOY_ID]?.prefix || PREFIX)) {
      const emoji = REACT_EMOJIS[Math.floor(Math.random() * REACT_EMOJIS.length)];
      await conn.sendMessage(from, { react: { text: emoji, key: msg.key } }).catch(()=>{});
    }
  }

  const dep = deploys[DEPLOY_ID];
  const pfx = dep?.prefix || PREFIX;
  if (!body.startsWith(pfx)) return;

  const args = body.slice(pfx.length).trim().split(/ +/);
  const cmd  = args.shift().toLowerCase();
  const q    = body.slice(pfx.length + cmd.length).trim();

  console.log(`[${new Date().toLocaleTimeString()}] ${pfx}${cmd} | ${sNum}${isGroup?' [GRP]':''}`);

  // React to command
  const cmdEmoji = ['⚡','🔥','💎','🚀','✨'][Math.floor(Math.random()*5)];
  await conn.sendMessage(from, { react: { text: cmdEmoji, key: msg.key } }).catch(()=>{});

  // Built-in commands first
  if (await runBuiltIn(conn, msg, cmd, args, q, from, sender, isOwner, pfx, sNum)) return;

  // Plugin commands
  if (commands.has(cmd)) {
    const plugin = commands.get(cmd);
    if (plugin.ownerOnly && !isOwner) {
      await conn.sendMessage(from, { text: `╭━[ ❌ *ACCESS DENIED* ]━⊷\n┃ This command is *Owner Only*.\n╰━━━━━━━━━━━━━━⊷\n> 🔥 ${BOT_NAME}`, contextInfo: nlCtx() }, { quoted: msg });
      return;
    }
    try {
      const reply = (text, opts={}) => conn.sendMessage(from, { text, contextInfo: nlCtx(), ...opts }, { quoted: msg });
      let gMeta = null;
      if (isGroup) { try { gMeta = await conn.groupMetadata(from); } catch {} }
      let isAdmin = false;
      if (isGroup && gMeta) { const p = gMeta.participants.find(p=>p.id===sender); isAdmin = p?.admin==='admin'||p?.admin==='superadmin'; }
      const quoted = getQuotedMsg(msg);
      await plugin.execute(conn, msg, { quoted, sender, key: msg.key, message: msg.message }, {
        args, q, reply, from, isGroup, groupMetadata: gMeta,
        sender, isAdmin, isOwner, botName: BOT_NAME, ownerName: OWNER_NAME,
        prefix: pfx, senderNumber: sNum, chatId: from, deployId: DEPLOY_ID,
        nlCtx: nlCtx(), botImg: BOT_IMG, nlJid: NL_JID, nlName: NL_NAME, nlLink: NL_LINK,
        waGroup: WA_GROUP, repoLink: REPO_LINK,
      });
    } catch(e) { console.error(`plugin[${cmd}]: ${e.message}`); }
  }
}

// ═══════════════════════════════════════════════════════════
//  BUILT-IN COMMANDS
// ═══════════════════════════════════════════════════════════
async function runBuiltIn(conn, msg, cmd, args, q, from, sender, isOwner, pfx, sNum) {
  const dep = deploys[DEPLOY_ID];
  const s   = (text, opts={}) => conn.sendMessage(from, { text, contextInfo: nlCtx(), ...opts }, { quoted: msg });

  switch (cmd) {

    // ── PING ──────────────────────────────────────────────
    case 'ping': {
      const t = Date.now();
      await s(`╭━[ ⚡ *PING* ]━━⊷\n┃ 🏓 *Pong!*\n┃ ⚡ Speed: \`${Date.now()-t}ms\`\n┃ 🔥 Bot: ${BOT_NAME}\n╰━━━━━━━━━━━━⊷`);
      return true;
    }

    // ── MENU ──────────────────────────────────────────────
    case 'menu':
    case 'help':
    case 'cmds': {
      const up   = Math.floor((Date.now()-START_TIME)/1000);
      const h    = Math.floor(up/3600), m = Math.floor((up%3600)/60), sc = up%60;
      const total = cmdCount + 10;
      const pluginCmds = [...commands.keys()].map(c=>`${pfx}${c}`).join('  ');

      const menuText = `╭━━━━━━━━━━━━━━━━━━━━━⊷
┃ 🔥 *${BOT_NAME}*
┃ 👑 Owner: ${OWNER_NAME}
┃ ⏱ Runtime: ${h}h ${m}m ${sc}s
┃ 📦 Commands: ${total}+
┃ 🌍 Mode: ${global.BOT_MODE.toUpperCase()}
┃ 📌 Prefix: ${pfx}
╰━━━━━━━━━━━━━━━━━━━━━⊷

╭━[ 🛠️ *GENERAL* ]━⊷
┃ ${pfx}ping — Speed test
┃ ${pfx}owner — Owner info
┃ ${pfx}runtime — Uptime
┃ ${pfx}menu — This menu
┃ ${pfx}mode — public/private
┃ ${pfx}myid — Deploy ID
╰━━━━━━━━━━━━⊷

╭━[ 🎭 *FUN* ]━⊷
┃ ${pfx}caveman — Caveman mode 🦴
┃ ${pfx}sticker — Make sticker
┃ ${pfx}alive — Bot alive check
┃ ${pfx}status — Bot status
╰━━━━━━━━━━━━⊷

╭━[ 🤖 *AI & TOOLS* ]━⊷
┃ ${pfx}ai — AI chat
┃ ${pfx}translate — Translate text
┃ ${pfx}weather — Weather info
┃ ${pfx}define — Word definition
╰━━━━━━━━━━━━⊷

╭━[ 📥 *DOWNLOADER* ]━⊷
┃ ${pfx}ytmp3 — YouTube audio
┃ ${pfx}ytmp4 — YouTube video
┃ ${pfx}tiktok — TikTok DL
┃ ${pfx}fb — Facebook DL
╰━━━━━━━━━━━━⊷

╭━[ 👥 *GROUP* ]━⊷
┃ ${pfx}kick — Kick member
┃ ${pfx}add — Add member
┃ ${pfx}promote — Promote admin
┃ ${pfx}demote — Demote admin
┃ ${pfx}mute — Mute group
┃ ${pfx}unmute — Unmute group
┃ ${pfx}groupinfo — Group info
╰━━━━━━━━━━━━⊷

╭━[ 🔧 *OWNER* ]━⊷
┃ ${pfx}broadcast — Broadcast msg
┃ ${pfx}reload — Reload plugins
┃ ${pfx}ban — Ban user
┃ ${pfx}unban — Unban user
┃ ${pfx}restart — Restart bot
╰━━━━━━━━━━━━⊷

${pluginCmds ? `╭━[ 📦 *PLUGINS (${cmdCount})* ]━⊷\n┃ ${pluginCmds}\n╰━━━━━━━━━━━━⊷\n` : ''}
📢 *Update Channel:*
${NL_LINK}

💬 *WA Group:*
${WA_GROUP}

> 🔥 _${BOT_NAME} — By ${OWNER_NAME}_`;

      await conn.sendMessage(from, {
        image: { url: BOT_IMG },
        caption: menuText,
        contextInfo: {
          ...nlCtx(),
          externalAdReply: { title: `🔥 ${BOT_NAME}`, body: `${total}+ Commands | ${global.BOT_MODE.toUpperCase()}`, thumbnailUrl: BOT_IMG, sourceUrl: REPO_LINK, mediaType: 1, renderLargerThumbnail: true },
        },
      }, { quoted: msg });
      return true;
    }

    // ── CAVEMAN ───────────────────────────────────────────
    case 'caveman': {
      const caveman = [
        'UGH! 🦴', 'CAVEMAN SMASH! 🪨', 'ME WANT FOOD! 🍖',
        'FIRE GOOD! 🔥', 'ME NO UNDERSTAND! 🦕', 'GRUNT GRUNT! 🦣',
        'ME STRONGEST! 💪🦴', 'WHEEL ROUND THING! ⚪', 'BIG ROCK THROW! 🪨💥',
      ];
      const pick = q
        ? [...q.toUpperCase()].map(c=>{
            const cave = {'A':'AAAA','E':'EHHH','I':'IIIH','O':'OOOH','U':'UHHH',' ':'  UGH  '};
            return cave[c] || c;
          }).join('')
        : caveman[Math.floor(Math.random()*caveman.length)];
      await s(`╭━[ 🦴 *CAVEMAN MODE* ]━⊷\n┃\n┃ 🪨 ${pick}\n┃\n┃ UGGGGHHHH!!!! 🦕🦣\n╰━━━━━━━━━━━━⊷\n> 🔥 ${BOT_NAME}`);
      return true;
    }

    // ── ALIVE ─────────────────────────────────────────────
    case 'alive': {
      const up = Math.floor((Date.now()-START_TIME)/1000);
      const h  = Math.floor(up/3600), m = Math.floor((up%3600)/60), sc = up%60;
      await s(`╭━[ ✅ *ALIVE* ]━━━⊷\n┃ 🔥 ${BOT_NAME}\n┃ ⚡ Status: *ONLINE*\n┃ ⏱ Up: ${h}h ${m}m ${sc}s\n┃ 📦 Cmds: ${cmdCount+10}+\n┃ 🌍 Mode: ${global.BOT_MODE.toUpperCase()}\n┃ 👑 ${OWNER_NAME}\n╰━━━━━━━━━━━━⊷`);
      return true;
    }

    // ── OWNER ─────────────────────────────────────────────
    case 'owner': {
      await conn.sendMessage(from, {
        contacts: { displayName: OWNER_NAME, contacts: [{ vcard: `BEGIN:VCARD\nVERSION:3.0\nFN:${OWNER_NAME}\nTEL;type=CELL;waid=${OWNER_NUM}:+${OWNER_NUM}\nEND:VCARD` }] }
      }, { quoted: msg });
      await s(`╭━[ 👑 *OWNER INFO* ]━⊷\n┃ 👤 *Name:* ${OWNER_NAME}\n┃ 📱 *Number:* +${OWNER_NUM}\n┃ 🤝 *Co-Owner:* ${CO_OWNER_NAME}\n┃ 📱 *Co-Num:* +${CO_OWNER_NUM}\n╰━━━━━━━━━━━━⊷\n> 🔥 ${BOT_NAME}`);
      return true;
    }

    // ── MODE ──────────────────────────────────────────────
    case 'mode': {
      if (!isOwner) { await s('❌ *Owner only.*'); return true; }
      const m = args[0]?.toLowerCase();
      if (m === 'public' || m === 'private') {
        global.BOT_MODE = m; dep.mode = m; saveDeploys();
        await s(`╭━[ 🌍 *MODE* ]━⊷\n┃ ✅ Mode: *${m.toUpperCase()}*\n╰━━━━━━━━⊷\n> 🔥 ${BOT_NAME}`);
      } else {
        await s(`╭━[ 🌍 *MODE* ]━⊷\n┃ Current: *${global.BOT_MODE.toUpperCase()}*\n┃ Use: ${pfx}mode public|private\n╰━━━━━━━━⊷`);
      }
      return true;
    }

    // ── RUNTIME ───────────────────────────────────────────
    case 'runtime':
    case 'uptime': {
      const up = Math.floor((Date.now()-START_TIME)/1000);
      const h  = Math.floor(up/3600), m = Math.floor((up%3600)/60), sc = up%60;
      const mem = process.memoryUsage();
      await s(`╭━[ ⏱️ *RUNTIME* ]━⊷\n┃ 🕐 Up: ${h}h ${m}m ${sc}s\n┃ 📦 Cmds: ${cmdCount+10}+\n┃ 🌍 Mode: ${global.BOT_MODE.toUpperCase()}\n┃ 💾 RAM: ${Math.round(mem.rss/1024/1024)}MB\n┃ 🌐 Platform: ${detectPlatform()}\n╰━━━━━━━━━━━━⊷\n> 🔥 ${BOT_NAME}`);
      return true;
    }

    // ── MYID / DEPLOYID ───────────────────────────────────
    case 'myid':
    case 'deployid': {
      await s(`╭━[ 🆔 *DEPLOY ID* ]━⊷\n┃ 🆔 ID: \`${DEPLOY_ID}\`\n┃ 🔑 Key: \`${dep?.deployKey||'—'}\`\n┃ 🌐 Platform: ${detectPlatform()}\n╰━━━━━━━━━━━━⊷\n> 🔒 Keep your key private!`);
      return true;
    }

    // ── RESTART ───────────────────────────────────────────
    case 'restart':
    case 'reboot': {
      if (!isOwner) { await s('❌ *Owner only.*'); return true; }
      await s(`╭━[ 🔄 *RESTARTING* ]━⊷\n┃ 🔄 Bot is restarting...\n┃ ⏳ Please wait 15s\n╰━━━━━━━━━━━━⊷\n> 🔥 ${BOT_NAME}`);
      setTimeout(()=>process.exit(0), 2000);
      return true;
    }

    // ── RELOAD ────────────────────────────────────────────
    case 'reload': {
      if (!isOwner) { await s('❌ *Owner only.*'); return true; }
      loadPlugins();
      await s(`╭━[ 🔄 *RELOADED* ]━⊷\n┃ ✅ Plugins: ${cmdCount}\n┃ 📦 Total cmds: ${cmdCount+10}+\n╰━━━━━━━━━━━━⊷\n> 🔥 ${BOT_NAME}`);
      return true;
    }

    // ── STATUS ────────────────────────────────────────────
    case 'status':
    case 'info': {
      const up  = Math.floor((Date.now()-START_TIME)/1000);
      const h   = Math.floor(up/3600), m = Math.floor((up%3600)/60), sc = up%60;
      const mem = process.memoryUsage();
      await s(`╭━[ 📊 *BOT STATUS* ]━━━━━⊷\n┃\n┃ 🔥 *${BOT_NAME}*\n┃ ⚡ Status: ONLINE ✅\n┃ ⏱ Runtime: ${h}h ${m}m ${sc}s\n┃ 💾 RAM: ${Math.round(mem.rss/1024/1024)}MB used\n┃ 📦 Commands: ${cmdCount+10}+\n┃ 🌍 Mode: ${global.BOT_MODE.toUpperCase()}\n┃ 🆔 ID: ${DEPLOY_ID}\n┃ 🌐 Platform: ${detectPlatform()}\n┃ 📊 Total Pairs: ${statsData.pairCount}\n┃ 👑 Owner: ${OWNER_NAME}\n┃\n╰━━━━━━━━━━━━━━━━━━━━━━━⊷`);
      return true;
    }

    // ── CHANNEL ───────────────────────────────────────────
    case 'channel':
    case 'follow': {
      await s(`╭━[ 📢 *UPDATE CHANNEL* ]━⊷\n┃\n┃ 🔥 *${NL_NAME}*\n┃ 📲 Follow for bot updates!\n┃\n┃ ${NL_LINK}\n┃\n┃ 💬 WA Group:\n┃ ${WA_GROUP}\n╰━━━━━━━━━━━━━━━━━━━━━━━⊷`);
      return true;
    }

    // ── BAN ───────────────────────────────────────────────
    case 'ban': {
      if (!isOwner) { await s('❌ *Owner only.*'); return true; }
      const target = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
      if (!target) { await s(`❌ Mention a user: ${pfx}ban @user`); return true; }
      const bannedPath = path.join(__dirname, 'data', 'banned.json');
      let banned = [];
      try { banned = JSON.parse(fs.readFileSync(bannedPath,'utf8')); } catch {}
      if (!banned.includes(target)) banned.push(target);
      fs.writeFileSync(bannedPath, JSON.stringify(banned, null, 2));
      await s(`╭━[ 🚫 *BANNED* ]━⊷\n┃ @${target.split('@')[0]} has been banned.\n╰━━━━━━━━━━━━⊷`, { mentions: [target] });
      return true;
    }

    // ── BROADCAST ─────────────────────────────────────────
    case 'broadcast':
    case 'bc': {
      if (!isOwner) { await s('❌ *Owner only.*'); return true; }
      if (!q) { await s(`❌ Usage: ${pfx}broadcast <message>`); return true; }
      const dep = deploys[DEPLOY_ID];
      let sent = 0;
      for (const num of (dep.numbers||[])) {
        try {
          await conn.sendMessage(`${num}@s.whatsapp.net`, {
            text: `📢 *BROADCAST — ${BOT_NAME}*\n\n${q}\n\n> 🔥 ${OWNER_NAME}`,
            contextInfo: nlCtx(),
          });
          sent++;
          await new Promise(r=>setTimeout(r, 500));
        } catch {}
      }
      await s(`╭━[ 📢 *BROADCAST SENT* ]━⊷\n┃ ✅ Sent to ${sent} users\n╰━━━━━━━━━━━━⊷`);
      return true;
    }

    default: return false;
  }
}

function getQuotedMsg(msg) {
  const ctx = msg.message?.extendedTextMessage?.contextInfo;
  if (!ctx?.quotedMessage) return null;
  return { message: { key: { remoteJid: ctx.participant||ctx.stanzaId, id: ctx.stanzaId, fromMe: false }, message: ctx.quotedMessage }, sender: ctx.participant };
}

// ═══════════════════════════════════════════════════════════
//  EXPRESS ROUTES
// ═══════════════════════════════════════════════════════════
app.get('/',         (req,res) => res.sendFile(path.join(__dirname,'public','index.html')));
app.get('/health',   (req,res) => res.json({ ok: true, uptime: Math.floor((Date.now()-START_TIME)/1000), connected: [...activeConnections.values()].some(e=>e.connected), platform: detectPlatform(), deployId: DEPLOY_ID }));
app.get('/api/status',(req,res)=> res.json(getStats()));
app.get('/api/config',(req,res)=> res.json({ botName: BOT_NAME, ownerName: OWNER_NAME, coOwner: CO_OWNER_NAME, prefix: PREFIX, menuImage: BOT_IMG, repoLink: REPO_LINK, waGroup: WA_GROUP, channelLink: NL_LINK, deployId: DEPLOY_ID, platform: detectPlatform() }));

// ── PAIRING ───────────────────────────────────────────────
app.post('/api/pair', async (req, res) => {
  let conn;
  try {
    const { number } = req.body;
    if (!number) return res.status(400).json({ error: 'Phone number required' });
    const num = number.replace(/\D/g,'');
    if (num.length < 7) return res.status(400).json({ error: 'Invalid phone number' });

    console.log(`📱 Pair request: ${num}`);

    const existing = activeConnections.get(num);
    if (existing?.connected) return res.status(400).json({ error: 'Already connected! Use Logout to re-pair.' });
    if (existing?.conn) {
      try { existing.conn.ev.removeAllListeners(); existing.conn.ws?.terminate(); } catch {}
      activeConnections.delete(num);
      await new Promise(r=>setTimeout(r,600));
    }

    const sessionDir = path.join(SESSIONS_DIR, num);
    if (!fs.existsSync(sessionDir)) fs.mkdirSync(sessionDir,{recursive:true});

    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
    const { version }          = await fetchLatestBaileysVersion();

    conn = makeWASocket({
      version,
      logger: P({ level: 'silent' }),
      printQRInTerminal: false,
      auth: state,
      browser: Browsers.macOS('Safari'),
      connectTimeoutMs:      35000,
      keepAliveIntervalMs:   10000,
      defaultQueryTimeoutMs: 35000,
      retryRequestDelayMs:   200,
      maxRetries:            8,
      markOnlineOnConnect:   true,
      syncFullHistory:       false,
    });

    activeConnections.set(num, { conn, saveCreds, connected: false, hasWelcomed: false, reconnectAttempts: 0 });
    setupHandlers(conn, num, saveCreds);

    await new Promise(r=>setTimeout(r,3000));

    const rawCode  = await conn.requestPairingCode(num);
    const code     = (rawCode||'').toString().trim();
    const formatted = code.match(/.{1,4}/g)?.join('-') || code;

    statsData.pairCount++;
    saveStats();

    console.log(`✅ Code for ${num}: ${formatted}`);
    return res.json({ success: true, pairingCode: formatted, code: formatted, number: num });

  } catch(err) {
    console.error('❌ /api/pair:', err.message);
    if (conn) { try { conn.ev.removeAllListeners(); conn.ws?.terminate(); } catch {} }
    return res.status(500).json({ error: err.message || 'Failed to get pairing code. Try again.' });
  }
});

// ── GET code (GET compat) ──────────────────────────────────
app.get('/code', async (req, res) => {
  req.body = { number: req.query.number };
  // redirect to POST handler
  const number = (req.query.number||'').replace(/\D/g,'');
  if (!number) return res.status(400).json({ error: 'number required' });

  try {
    const sessionDir = path.join(SESSIONS_DIR, number);
    if (!fs.existsSync(sessionDir)) fs.mkdirSync(sessionDir,{recursive:true});
    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
    const { version }          = await fetchLatestBaileysVersion();
    const conn = makeWASocket({ version, logger: P({level:'silent'}), printQRInTerminal: false, auth: state, browser: Browsers.macOS('Safari'), connectTimeoutMs: 35000 });
    activeConnections.set(number, { conn, saveCreds, connected: false, hasWelcomed: false, reconnectAttempts: 0 });
    setupHandlers(conn, number, saveCreds);
    await new Promise(r=>setTimeout(r,3000));
    const rawCode   = await conn.requestPairingCode(number);
    const code      = (rawCode||'').toString().trim();
    const formatted = code.match(/.{1,4}/g)?.join('-') || code;
    return res.json({ success: true, code: formatted, pairingCode: formatted, number });
  } catch(err) {
    return res.status(500).json({ error: err.message });
  }
});

app.post('/pair', async (req, res) => {
  req.url = '/api/pair';
  app.handle(req, res);
});

// ── LOGOUT ────────────────────────────────────────────────
app.post('/api/logout', async (req,res) => {
  try {
    const { number } = req.body;
    const num = (number||'').replace(/\D/g,'');
    if (num) {
      const e = activeConnections.get(num);
      if (e?.conn) { try { e.conn.ev.removeAllListeners(); e.conn.ws?.terminate(); } catch {} }
      activeConnections.delete(num);
      try { fs.rmSync(path.join(SESSIONS_DIR,num),{recursive:true,force:true}); } catch {}
      io.emit('unlinked',{sessionId:num,number:num});
    } else {
      for (const [n,e] of activeConnections) {
        if (e?.conn) { try { e.conn.ev.removeAllListeners(); e.conn.ws?.terminate(); } catch {} }
        try { fs.rmSync(path.join(SESSIONS_DIR,n),{recursive:true,force:true}); } catch {}
        io.emit('unlinked',{sessionId:n,number:n});
      }
      activeConnections.clear();
    }
    broadcastStats();
    io.emit('botStatus',{connected:false,number:''});
    res.json({success:true,message:'Logged out'});
  } catch(err) { res.status(500).json({error:err.message}); }
});

app.post('/api/reload', (req,res) => { loadPlugins(); res.json({success:true,commands:cmdCount}); });

// ── DEPLOY KEY API ─────────────────────────────────────────
const deployKeyAuth = (req,res,next) => {
  const key = req.headers['x-deploy-key'] || req.body?.deployKey || req.query?.key;
  if (!key) return res.status(401).json({error:'Deploy key required'});
  const dep = Object.values(deploys).find(d=>d.deployKey===key);
  if (!dep) return res.status(401).json({error:'Invalid deploy key'});
  req.deploy = dep; next();
};

app.post('/api/user/info',   deployKeyAuth, (req,res) => {
  const d = req.deploy;
  res.json({ id:d.id, platform:d.platform, pairCount:d.pairCount||0, numbers:d.numbers||[], createdAt:d.createdAt, lastSeen:d.lastSeen, botName:d.botName, ownerName:d.ownerName, prefix:d.prefix, mode:d.mode, connected:[...activeConnections.values()].some(e=>e.connected) });
});
app.post('/api/user/update', deployKeyAuth, (req,res) => {
  const d=req.deploy;
  const {botName,ownerName,prefix,mode}=req.body;
  if (botName)  d.botName=botName;
  if (ownerName) d.ownerName=ownerName;
  if (prefix)   d.prefix=prefix;
  if (mode&&(mode==='public'||mode==='private')) { d.mode=mode; if(d.id===DEPLOY_ID) global.BOT_MODE=mode; }
  saveDeploys();
  res.json({success:true,deploy:{id:d.id,botName:d.botName,ownerName:d.ownerName,prefix:d.prefix,mode:d.mode}});
});
app.post('/api/user/logout', deployKeyAuth, async (req,res) => {
  const d = req.deploy; let count=0;
  for (const num of (d.numbers||[])) {
    const e = activeConnections.get(num);
    if (e?.conn) { try{e.conn.ev.removeAllListeners();e.conn.ws?.terminate();}catch{} }
    activeConnections.delete(num);
    try{fs.rmSync(path.join(SESSIONS_DIR,num),{recursive:true,force:true});}catch{}
    count++;
  }
  d.numbers=[]; saveDeploys(); broadcastStats();
  res.json({success:true,message:`Logged out ${count} session(s)`});
});

// ── ADMIN ROUTES ───────────────────────────────────────────
const adminAuth = (req,res,next) => {
  const token = req.headers['x-admin-token']||req.query.token;
  if (!token||!adminSessions.has(token)) return res.status(401).json({error:'Unauthorized'});
  const s = adminSessions.get(token);
  if (Date.now()-s.ts > 86400000) { adminSessions.delete(token); return res.status(401).json({error:'Session expired'}); }
  req.adminSession=s; next();
};

app.post('/api/admin/login', (req,res) => {
  const {username,password}=req.body;
  if (username!==adminUsername||password!==adminPassword) return res.status(401).json({error:'Invalid credentials'});
  const token = crypto.randomBytes(32).toString('hex');
  adminSessions.set(token,{user:username,ts:Date.now()});
  res.json({success:true,token,username});
});
app.post('/api/admin/logout', adminAuth, (req,res) => { adminSessions.delete(req.headers['x-admin-token']); res.json({success:true}); });
app.get('/api/admin/overview', adminAuth, (req,res) => res.json({
  stats:{totalDeploys:Object.keys(deploys).length,totalPairs:statsData.pairCount,totalUsers:statsData.totalUsers,uptime:Math.floor((Date.now()-START_TIME)/1000)},
  currentDeploy:deploys[DEPLOY_ID], platform:detectPlatform(), adminUser:req.adminSession.user,
  botVersion:'8.0.0', nodeVersion:process.version, memUsage:process.memoryUsage(), activeConnections:activeConnections.size,
}));
app.get('/api/admin/deploys', adminAuth, (req,res) => res.json({deploys:Object.values(deploys)}));
app.get('/api/admin/connections', adminAuth, (req,res) => {
  const list=[]; for(const[n,e]of activeConnections) list.push({number:'+'+n,connected:e.connected});
  res.json({connections:list});
});
app.post('/api/admin/bot/restart', adminAuth, (req,res) => { res.json({success:true}); setTimeout(()=>process.exit(0),800); });

// ═══════════════════════════════════════════════════════════
//  SOCKET.IO
// ═══════════════════════════════════════════════════════════
io.on('connection', socket => {
  const st = getStats();
  socket.emit('statsUpdate', { activeSockets: st.activeSockets, totalUsers: st.totalUsers, pairCount: st.pairCount });
  socket.emit('botStatus', { connected: st.connected, number: st.botNumber, deployId: DEPLOY_ID, platform: detectPlatform() });
});

// ═══════════════════════════════════════════════════════════
//  GRACEFUL SHUTDOWN
// ═══════════════════════════════════════════════════════════
let isShuttingDown = false;
const gracefulShutdown = sig => {
  if (isShuttingDown) return; isShuttingDown = true;
  console.log(`\n🛑 ${sig} — preserving sessions`);
  saveStats();
  activeConnections.forEach((e,num) => { try { e.conn.ws?.terminate(); } catch {} });
  setTimeout(()=>process.exit(0), 3000);
};
process.on('SIGINT',  ()=>gracefulShutdown('SIGINT'));
process.on('SIGTERM', ()=>gracefulShutdown('SIGTERM'));
process.on('uncaughtException',  err => console.error('uncaughtException:', err.message));
process.on('unhandledRejection', err => console.error('unhandledRejection:', err));

// ═══════════════════════════════════════════════════════════
//  KEEP-ALIVE
// ═══════════════════════════════════════════════════════════
function startKeepAlive() {
  const rawUrl = process.env.APP_URL
    || (process.env.HEROKU_APP_DEFAULT_DOMAIN_NAME ? `https://${process.env.HEROKU_APP_DEFAULT_DOMAIN_NAME}` : null)
    || (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : null);
  if (!rawUrl) return;
  setInterval(() => {
    try {
      const mod = rawUrl.startsWith('https') ? require('https') : require('http');
      mod.get(rawUrl + '/health', ()=>{}).on('error',()=>{});
    } catch {}
  }, 25 * 60 * 1000);
  console.log(`💓 Keep-alive → ${rawUrl}`);
}

// ═══════════════════════════════════════════════════════════
//  START
// ═══════════════════════════════════════════════════════════
server.listen(PORT, async () => {
  console.log(`\n╔══════════════════════════════════════════════════════╗`);
  console.log(`║  🔥 REDXMINIBOT ULTRA v8.0 — BEAST EDITION          ║`);
  console.log(`║  🌐 http://localhost:${String(PORT).padEnd(30)}║`);
  console.log(`║  🆔 Deploy ID: ${String(DEPLOY_ID).padEnd(37)}║`);
  console.log(`║  🌐 Platform:  ${String(detectPlatform()).padEnd(37)}║`);
  console.log(`╚══════════════════════════════════════════════════════╝\n`);
  loadPlugins();
  await reloadExistingSessions();
  startKeepAlive();
});

async function reloadExistingSessions() {
  if (!fs.existsSync(SESSIONS_DIR)) return;
  const dirs = fs.readdirSync(SESSIONS_DIR).filter(d => {
    try { return fs.statSync(path.join(SESSIONS_DIR,d)).isDirectory(); } catch { return false; }
  });
  console.log(`📂 Found ${dirs.length} existing session(s)`);
  for (const num of dirs) {
    if (fs.existsSync(path.join(SESSIONS_DIR,num,'creds.json'))) {
      try { await initConnection(num); } catch(e) { console.error(`Reload ${num}: ${e.message}`); }
    }
  }
  broadcastStats();
}

function getStats() {
  return {
    connected:   [...activeConnections.values()].some(e=>e.connected),
    activeSockets: [...activeConnections.values()].filter(e=>e.connected).length,
    botNumber:   (()=>{ for(const[n,e]of activeConnections) if(e.connected) return n; return ''; })(),
    commands:    cmdCount+10,
    totalUsers:  statsData.totalUsers,
    pairCount:   statsData.pairCount,
    uptime:      Math.floor((Date.now()-START_TIME)/1000),
    mode:        global.BOT_MODE,
    deployId:    DEPLOY_ID,
    platform:    detectPlatform(),
    hasSession:  (()=>{ try { return fs.readdirSync(SESSIONS_DIR).some(d=>fs.existsSync(path.join(SESSIONS_DIR,d,'creds.json'))); } catch { return false; } })(),
    botName:     deploys[DEPLOY_ID]?.botName || BOT_NAME,
    ownerName:   deploys[DEPLOY_ID]?.ownerName || OWNER_NAME,
    prefix:      deploys[DEPLOY_ID]?.prefix || PREFIX,
  };
}

module.exports = { app, server, io };
