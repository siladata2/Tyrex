'use strict';
/**
 * 🔥 REDX MINI MD — ANTI-BAN EDITION v9.0
 * ✅ Fixed: forwardingScore spam, browser fingerprint, presence abuse,
 *    aggressive reconnect, newsletter context injection, group auto-join
 * Full plugin system · Antidelete · Stealth Presence · Channel Auto-React
 */

const express  = require('express');
const cors     = require('cors');
const http     = require('http');
const socketIo = require('socket.io');
const path     = require('path');
const fs       = require('fs');
const crypto   = require('crypto');
require('dotenv').config();

const supabaseStore = require('./lib/supabaseStore');

const {
  initPresenceManager,
  onOwnerActivity,
  destroyPresenceManager,
} = require('./lib/presenceManager');

let autoUpdate = null;
try { autoUpdate = require('./lib/autoUpdate'); } catch {}

const {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  Browsers,
  makeCacheableSignalKeyStore,
  jidNormalizedUser,
} = require('@whiskeysockets/baileys');
const NodeCache = require('node-cache');
const P = require('pino');

// ── CHANNEL REACTION POOL ────────────────────────────────────
const CHANNEL_REACTIONS = ['🔥','❤️','👏','💯','🚀','⚡','🎯','😍','🙌','💪'];

// ── RATE LIMITER — prevents message flooding (ban trigger) ───
const _msgTimestamps = new Map(); // jid -> [timestamps]
function canSend(jid, limitPerMin = 20) {
  const now = Date.now();
  const cutoff = now - 60_000;
  const arr = (_msgTimestamps.get(jid) || []).filter(t => t > cutoff);
  if (arr.length >= limitPerMin) return false;
  arr.push(now);
  _msgTimestamps.set(jid, arr);
  return true;
}

// ── SUDO / OWNER HELPERS ─────────────────────────────────────
let _libIndex = null;
function getLibIndex() {
  if (!_libIndex) { try { _libIndex = require('./lib/index'); } catch {} }
  return _libIndex;
}
async function isSudoUser(jid) {
  try { const lib = getLibIndex(); return lib ? await lib.isSudo(jid) : false; } catch { return false; }
}
function cleanNum(jid) { return (jid||'').split(':')[0].split('@')[0]; }
// ✅ FIX: WhatsApp now addresses many chats (DM + group) by @lid instead of the
// real phone-number JID. Baileys 7 exposes the real phone-number JID on the
// message key as participantAlt / remoteJidAlt / senderPn / participantPn.
// Without checking these, isOwner/isSudo silently fail whenever WhatsApp sends
// the message in @lid form (this was breaking owner-detection in DMs).
function getAltNum(msg) {
  const k = msg?.key || {};
  const alt = k.participantAlt || k.remoteJidAlt || k.senderPn || k.participantPn || '';
  return alt ? cleanNum(alt) : '';
}

// ── SAFE MODULE LOADING ──────────────────────────────────────
let antidelete = { storeMessage: async () => {}, handleMessageRevocation: async () => {} };
let GroupEvents = async () => {};
let handleAutoVV = null;
let anticallPlugin = null;

try {
  const ad = require('./lib/antidelete');
  if (ad && typeof ad === 'object') antidelete = ad;
} catch { console.warn('⚠️ antidelete module not found.'); }

try {
  const ge = require('./lib/groupevents');
  if (ge && typeof ge === 'function') GroupEvents = ge;
} catch { console.warn('⚠️ groupevents module not found.'); }

try {
  const vvPlugin = require('./plugins/advanced-vv');
  handleAutoVV = (Array.isArray(vvPlugin) ? vvPlugin.handleAutoVV : vvPlugin?.handleAutoVV) || null;
  if (!handleAutoVV) {
    const vo = require('./plugins/viewonce');
    handleAutoVV = vo?.handleAutoVV || null;
  }
  if (handleAutoVV) console.log('✅ handleAutoVV (vvset) loaded');
} catch(e) { console.warn('⚠️ vv plugin load error:', e.message); }

try {
  anticallPlugin = require('./plugins/anticall');
  if (anticallPlugin?.handleIncomingCall) console.log('✅ anticall plugin loaded');
} catch(e) { console.warn('⚠️ anticall plugin load error:', e.message); }

// ✅ FIX: ffmpeg was never initialized at boot, so FFMPEG_PATH stayed unset
// and any feature shelling out to ffmpeg (tts, bgm, stickers, video) either
// failed silently or fell back to a slow/unset system lookup on every call.
try { require('./lib/ffmpegSetup').setupFFmpeg(); } catch(e) { console.warn('⚠️ ffmpeg setup error:', e.message); }

// ✅ FIX: antilink / antibot / antibadword / bgm all export a passive
// "check every message" function, but nothing ever called them — only their
// .command handlers (on/off/config) were reachable. Wire them here so the
// actual moderation/trigger logic runs.
let antilinkCheck  = async () => {};
let antibotCheck   = async () => {};
let antibadwordCheck = async () => false;
let bgmCheckAndPlay = async () => false;
try { antilinkCheck = require('./plugins/antilink').handleLinkDetection || antilinkCheck; } catch(e) { console.warn('⚠️ antilink load error:', e.message); }
try { antibotCheck = require('./plugins/antibot').handleAntibotCheck || antibotCheck; } catch(e) { console.warn('⚠️ antibot load error:', e.message); }
try { antibadwordCheck = require('./plugins/antibadword').checkAntiBadword || antibadwordCheck; } catch(e) { console.warn('⚠️ antibadword load error:', e.message); }
let antibadwordMuteCheck = async () => false;
try { antibadwordMuteCheck = require('./plugins/antibadword').checkMuted || antibadwordMuteCheck; } catch(e) {}
// ✅ NEW: lib/selectionHandler.js was fully wired (plugins already call
// registerHandler on load) but nothing in index.js ever called
// handleSelection — so no plain "1".."9" reply ever reached it. Wiring it
// here is what makes the movie downloader's numbered picker (and anything
// else built on this registry) actually work.
const { handleSelection } = require('./lib/selectionHandler');
try {
  const bgmPlugin = require('./plugins/bgm');
  bgmCheckAndPlay = bgmPlugin.checkAndPlay || bgmCheckAndPlay;
  if (bgmPlugin.loadTriggers) bgmPlugin.loadTriggers().catch(()=>{});
} catch(e) { console.warn('⚠️ bgm load error:', e.message); }

// ── APP ─────────────────────────────────────────────────────
const app    = express();
const server = http.createServer(app);
const io     = socketIo(server, { cors: { origin: '*' } });
const PORT   = process.env.PORT || 3000;
const START_TIME = Date.now();

app.use(cors({ origin: '*', methods: ['GET','POST','DELETE','PUT','OPTIONS'], allowedHeaders: ['Content-Type','x-admin-token','x-deploy-key'] }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── CONFIG ──────────────────────────────────────────────────
const BOT_NAME     = process.env.BOT_NAME     || '🔥 REDX MINI MD 🔥';
const OWNER_NAME   = process.env.OWNER_NAME   || 'Abdul Rehman Rajpoot';
const OWNER_NUM    = process.env.OWNER_NUMBER || '923009842133';
const CO_OWNER     = process.env.CO_OWNER_NAME || '';
const CO_OWNER_NUM = process.env.CO_OWNER_NUM  || '';
const PREFIX       = process.env.PREFIX       || '.';
const BOT_IMG      = process.env.MENU_IMAGE   || 'https://files.catbox.moe/s36b12.jpg';
const REPO_LINK    = process.env.REPO_LINK    || 'https://github.com/AbdulRehman19721986/REDXBOT-MD';
const NL_JID       = process.env.NEWSLETTER_JID || '120363405513439052@newsletter';
const NL_NAME      = '🔥 REDX MINI MD 🔥';
const WA_GROUP     = process.env.WA_GROUP || ''; // ⚠️ Set in .env — disabled by default to prevent ban
const TG_GROUP     = 'https://t.me/TeamRedxhacker2';
global.BOT_MODE    = 'public';

// ── ANTI-BAN CONFIG ──────────────────────────────────────────
// Set AUTO_STATUS_REACT=false and AUTO_GROUP_JOIN=false to prevent banning
const AUTO_STATUS_REACT  = process.env.AUTO_STATUS_REACT !== 'false';  // default true
const AUTO_STATUS_SEEN   = process.env.AUTO_STATUS_SEEN  !== 'false';  // default true
const AUTO_GROUP_JOIN    = process.env.AUTO_GROUP_JOIN   === 'true';   // default FALSE (ban risk)
const AUTO_NL_FOLLOW     = process.env.AUTO_NL_FOLLOW    !== 'false';  // default true

let adminUsername = process.env.ADMIN_USERNAME || 'redx';
let adminPassword = process.env.ADMIN_PASSWORD || 'redx';
const adminSessions = new Map();

// ── PATHS ────────────────────────────────────────────────────
const SESSIONS_DIR   = path.join(__dirname, 'sessions');
const DATA_FILE      = path.join(__dirname, 'data.json');
const DEPLOYS_FILE   = path.join(__dirname, 'deploys.json');
const SERVERS_FILE   = path.join(__dirname, 'servers.json');
const DEPLOY_ID_FILE = path.join(__dirname, 'deploy_id.txt');

[SESSIONS_DIR, path.join(__dirname,'temp'), path.join(__dirname,'data')].forEach(d => {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});

// ── DEPLOY ID ────────────────────────────────────────────────
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

// ── PERSISTENT DATA ──────────────────────────────────────────
let statsData = { totalUsers: 0, pairCount: 0 };
const loadStats = () => { try { if (fs.existsSync(DATA_FILE)) statsData = { ...statsData, ...JSON.parse(fs.readFileSync(DATA_FILE,'utf8')) }; } catch {} };
const saveStats = () => { try { fs.writeFileSync(DATA_FILE, JSON.stringify({ ...statsData, lastUpdated: new Date().toISOString() },null,2)); } catch {} };
loadStats(); setInterval(saveStats, 30000);

// ── DEPLOYS REGISTRY ─────────────────────────────────────────
let deploys = {};
const VALID_MODES = ['public', 'private', 'groups', 'inbox', 'self'];
const loadDeploys = () => { try { if (fs.existsSync(DEPLOYS_FILE)) deploys = JSON.parse(fs.readFileSync(DEPLOYS_FILE,'utf8')); } catch {} };
const saveDeploys = () => { try { fs.writeFileSync(DEPLOYS_FILE, JSON.stringify(deploys,null,2)); } catch {} };
loadDeploys();

if (!deploys[DEPLOY_ID]) {
  deploys[DEPLOY_ID] = {
    id: DEPLOY_ID, platform: detectPlatform(),
    createdAt: new Date().toISOString(), numbers: [],
    pairCount: 0, botName: BOT_NAME, ownerName: OWNER_NAME,
    prefix: PREFIX, mode: global.BOT_MODE,
    deployKey: crypto.randomBytes(16).toString('hex'),
  };
}

const envMode = process.env.BOT_MODE?.toLowerCase();
const savedMode = deploys[DEPLOY_ID]?.mode?.toLowerCase();
if (envMode && VALID_MODES.includes(envMode)) {
  global.BOT_MODE = envMode;
} else if (savedMode && VALID_MODES.includes(savedMode)) {
  global.BOT_MODE = savedMode;
} else {
  global.BOT_MODE = 'public';
}
deploys[DEPLOY_ID].mode = global.BOT_MODE;
deploys[DEPLOY_ID].lastSeen = new Date().toISOString();
deploys[DEPLOY_ID].platform = detectPlatform();
saveDeploys();

let servers = [];
const loadServers = () => { try { if (fs.existsSync(SERVERS_FILE)) servers = JSON.parse(fs.readFileSync(SERVERS_FILE,'utf8')); } catch {} };
const saveServers = () => { try { fs.writeFileSync(SERVERS_FILE, JSON.stringify(servers,null,2)); } catch {} };
loadServers();

// ── ACTIVE CONNECTIONS ────────────────────────────────────────
const activeConnections = new Map();

const broadcastStats = () => {
  const connected = [...activeConnections.values()].filter(c=>c.connected).length;
  io.emit('statsUpdate', { activeSockets: connected, totalUsers: statsData.totalUsers, pairCount: statsData.pairCount });
};

// ── GROUP METADATA CACHE (5-min TTL — avoids repeated API calls) ──
const groupMetaCache = new Map();
const GROUP_CACHE_TTL = 5 * 60 * 1000;
async function getCachedGroupMeta(conn, jid) {
  const now = Date.now();
  const cached = groupMetaCache.get(jid);
  if (cached && now - cached.ts < GROUP_CACHE_TTL) return cached.meta;
  try {
    const meta = await conn.groupMetadata(jid);
    groupMetaCache.set(jid, { meta, ts: now });
    return meta;
  } catch { return null; }
}

// ======================== PLUGIN LOADER ========================
const commands   = new Map();
const pluginsDir = path.join(__dirname, 'plugins');
let cmdCount     = 0;

const loadPlugins = () => {
  commands.clear(); cmdCount = 0;
  if (!fs.existsSync(pluginsDir)) { fs.mkdirSync(pluginsDir,{recursive:true}); return; }

  // ⚠️ SKIP known spammer/bomber plugins — they cause immediate bans
  const BANNED_PLUGINS = new Set(['smsbomber.js', 'bomber.js', 'boomber.js']);

  const files = fs.readdirSync(pluginsDir)
    .filter(f => f.endsWith('.js') && !f.startsWith('.') && !BANNED_PLUGINS.has(f));

  for (const file of files) {
    try {
      const fp = path.join(pluginsDir, file);
      delete require.cache[require.resolve(fp)];
      const mod = require(fp);

      const normalise = (raw) => {
        if (!raw || typeof raw !== 'object') return null;
        if (raw.pattern && raw.execute) return raw;
        if ((raw.command || raw.pattern) && (raw.handler || raw.execute)) {
          const pattern = raw.command || raw.pattern;
          const execute = raw.handler
            ? async (conn, msg, m, opts) => {
                const context = {
                  chatId: opts.from, command: pattern,
                  isOwner: opts.isOwner, isAdmin: opts.isAdmin,
                  senderIsOwnerOrSudo: opts.isOwner, isOwnerOrSudoCheck: opts.isOwner,
                  config: {
                    botName: BOT_NAME, ownerName: OWNER_NAME,
                    ownerNumber: OWNER_NUM, coOwner: CO_OWNER,
                    coOwnerNumber: CO_OWNER_NUM, prefix: PREFIX,
                    mode: global.BOT_MODE, platform: detectPlatform(),
                  },
                  deployId: DEPLOY_ID,
                  ...opts,
                };
                return raw.handler(conn, msg, opts.args || [], context);
              }
            : raw.execute;
          return {
            ...raw, pattern, execute,
            alias: raw.aliases || raw.alias || [],
            category: raw.category || 'other',
            desc: raw.description || raw.desc || '',
            ownerOnly: !!raw.ownerOnly,
          };
        }
        return null;
      };

      const register = (cmd) => {
        const norm = normalise(cmd);
        if (!norm) return;
        commands.set(norm.pattern, norm); cmdCount++;
        const aliases = Array.isArray(norm.alias) ? norm.alias : [];
        aliases.forEach(a => { if (a) commands.set(a, norm); });
      };

      if (Array.isArray(mod)) {
        mod.forEach(register);
      } else if (mod && typeof mod === 'object') {
        const norm = normalise(mod);
        if (norm) { register(mod); }
        else { Object.values(mod).forEach(v => { if (v && typeof v === 'object') register(v); }); }
      }
    } catch(e){ console.error(`Plugin ${file}: ${e.message?.slice(0,120)}`); }
  }
  console.log(`🔌 ${cmdCount} commands loaded from ${files.length} plugin files`);
  global.botCommands = commands;
};
loadPlugins();
if (fs.existsSync(pluginsDir)) fs.watch(pluginsDir,(e,f)=>{ if(f&&f.endsWith('.js')){ console.log(`♻️ Reloading ${f}`); loadPlugins(); } });

// ======================== MAKE SOCKET CONFIG ========================
// ✅ ANTI-BAN: Use Ubuntu Chrome — most common fingerprint, lowest detection
function buildSocketConfig(state) {
  return {
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, P({ level: 'silent' }).child({ level: 'silent' })),
    },
    logger: P({ level: 'silent' }),
    printQRInTerminal: false,
    // ✅ ANTI-BAN: Ubuntu Chrome is the most common, least suspicious fingerprint
    browser: Browsers.ubuntu('Chrome'),
    // ✅ ANTI-BAN: 30s keepAlive instead of 10s — less WS noise
    keepAliveIntervalMs:      30_000,
    connectTimeoutMs:         30_000,
    defaultQueryTimeoutMs:    30_000,
    // ✅ ANTI-BAN: Slower retry — aggressive reconnect triggers ban
    retryRequestDelayMs:      2_000,
    maxRetries:               3,
    // ✅ ANTI-BAN: Don't appear online on connect
    markOnlineOnConnect:      false,
    syncFullHistory:          false,
    emitOwnEvents:            true,
    fireInitQueries:          true,
  };
}

// ======================== INIT CONNECTION ========================
async function initConnection(number) {
  const sessionDir = path.join(SESSIONS_DIR, number);
  if (!fs.existsSync(sessionDir)) fs.mkdirSync(sessionDir, { recursive: true });

  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
  const { version }          = await fetchLatestBaileysVersion();

  const msgRetryCounterCache = new NodeCache({ stdTTL: 60, checkperiod: 120 });
  const _msgStore = new Map();

  const conn = makeWASocket({
    version,
    ...buildSocketConfig(state),
    msgRetryCounterCache,
    getMessage: async (key) => {
      try {
        const jid = jidNormalizedUser(key.remoteJid);
        const store = _msgStore.get(jid);
        if (store) { const found = store.get(key.id); if (found) return found.message || undefined; }
      } catch {}
      return undefined;
    },
  });

  // Bind message store (needed for group retry)
  conn.ev.on('messages.upsert', ({ messages }) => {
    for (const msg of messages) {
      if (!msg.message) continue;
      const jid = jidNormalizedUser(msg.key.remoteJid || '');
      if (!_msgStore.has(jid)) _msgStore.set(jid, new Map());
      const chatStore = _msgStore.get(jid);
      chatStore.set(msg.key.id, msg);
      if (chatStore.size > 200) { const firstKey = chatStore.keys().next().value; chatStore.delete(firstKey); }
    }
  });

  // Invalidate group cache on participant change
  conn.ev.on('group-participants.update', ({ id }) => { groupMetaCache.delete(id); });

  const prev = activeConnections.get(number) || {};
  activeConnections.set(number, { conn, saveCreds, connected: false, hasWelcomed: prev.hasWelcomed||false, reconnectAttempts: prev.reconnectAttempts||0 });

  setupHandlers(conn, number, saveCreds);
  return conn;
}

function setupHandlers(conn, number, saveCreds) {
  const entry = activeConnections.get(number);

  conn.ev.on('creds.update', async () => {
    try {
      await saveCreds();
      if (supabaseStore.isEnabled()) {
        try {
          const sessionDir = path.join(SESSIONS_DIR, number);
          const credsPath  = path.join(sessionDir, 'creds.json');
          if (fs.existsSync(credsPath)) {
            const creds = JSON.parse(fs.readFileSync(credsPath, 'utf8'));
            await supabaseStore.saveSession(number, creds);
          }
        } catch (e) { console.error('[SUPABASE] Creds backup error:', e.message); }
      }
    } catch {}
  });

  conn.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update;
    if (connection) console.log(`[${number}] ${connection}`);

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

      initPresenceManager(conn, number);

      // ✅ ANTI-BAN: Newsletter follow — only if enabled, with safe delay
      if (AUTO_NL_FOLLOW && NL_JID) {
        setTimeout(async () => {
          try {
            await conn.newsletterFollow(NL_JID);
            console.log(`[${number}] ✅ Followed channel`);
          } catch {}
        }, 8_000); // longer delay = safer
      }

      // ✅ ANTI-BAN: Auto-join group DISABLED by default — set AUTO_GROUP_JOIN=true in .env to enable
      if (AUTO_GROUP_JOIN && WA_GROUP && WA_GROUP.startsWith('https://chat.whatsapp.com/')) {
        setTimeout(async () => {
          try {
            const inviteCode = WA_GROUP.split('chat.whatsapp.com/')[1].trim();
            await conn.groupAcceptInvite(inviteCode);
            console.log(`[${number}] ✅ Auto-joined group`);
          } catch (e) { console.log(`[${number}] ⚠️ Group join: ${e.message}`); }
        }, 15_000);
      }

      if (!entry.hasWelcomed) {
        entry.hasWelcomed = true;
        setTimeout(() => sendWelcome(conn, number).catch(()=>{}), 5000);
      }
    }

    if (connection === 'close') {
      entry.connected = false;
      destroyPresenceManager(number);
      broadcastStats();
      io.emit('botStatus', { connected: false, number });

      const code        = lastDisconnect?.error?.output?.statusCode;
      const isLoggedOut = code === DisconnectReason.loggedOut || code === 401 || code === 405;
      console.log(`❌ [${number}] closed code=${code}`);

      if (isLoggedOut) {
        console.log(`🗑️  [${number}] logout — deleting session`);
        try { fs.rmSync(path.join(SESSIONS_DIR,number),{recursive:true,force:true}); } catch {}
        activeConnections.delete(number);
        io.emit('unlinked', { sessionId: number, number });
        return;
      }

      // ✅ ANTI-BAN: Exponential backoff with jitter — aggressive reconnect = ban
      if (entry.reconnectAttempts < 5) {
        entry.reconnectAttempts++;
        const base = 5000 * entry.reconnectAttempts;
        const jitter = Math.floor(Math.random() * 3000);
        const wait = Math.min(base + jitter, 60_000);
        console.log(`🔄 [${number}] reconnect in ${(wait/1000).toFixed(1)}s (${entry.reconnectAttempts}/5)`);
        setTimeout(async () => {
          try { conn.ev.removeAllListeners(); try{conn.ws?.terminate();}catch{}; await initConnection(number); }
          catch(e){ console.error(`Reconnect ${number}: ${e.message}`); }
        }, wait);
      } else {
        console.log(`🛑 [${number}] max reconnects reached — manual re-pair needed`);
        activeConnections.delete(number);
        io.emit('unlinked', { sessionId: number, number });
      }
    }
  });

  conn.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const msg of messages) {
      const from = msg.key?.remoteJid || '';

      // ✅ ANTI-BAN: Rate-limit channel reactions (no reaction spam)
      if (from.endsWith('@newsletter')) {
        if (canSend(from, 5)) {
          try {
            const emoji = CHANNEL_REACTIONS[Math.floor(Math.random() * CHANNEL_REACTIONS.length)];
            try { await conn.sendMessage(from, { react: { text: emoji, key: msg.key } }); }
            catch { await conn.newsletterSendReaction?.(from, msg.key.id, emoji); }
          } catch {}
        }
        continue;
      }

      // ✅ FIX: on Baileys 7.x, "delete for everyone" arrives as a normal
      // message in messages.upsert with message.protocolMessage.type REVOKE —
      // it does NOT reliably fire messages.update on every host. The old code
      // only listened on messages.update, so real-time deletions were missed.
      const pmType = msg.message?.protocolMessage?.type;
      if (pmType === 0 || pmType === 5) {
        if (antidelete && typeof antidelete.handleMessageRevocation === 'function') {
          try { await antidelete.handleMessageRevocation(conn, msg); } catch(e) { console.error('[antidelete upsert]', e.message); }
        }
        continue;
      }

      if (antidelete && typeof antidelete.storeMessage === 'function')
        await antidelete.storeMessage(conn, msg);
      // Auto-VV intercept (vvset triggers)
      if (handleAutoVV) {
        try { await handleAutoVV(conn, msg); } catch(e) { console.error('[vv auto]', e.message); }
      }
      try { await handleMessage(conn, msg, number); } catch(e){ console.error(`msg: ${e.message}`); }
    }
    // ✅ ANTI-BAN: Don't call goOffline after EVERY message batch — presence spam triggers ban
    // Presence is managed by presenceManager on its own 5-min timer
  });

  conn.ev.on('messages.update', async (updates) => {
    for (const update of updates) {
      // REVOKE = type 0 in Baileys proto (was wrongly 1)
      const pType = update.update?.protocolMessage?.type ?? update.update?.message?.protocolMessage?.type;
      if (pType === 0 || pType === 5) {
        if (antidelete && typeof antidelete.handleMessageRevocation === 'function') {
          // Build synthetic msg so plugin message?.protocolMessage path resolves
          const synMsg = {
            key: update.key,
            message: update.update?.message || update.update,
            participant: update.key?.participant,
            update: update.update,
          };
          await antidelete.handleMessageRevocation(conn, synMsg);
        }
      }
    }
  });

  conn.ev.on('group-participants.update', async (update) => {
    try {
      await GroupEvents(conn, update, { botName: BOT_NAME, ownerName: OWNER_NAME, menuImage: BOT_IMG, newsletterJid: NL_JID });
    } catch(e){ console.error('GroupEvents:', e.message); }
  });

  // ── ANTICALL: reject incoming calls ──────────────────────────
  conn.ev.on('call', async (calls) => {
    for (const call of calls) {
      try {
        if (anticallPlugin && typeof anticallPlugin.handleIncomingCall === 'function') {
          await anticallPlugin.handleIncomingCall(conn, call);
        }
      } catch(e) { console.error('[anticall] event error:', e.message); }
    }
  });
}

// ======================== WELCOME MESSAGE ========================
// ✅ ANTI-BAN: No forwardingScore, no isForwarded, no newsletterContext — plain messages don't get flagged
async function sendWelcome(conn, number) {
  const userJid = `${number}@s.whatsapp.net`;
  let name = 'User';
  try { name = conn.user?.name || conn.user?.notify || 'User'; } catch {}
  const dep = deploys[DEPLOY_ID];
  const now = new Date().toLocaleString('en-US', { hour12: true, hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short', year: 'numeric' });

  // ✅ FIX: raw REPO_LINK/GitHub source was printed directly in the welcome
  // message — hidden now. Also sends BOT_IMG as an actual image (was
  // text-only before) and reformats as a proper session card.
  const caption = `╭───「 🔥 *${BOT_NAME}* 🔥 」
│
│  ✅ *Session Linked Successfully!*
│
├─ 👤 *User:* ${name}
├─ 📱 *Number:* +${number}
├─ 🕒 *Linked:* ${now}
├─ 👑 *Owner:* ${OWNER_NAME}
├─ 🌍 *Mode:* ${global.BOT_MODE.toUpperCase()}
├─ 📌 *Prefix:* \`${dep.prefix||PREFIX}\`
├─ 📦 *Commands:* ${cmdCount+8}+
├─ 🆔 *Deploy ID:* \`${DEPLOY_ID}\`
├─ 🔑 *Deploy Key:* \`${dep.deployKey}\`
│
╰───────────────⊷

🔒 *Keep your Deploy Key private — it controls this session.*
💡 Send *${dep.prefix||PREFIX}menu* anytime to see every command.

> 🔥 ${BOT_NAME} — by ${OWNER_NAME}`;

  try {
    await conn.sendMessage(userJid, { image: { url: BOT_IMG }, caption });
  } catch (e) {
    // Fallback to plain text if the image fails to send (bad URL, offline host, etc.)
    console.warn('[welcome] image send failed, falling back to text:', e.message);
    await conn.sendMessage(userJid, { text: caption });
  }
}

// ======================== MESSAGE HANDLER ========================
async function handleMessage(conn, msg, sessionId) {
  const from    = msg.key.remoteJid;
  const sender  = msg.key.participant || msg.key.remoteJid;
  const sNum    = sender.split('@')[0].split(':')[0];

  const sNumClean       = cleanNum(sender);
  const altNumClean     = getAltNum(msg); // real PN when sender/remoteJid is @lid
  const sessionNumClean = cleanNum(sessionId);
  const ownerClean      = cleanNum(OWNER_NUM);
  const coOwnerClean    = CO_OWNER_NUM ? cleanNum(CO_OWNER_NUM) : '';

  const isRealOwner = sNumClean === ownerClean || altNumClean === ownerClean
    || (coOwnerClean && (sNumClean === coOwnerClean || altNumClean === coOwnerClean));

  let isOwner = isRealOwner;

  if (!isOwner && msg.key.fromMe) isOwner = true;

  // ✅ FIX: @lid resolution now also runs for DMs, not just groups.
  if (!isOwner && (sNumClean.length > 15 || sender.includes('@lid'))) {
    try {
      const results = await conn.onWhatsApp?.(OWNER_NUM, ...(coOwnerClean ? [CO_OWNER_NUM] : []));
      if (Array.isArray(results)) {
        for (const r of results) {
          if (r?.lid && cleanNum(r.lid) === sNumClean) { isOwner = true; break; }
        }
      }
    } catch {}
  }

  if (!isOwner && from?.endsWith('@g.us')) {
    try {
      const meta = await getCachedGroupMeta(conn, from);
      if (meta) {
        const participant = meta.participants.find(p => p.lid === sender || p.id === sender);
        if (participant) {
          const realNum = cleanNum(participant.id);
          if (realNum === ownerClean || (coOwnerClean && realNum === coOwnerClean)) isOwner = true;
        }
      }
    } catch {}
  }

  const isSudo = !isOwner ? (await isSudoUser(sender) || (altNumClean && await isSudoUser(altNumClean + '@s.whatsapp.net'))) : false;
  const isSudoLinked = (!isOwner && !isSudo && sender.includes(':'))
    ? await isSudoUser(sender.split(':')[0] + '@s.whatsapp.net') : false;
  if (!isOwner) isOwner = isSudo || isSudoLinked;

  if (isOwner && msg.key.fromMe) onOwnerActivity(conn, sessionId);

  // Status messages — ✅ ANTI-BAN: rate-limited, no spam
  if (from === 'status@broadcast') {
    if (AUTO_STATUS_SEEN) await conn.readMessages([msg.key]).catch(()=>{});
    if (AUTO_STATUS_REACT && canSend('status@broadcast', 30)) {
      const e=['🔥','⚡','💯','👑','🚀','💎','❤️','💜','✨','🌟'][Math.floor(Math.random()*10)];
      await conn.sendMessage(from,{react:{text:e,key:msg.key}},{statusJidList:[sender,conn.user.id]}).catch(()=>{});
    }
    return;
  }
  if (from?.endsWith('@newsletter')) return;
  if (!msg.message) return;

  const isGroupChat = from?.endsWith('@g.us');
  if (!isOwner) {
    switch (global.BOT_MODE) {
      case 'public':               break;
      case 'private': case 'self': return;
      case 'groups':  if (!isGroupChat) return; break;
      case 'inbox':   if (isGroupChat)  return; break;
      default:                     break;
    }
  }

  const body = msg.message?.conversation
    || msg.message?.extendedTextMessage?.text
    || msg.message?.imageMessage?.caption
    || msg.message?.videoMessage?.caption
    || msg.message?.documentMessage?.caption
    || msg.message?.buttonsResponseMessage?.selectedButtonId
    || msg.message?.listResponseMessage?.singleSelectReply?.selectedRowId
    || msg.message?.templateButtonReplyMessage?.selectedId
    || msg.message?.ephemeralMessage?.message?.conversation
    || msg.message?.ephemeralMessage?.message?.extendedTextMessage?.text
    || msg.message?.viewOnceMessage?.message?.imageMessage?.caption
    || msg.message?.viewOnceMessage?.message?.videoMessage?.caption
    || '';

  const dep = deploys[DEPLOY_ID];
  const pfx = dep?.prefix || PREFIX;

  // ✅ FIX: antilink / antibot / antibadword / bgm all watch PLAIN messages
  // (no command prefix). The old code returned above this point whenever a
  // message didn't start with the prefix, so none of these ever ran on real
  // group chatter or on bgm trigger words. Run them first.
  if (!msg.key.fromMe && isGroupChat) {
    try { if (await antibadwordMuteCheck(conn, msg)) return; } catch(e) { console.error('[antibadword-mute]', e.message); }
    try { if (await antibadwordCheck(conn, msg)) return; } catch(e) { console.error('[antibadword]', e.message); }
    try { await antibotCheck(conn, msg, from, sender); } catch(e) { console.error('[antibot]', e.message); }
    try { await antilinkCheck(conn, from, msg, body, sender); } catch(e) { console.error('[antilink]', e.message); }
  }
  // ✅ NEW: a bare "1".."9" reply is how numbered pickers (movie search,
  // etc.) resolve — check that before bgm/prefix handling so it doesn't
  // get swallowed as an unmatched trigger word or ignored entirely.
  if (!msg.key.fromMe && /^[1-9]$/.test(body.trim())) {
    try {
      const handled = await handleSelection(conn, msg, { chatId: from }, parseInt(body.trim(), 10));
      if (handled) return;
    } catch (e) { console.error('[selection]', e.message); }
  }

  // ✅ FIX: bgm.js is explicitly built to also fire on the owner's own
  // outgoing messages (self-bot use case) — gating it behind `!fromMe` (like
  // the moderation plugins above) silently killed every trigger sent from
  // the linked/owner number, which is how most people were testing it.
  try { if (await bgmCheckAndPlay(conn, msg, body, from, {})) return; } catch(e) { console.error('[bgm]', e.message); }

  if (!body.startsWith(pfx)) return;

  const args = body.slice(pfx.length).trim().split(/ +/);
  const cmd  = args.shift().toLowerCase();
  const q    = body.slice(pfx.length + cmd.length).trim();

  console.log(`[${new Date().toLocaleTimeString()}] ${pfx}${cmd} | ${sNum}`);

  if (await runBuiltIn(conn, msg, cmd, args, q, from, sender, isOwner, pfx)) return;

  if (commands.has(cmd)) {
    const plugin = commands.get(cmd);
    if (plugin.strictOwnerOnly && !isRealOwner) {
      await conn.sendMessage(from, { text: '❌ This command is restricted to the real owner only.' }, { quoted: msg });
      return;
    }
    if (plugin.ownerOnly && !isOwner) {
      await conn.sendMessage(from, { text: '❌ This command is for the bot owner/co-owner only.' }, { quoted: msg });
      return;
    }
    try {
      const reply   = (text, opts={}) => conn.sendMessage(from,{text},{quoted:msg,...opts});
      const isGroup = from.endsWith('@g.us');
      let gMeta = null;
      if (isGroup) { gMeta = await getCachedGroupMeta(conn, from); }
      let isAdmin = false;
      if (isGroup && gMeta) { const p = gMeta.participants.find(p=>p.id===sender); isAdmin = p?.admin==='admin'||p?.admin==='superadmin'; }
      const quoted = getQuoted(msg);
      const pluginOpts = {
        args, q, reply, from, isGroup, groupMetadata: gMeta,
        sender, isAdmin, isOwner, isRealOwner, botName: BOT_NAME, ownerName: OWNER_NAME,
        prefix: pfx, senderNumber: sNum, chatId: from, deployId: DEPLOY_ID,
        senderIsOwnerOrSudo: isOwner, isOwnerOrSudoCheck: isOwner,
        sessionId: sessionNumClean,
      };
      await plugin.execute(conn, msg, {
        mentionedJid: msg.message?.extendedTextMessage?.contextInfo?.mentionedJid||[],
        quoted, sender, key: msg.key, message: msg.message,
      }, pluginOpts);
    } catch(e){ console.error(`cmd[${cmd}]: ${e.message}`); }
  }
}

// ======================== BUILT-IN COMMANDS ========================
// ✅ ANTI-BAN: All built-in replies are plain messages — no forwardingScore/newsletter injection
async function runBuiltIn(conn, msg, cmd, args, q, from, sender, isOwner, pfx) {
  const dep = deploys[DEPLOY_ID];

  // Plain sender — no newsletter/forward context (ban risk removed)
  const s = text => conn.sendMessage(from, { text }, { quoted: msg });

  switch(cmd) {
    case 'ping': {
      const t = Date.now();
      await conn.sendMessage(from, { react: { text: '⚡', key: msg.key } });
      await s(`⚡ *ᴘɪɴɢ:* \`${Date.now()-t}ms\`\n\n> 🔥 ${BOT_NAME}`);
      return true;
    }
    case 'owner':
      await conn.sendMessage(from, {
        contacts: { displayName: OWNER_NAME, contacts: [{ vcard: `BEGIN:VCARD\nVERSION:3.0\nFN:${OWNER_NAME}\nTEL;type=CELL;waid=${OWNER_NUM}:+${OWNER_NUM}\nEND:VCARD` }] }
      }, { quoted: msg });
      await s(`👑 *ᴏᴡɴᴇʀ:* ${OWNER_NAME}\n📱 *ɴᴜᴍ:* +${OWNER_NUM}\n\n> 🔥 ${BOT_NAME}`);
      return true;

    case 'mode':
    case 'setmode':
    case 'botmode': {
      if (!isOwner) { await s('❌ Owner only.'); return true; }
      const m = args[0]?.toLowerCase();
      const modeDescMap = {
        public:  '🌍 Everyone can use bot in groups and DMs.',
        private: '🔒 Owner and sudo users only.',
        groups:  '👥 Only works in group chats for everyone.',
        inbox:   '💬 Only works in private DMs for everyone.',
        self:    '👤 Owner and sudo users only.'
      };
      if (m && VALID_MODES.includes(m)) {
        global.BOT_MODE = m;
        if (dep) dep.mode = m;
        saveDeploys();
        await s(`✅ *ᴍᴏᴅᴇ ᴄʜᴀɴɢᴇᴅ:* \`${m.toUpperCase()}\`\n\n${modeDescMap[m]}\n\n> 🔥 ${BOT_NAME}`);
      } else {
        const mList = VALID_MODES.map(md => `• \`${pfx}mode ${md}\` — ${modeDescMap[md]}`).join('\n');
        await s(`📌 *ᴄᴜʀʀᴇɴᴛ ᴍᴏᴅᴇ:* \`${global.BOT_MODE.toUpperCase()}\`\n\n*Available Modes:*\n${mList}\n\n> 🔥 ${BOT_NAME}`);
      }
      return true;
    }
    case 'deployid':
    case 'myid':
      await s(`🆔 *ᴅᴇᴘʟᴏʏ ɪᴅ:* \`${DEPLOY_ID}\`\n🔑 *ᴋᴇʏ:* \`${dep?.deployKey||'—'}\`\n🌐 *ᴘʟᴀᴛᴇ:* ${detectPlatform()}\n\n> 🔥 ${BOT_NAME}`);
      return true;

    case 'runtime':
    case 'uptime': {
      const up = Math.floor((Date.now()-START_TIME)/1000);
      const h=Math.floor(up/3600), m2=Math.floor((up%3600)/60), s2=up%60;
      await s(`⏱️ *ʀᴜɴᴛɪᴍᴇ:* \`${h}h ${m2}m ${s2}s\`\n📦 *ᴄᴍᴅs:* ${cmdCount+8}+\n🌍 *ᴍᴏᴅᴇ:* ${global.BOT_MODE.toUpperCase()}\n\n> 🔥 ${BOT_NAME}`);
      return true;
    }
    case 'restart':
    case 'shutdown':
      if (!isOwner) { await s('❌ Owner only.'); return true; }
      await s('🔄 *Restarting...*\n\n> 🔥 '+BOT_NAME);
      setTimeout(()=>process.exit(0),2000);
      return true;

    default: return false;
  }
}

function getQuoted(msg) {
  const ctx=msg.message?.extendedTextMessage?.contextInfo;
  if(!ctx?.quotedMessage)return null;
  return{message:{key:{remoteJid:ctx.participant||ctx.stanzaId,id:ctx.stanzaId,fromMe:false},message:ctx.quotedMessage},sender:ctx.participant};
}

// ======================== EXPRESS ROUTES ========================
app.get('/', (req,res)=>res.sendFile(path.join(__dirname,'public','index.html')));
app.get('/api/status', (req,res)=>res.json(getStats()));
// ── SESSION VISIBILITY: list saved sessions ──────────────────────────────
app.get('/api/sessions', (req,res)=>{
  try {
    const sessions = [];
    if (fs.existsSync(SESSIONS_DIR)) {
      for (const d of fs.readdirSync(SESSIONS_DIR)) {
        const hasCreds = fs.existsSync(path.join(SESSIONS_DIR, d, 'creds.json'));
        const conn = activeConnections.get(d);
        sessions.push({ number: d, hasCreds, connected: !!conn?.connected });
      }
    }
    const supabaseEnabled = supabaseStore.isEnabled();
    res.json({
      totalSaved: sessions.length,
      sessions,
      supabaseEnabled,
      note: supabaseEnabled ? 'Sessions backed up to Supabase ✅' : '⚠️ Supabase not configured — sessions will be lost on Render restart! Set SUPABASE_URL and SUPABASE_KEY.'
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});
app.get('/status', (req, res) => res.json({ status: 'ok', uptime: process.uptime(), bot: getStats() }));
app.get('/health', (req, res) => res.json({ status: 'ok', uptime: Math.floor((Date.now()-START_TIME)/1000), connected: [...activeConnections.values()].some(e=>e.connected), platform: detectPlatform(), deployId: DEPLOY_ID }));
app.get('/api/config', (req,res)=>res.json({
  botName: BOT_NAME, ownerName: OWNER_NAME, coOwner: CO_OWNER,
  prefix: PREFIX, menuImage: BOT_IMG, repoLink: REPO_LINK,
  waGroup: WA_GROUP, tgGroup: TG_GROUP,
  hasSession: (()=>{ try{ return fs.readdirSync(SESSIONS_DIR).some(d=>fs.existsSync(path.join(SESSIONS_DIR,d,'creds.json'))); }catch{return false;} })(),
  deployId: DEPLOY_ID, platform: detectPlatform(),
}));

app.post('/api/pair', async (req, res) => {
  let conn;
  try {
    const { number, force } = req.body;
    if (!number) return res.status(400).json({ error: 'Phone number required' });
    const num = number.replace(/\D/g,'');
    if (num.length < 7) return res.status(400).json({ error: 'Invalid phone number (include country code, no + sign)' });

    console.log(`📱 Pair request: ${num} force=${!!force}`);

    const existing = activeConnections.get(num);
    if (existing?.connected && !force) {
      return res.status(409).json({ error: 'Already connected!', hint: 'Send force:true to re-pair or use Logout first.', alreadyConnected: true });
    }

    if (existing) {
      try { existing.conn?.ev?.removeAllListeners(); existing.conn?.ws?.terminate(); } catch {}
      destroyPresenceManager(num);
      activeConnections.delete(num);
      await new Promise(r => setTimeout(r, 1500)); // safe cleanup delay
    }

    const sessionDir = path.join(SESSIONS_DIR, num);
    if (force && fs.existsSync(sessionDir)) {
      try { fs.rmSync(sessionDir, { recursive: true, force: true }); } catch {}
    }
    if (!fs.existsSync(sessionDir)) fs.mkdirSync(sessionDir, { recursive: true });

    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
    const { version }          = await fetchLatestBaileysVersion();

    conn = makeWASocket({
      version,
      ...buildSocketConfig(state),
      msgRetryCounterCache: new NodeCache({ stdTTL: 60, checkperiod: 120 }),
    });

    activeConnections.set(num, { conn, saveCreds, connected: false, hasWelcomed: false, reconnectAttempts: 0 });
    setupHandlers(conn, num, saveCreds);

    // ✅ ANTI-BAN: Wait for socket to stabilise before requesting code
    await new Promise(r => setTimeout(r, 4000));

    if (!conn.ws || conn.ws.readyState > 1) {
      throw new Error('WebSocket closed before pairing code could be requested. Please try again.');
    }

    const rawCode = await conn.requestPairingCode(num);
    const code    = (rawCode || '').toString().trim();
    if (!code) throw new Error('Empty pairing code received. Please try again.');
    const formatted = code.match(/.{1,4}/g)?.join('-') || code;

    console.log(`✅ Code for ${num}: ${formatted}`);
    return res.json({ success: true, pairingCode: formatted, code: formatted, number: num });

  } catch (err) {
    console.error('❌ /api/pair:', err.message);
    if (conn) { try { conn.ev.removeAllListeners(); conn.ws?.terminate(); } catch {} }
    return res.status(500).json({ error: err.message || 'Failed to get pairing code. Please try again.' });
  }
});

app.post('/api/logout', async (req,res) => {
  try {
    const { number } = req.body;
    const num = (number||'').replace(/\D/g,'');
    if (num) {
      const e = activeConnections.get(num);
      if (e?.conn){ try{e.conn.ev.removeAllListeners();e.conn.ws?.terminate();}catch{} }
      destroyPresenceManager(num);
      activeConnections.delete(num);
      try{fs.rmSync(path.join(SESSIONS_DIR,num),{recursive:true,force:true});}catch{}
      io.emit('unlinked',{sessionId:num,number:num});
    } else {
      for(const[n,e]of activeConnections){ if(e?.conn){try{e.conn.ev.removeAllListeners();e.conn.ws?.terminate();}catch{}} destroyPresenceManager(n); try{fs.rmSync(path.join(SESSIONS_DIR,n),{recursive:true,force:true});}catch{} io.emit('unlinked',{sessionId:n,number:n}); }
      activeConnections.clear();
    }
    broadcastStats(); io.emit('botStatus',{connected:false,number:''});
    res.json({success:true,message:'Logged out'});
  } catch(err){ res.status(500).json({error:err.message}); }
});

app.post('/api/reload',(req,res)=>{ loadPlugins(); res.json({success:true,commands:cmdCount}); });

app.get('/api/deploy/:id',(req,res)=>{
  const id=req.params.id.toUpperCase(); const d=deploys[id];
  if(!d)return res.status(404).json({error:'Deploy ID not found'});
  res.json({ id:d.id, platform:d.platform, pairCount:d.pairCount||0, createdAt:d.createdAt, lastSeen:d.lastSeen, numbers:d.numbers?.length||0 });
});

// ── USER DEPLOY KEY API ───────────────────────────────────────
function deployKeyAuth(req, res, next) {
  const key = req.headers['x-deploy-key'] || req.body?.deployKey || req.query?.key;
  if (!key) return res.status(401).json({ error: 'Deploy key required' });
  const dep = Object.values(deploys).find(d => d.deployKey === key);
  if (!dep) return res.status(401).json({ error: 'Invalid deploy key' });
  req.deploy = dep; next();
}

app.post('/api/user/info', deployKeyAuth, (req,res) => {
  const d = req.deploy;
  res.json({ id:d.id, platform:d.platform, pairCount:d.pairCount||0, numbers:d.numbers||[], createdAt:d.createdAt, lastSeen:d.lastSeen, botName:d.botName, ownerName:d.ownerName, prefix:d.prefix, mode:d.mode, connected:[...activeConnections.values()].some(e=>e.connected) });
});

app.post('/api/user/update', deployKeyAuth, (req,res) => {
  const d = req.deploy;
  const { botName, ownerName, prefix, mode } = req.body;
  if (botName)   d.botName   = botName;
  if (ownerName) d.ownerName = ownerName;
  if (prefix)    d.prefix    = prefix;
  if (mode && VALID_MODES.includes(mode)) { d.mode = mode; if (d.id === DEPLOY_ID) global.BOT_MODE = mode; }
  saveDeploys();
  res.json({ success: true, deploy: { id:d.id, botName:d.botName, ownerName:d.ownerName, prefix:d.prefix, mode:d.mode } });
});

app.post('/api/user/logout', deployKeyAuth, async (req,res) => {
  const d = req.deploy; let count = 0;
  for (const num of (d.numbers||[])) {
    const e = activeConnections.get(num);
    if (e?.conn) { try{e.conn.ev.removeAllListeners();e.conn.ws?.terminate();}catch{} }
    destroyPresenceManager(num);
    activeConnections.delete(num);
    try{fs.rmSync(path.join(SESSIONS_DIR,num),{recursive:true,force:true});}catch{}
    count++;
  }
  d.numbers = []; saveDeploys(); broadcastStats();
  io.emit('botStatus',{connected:false,number:''});
  res.json({ success: true, message: `Logged out ${count} session(s)` });
});

app.get('/api/user/status', deployKeyAuth, (req,res) => { res.json({ ...getStats(), deployKey: '***hidden***' }); });

// ── ADMIN ROUTES ──────────────────────────────────────────────
const adminAuth = (req,res,next) => {
  const token = req.headers['x-admin-token']||req.query.token;
  if(!token||!adminSessions.has(token))return res.status(401).json({error:'Unauthorized'});
  const s=adminSessions.get(token);
  if(Date.now()-s.ts>86400000){adminSessions.delete(token);return res.status(401).json({error:'Session expired'});}
  req.adminSession=s; next();
};

app.post('/api/admin/login',(req,res)=>{
  const{username,password}=req.body;
  if(username!==adminUsername||password!==adminPassword)return res.status(401).json({error:'Invalid credentials'});
  const token=crypto.randomBytes(32).toString('hex');
  adminSessions.set(token,{user:username,ts:Date.now()});
  res.json({success:true,token,username});
});
app.post('/api/admin/logout',adminAuth,(req,res)=>{ adminSessions.delete(req.headers['x-admin-token']); res.json({success:true}); });

app.get('/api/admin/overview',adminAuth,(req,res)=>res.json({
  stats:{ totalDeploys:Object.keys(deploys).length, totalPairs:statsData.pairCount, totalUsers:statsData.totalUsers, uptime:Math.floor((Date.now()-START_TIME)/1000) },
  currentDeploy: deploys[DEPLOY_ID], servers, platform:detectPlatform(),
  adminUser:req.adminSession.user, botVersion:'9.0.0', nodeVersion:process.version, memUsage:process.memoryUsage(), activeConnections:activeConnections.size,
}));

app.get('/api/admin/deploys',adminAuth,(req,res)=>res.json({deploys:Object.values(deploys)}));
app.delete('/api/admin/deploys/:id',adminAuth,(req,res)=>{
  const id=req.params.id.toUpperCase();
  if(id===DEPLOY_ID)return res.status(400).json({error:'Cannot remove current deploy'});
  if(!deploys[id])return res.status(404).json({error:'Not found'});
  delete deploys[id];saveDeploys();res.json({success:true});
});

app.get('/api/admin/servers',adminAuth,(req,res)=>res.json({servers}));
app.post('/api/admin/servers',adminAuth,(req,res)=>{
  const{name,url,platform,description}=req.body;
  if(!name||!url)return res.status(400).json({error:'Name and URL required'});
  const srv={id:crypto.randomBytes(4).toString('hex'),name,url,platform:platform||'Unknown',description:description||'',addedAt:new Date().toISOString()};
  servers.push(srv);saveServers();res.json({success:true,server:srv});
});
app.delete('/api/admin/servers/:id',adminAuth,(req,res)=>{
  const i=servers.findIndex(s=>s.id===req.params.id);
  if(i===-1)return res.status(404).json({error:'Not found'});
  servers.splice(i,1);saveServers();res.json({success:true});
});

app.get('/api/admin/bot/status',adminAuth,(req,res)=>res.json(getStats()));
app.post('/api/admin/bot/restart',adminAuth,(req,res)=>{ res.json({success:true}); setTimeout(()=>process.exit(0),800); });
app.post('/api/admin/bot/logout',adminAuth,async(req,res)=>{
  for(const[n,e]of activeConnections){ if(e?.conn){try{e.conn.ev.removeAllListeners();e.conn.ws?.terminate();}catch{}} destroyPresenceManager(n); try{fs.rmSync(path.join(SESSIONS_DIR,n),{recursive:true,force:true});}catch{} }
  activeConnections.clear(); broadcastStats(); io.emit('botStatus',{connected:false,number:''});
  res.json({success:true});
});
app.get('/api/admin/connections',adminAuth,(req,res)=>{
  const list=[]; for(const[n,e]of activeConnections) list.push({number:'+'+n,connected:e.connected});
  res.json({connections:list});
});
app.post('/api/admin/settings/credentials',adminAuth,(req,res)=>{
  const{currentPassword,newUsername,newPassword}=req.body;
  if(currentPassword!==adminPassword)return res.status(403).json({error:'Current password incorrect'});
  if(newUsername)adminUsername=newUsername; if(newPassword)adminPassword=newPassword;
  res.json({success:true,message:'Updated'});
});

// ── SOCKET.IO ─────────────────────────────────────────────────
io.on('connection', socket => {
  const st=getStats();
  socket.emit('statsUpdate',{activeSockets:st.activeSockets,totalUsers:st.totalUsers,pairCount:st.pairCount});
  socket.emit('botStatus',{connected:st.connected,number:st.botNumber,deployId:DEPLOY_ID,platform:detectPlatform()});
  socket.on('disconnect',()=>{});
});

// ── GRACEFUL SHUTDOWN ─────────────────────────────────────────
let isShuttingDown=false;
const gracefulShutdown=sig=>{
  if(isShuttingDown)return; isShuttingDown=true;
  console.log(`\n🛑 ${sig} — preserving all sessions`);
  saveStats();
  activeConnections.forEach((e,num)=>{ destroyPresenceManager(num); try{e.conn.ws?.terminate();}catch{} });
  setTimeout(()=>process.exit(0),3000);
};
process.on('SIGINT',()=>gracefulShutdown('SIGINT'));
process.on('SIGTERM',()=>gracefulShutdown('SIGTERM'));
process.on('uncaughtException',err=>console.error('uncaughtException:',err.message));
process.on('unhandledRejection',err=>console.error('unhandledRejection:',err));

// ── KEEP-ALIVE ────────────────────────────────────────────────
function startKeepAlive() {
  // ✅ FIX: Render auto-injects RENDER_EXTERNAL_URL for every web service,
  // but it wasn't in the detection list — so on Render this always fell
  // through to `null` and the whole keep-alive loop silently never started,
  // which is exactly why the service kept spinning down.
  const rawUrl = process.env.APP_URL
    || process.env.RENDER_EXTERNAL_URL
    || (process.env.HEROKU_APP_DEFAULT_DOMAIN_NAME ? `https://${process.env.HEROKU_APP_DEFAULT_DOMAIN_NAME}` : null)
    || (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : null);
  if (!rawUrl) {
    console.warn('⚠️ Keep-alive disabled: no APP_URL/RENDER_EXTERNAL_URL detected. Set APP_URL manually if pings aren\'t firing.');
    return;
  }
  const ping = () => {
    try {
      const mod = rawUrl.startsWith('https') ? require('https') : require('http');
      mod.get(rawUrl + '/health', res => { console.log(`💓 Keep-alive → ${res.statusCode}`); }).on('error', ()=>{});
    } catch {}
  };
  // ✅ FIX: Render's free tier spins a service down after ~15 min of no
  // inbound HTTP traffic. A 25-min internal timer pings AFTER it's already
  // asleep (and a sleeping process can't run its own setInterval to wake
  // itself back up). 10 min keeps it under that threshold so it never
  // sleeps in the first place.
  setInterval(ping, 10 * 60 * 1000);
  ping(); // fire one immediately on boot too
  console.log(`💓 Keep-alive enabled → ${rawUrl} (every 10 min)`);
  console.log('   NOTE: self-ping only works while the process is awake. If it ever');
  console.log('   does fall asleep, set up a free external monitor (UptimeRobot,');
  console.log(`   cron-job.org, etc.) to GET ${rawUrl}/health every 5-10 min — that`);
  console.log('   is the only thing that can wake a fully-suspended Render instance.');
}

// ── START ─────────────────────────────────────────────────────
server.listen(PORT, async () => {
  console.log(`\n╔════════════════════════════════════════════════════╗`);
  console.log(`║  🔥 REDX MINI MD v9.0.0 — ANTI-BAN EDITION             ║`);
  console.log(`║  🌐 http://localhost:${String(PORT).padEnd(26)}║`);
  console.log(`║  🆔 Deploy ID: ${String(DEPLOY_ID).padEnd(34)}║`);
  console.log(`║  🛡️  Browser:  Ubuntu Chrome (anti-ban)              ║`);
  console.log(`║  🔌 Commands:  ${String(cmdCount+'+ loaded').padEnd(34)}║`);
  console.log(`╚════════════════════════════════════════════════════╝\n`);
  await reloadExistingSessions();
  startKeepAlive();
  if (autoUpdate) autoUpdate.startAutoUpdater(__dirname);
});

async function reloadExistingSessions() {
  console.log('🔄 Checking existing sessions...');

  if (supabaseStore.isEnabled()) {
    try {
      // Skip initTables() RPC (may not exist on all Supabase setups); go straight to query
      const remoteSessions = await supabaseStore.listSessions();
      console.log(`☁️  Supabase has ${remoteSessions.length} remote session(s)`);
      for (const num of remoteSessions) {
        const sessionDir = path.join(SESSIONS_DIR, num);
        const credsPath  = path.join(sessionDir, 'creds.json');
        if (!fs.existsSync(credsPath)) {
          const creds = await supabaseStore.loadSession(num);
          if (creds) {
            fs.mkdirSync(sessionDir, { recursive: true });
            fs.writeFileSync(credsPath, JSON.stringify(creds, null, 2));
            console.log(`☁️  Restored session: ${num} ✅`);
          }
        } else {
          console.log(`📂 Local session already present: ${num}`);
        }
      }
    } catch (e) {
      console.error('[SUPABASE] Session restore error:', e.message);
      console.warn('⚠️  Sessions will NOT persist across Render restarts without Supabase.');
    }
  } else {
    console.warn('⚠️  Supabase NOT configured (no SUPABASE_URL/SUPABASE_KEY).');
    console.warn('   Sessions WILL be lost when Render restarts/redeploys.');
    console.warn('   → See SUPABASE_SETUP.sql and add env vars to fix this.');
  }

  if (!fs.existsSync(SESSIONS_DIR)) return;
  const dirs = fs.readdirSync(SESSIONS_DIR).filter(d => {
    try { return fs.statSync(path.join(SESSIONS_DIR,d)).isDirectory(); } catch { return false; }
  });
  console.log(`📂 Found ${dirs.length} local session(s)`);

  // ✅ ANTI-BAN: Stagger session reloads — don't connect all at once
  for (let i = 0; i < dirs.length; i++) {
    const num = dirs[i];
    if (fs.existsSync(path.join(SESSIONS_DIR,num,'creds.json'))) {
      console.log(`🔄 Reloading: ${num}`);
      try { await initConnection(num); } catch(e){ console.error(`Reload ${num}: ${e.message}`); }
      if (i < dirs.length - 1) await new Promise(r => setTimeout(r, 3000)); // 3s between each
    }
  }
  broadcastStats();
  console.log('✅ Session reload done');
}

function getStats() {
  return {
    connected: [...activeConnections.values()].some(e=>e.connected),
    activeSockets: [...activeConnections.values()].filter(e=>e.connected).length,
    botNumber: (()=>{ for(const[n,e]of activeConnections) if(e.connected) return n; return ''; })(),
    commands: cmdCount+8, totalUsers: statsData.totalUsers, pairCount: statsData.pairCount,
    uptime: Math.floor((Date.now()-START_TIME)/1000), mode: global.BOT_MODE,
    deployId: DEPLOY_ID, platform: detectPlatform(),
    hasSession: (()=>{ try{ return fs.readdirSync(SESSIONS_DIR).some(d=>fs.existsSync(path.join(SESSIONS_DIR,d,'creds.json'))); }catch{return false;} })(),
    botName: deploys[DEPLOY_ID]?.botName || BOT_NAME,
    ownerName: deploys[DEPLOY_ID]?.ownerName || OWNER_NAME,
    prefix: deploys[DEPLOY_ID]?.prefix || PREFIX,
  };
}

module.exports = { app, server, io };

// ── GLOBAL PAIR HELPER ────────────────────────────────────────
global.doPairNumber = async function(num, force = false) {
  const existing = activeConnections.get(num);
  if (existing?.connected && !force) return { alreadyConnected: true, number: num };
  if (existing) {
    try { existing.conn?.ev?.removeAllListeners(); existing.conn?.ws?.terminate(); } catch {}
    destroyPresenceManager(num);
    activeConnections.delete(num);
    await new Promise(r => setTimeout(r, 1500));
  }
  const sessionDir = path.join(SESSIONS_DIR, num);
  if (force && fs.existsSync(sessionDir)) { try { fs.rmSync(sessionDir, { recursive: true, force: true }); } catch {} }
  if (!fs.existsSync(sessionDir)) fs.mkdirSync(sessionDir, { recursive: true });
  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
  const { version }          = await fetchLatestBaileysVersion();
  const conn = makeWASocket({ version, ...buildSocketConfig(state), msgRetryCounterCache: new NodeCache({ stdTTL: 60 }) });
  activeConnections.set(num, { conn, saveCreds, connected: false, hasWelcomed: false, reconnectAttempts: 0 });
  setupHandlers(conn, num, saveCreds);
  await new Promise(r => setTimeout(r, 4000));
  if (!conn.ws || conn.ws.readyState > 1) throw new Error('WebSocket closed. Please try again.');
  const rawCode = await conn.requestPairingCode(num);
  const code = (rawCode || '').toString().trim();
  if (!code) throw new Error('Empty pairing code. Please try again.');
  return { pairingCode: code.match(/.{1,4}/g)?.join('-') || code, number: num };
};
