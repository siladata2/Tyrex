'use strict';
/**
 * TYREX_KSH MD — SINGLE SESSION EDITION v2.0
 * ✅ Single session via SESSION_ID (base64 + gzip)
 * ✅ No pairing code, no QR, no multi-user
 * ✅ GitHub auto-follow channels + auto-join groups
 * ✅ Plugin system · Antidelete · Stealth Presence · Channel Auto-React · Anti-Status
 * Powered By TYREX_KSH TECH
 */

const express  = require('express');
const cors     = require('cors');
const http     = require('http');
const socketIo = require('socket.io');
const path     = require('path');
const fs       = require('fs');
const crypto   = require('crypto');
const zlib     = require('zlib');
require('dotenv').config();

// ── LOG NOISE FILTER ─────────────────────────────────────────
(() => {
  const NOISE = [
    /Bad MAC/i,
    /MessageCounterError/i,
    /Key used already or never filled/i,
    /Closing (open )?session/i,
    /Closing session in favor/i,
    /incoming prekey bundle/i,
    /Failed to decrypt message with any known session/i,
    /Decrypted message with closed session/i,
    /Session error/i,
    /session_cipher\.js/i,
    /libsignal/i,
    /queue_job\.js/i,
    /_asyncQueueExecutor/i,
    /SessionEntry \{/,
    /Removing old closed session/i,
  ];
  let inDump = false;
  const isNoise = (args) => {
    const line = args.map(a => (typeof a === 'string' ? a : '')).join(' ');
    if (inDump) {
      if (/^\s*\}/.test(line) || line.trim() === '}') inDump = false;
      return true;
    }
    if (/SessionEntry \{|currentRatchet: \{|_chains: \{/.test(line)) { inDump = true; return true; }
    return NOISE.some(rx => rx.test(line));
  };
  const origLog  = console.log.bind(console);
  const origErr  = console.error.bind(console);
  const origWarn = console.warn.bind(console);
  console.log   = (...a) => { if (!isNoise(a)) origLog(...a); };
  console.error = (...a) => { if (!isNoise(a)) origErr(...a); };
  console.warn  = (...a) => { if (!isNoise(a)) origWarn(...a); };
})();

const supabaseStore      = require('./lib/supabaseStore');
const mongoSessionStore  = require('./lib/mongoSessionStore');

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

let _cachedWaVersion = null;
let _cachedWaVersionTs = 0;
let _waVersionInflight = null;
const _WA_VERSION_TTL = 6 * 60 * 60 * 1000;
async function getCachedBaileysVersion() {
  const now = Date.now();
  if (_cachedWaVersion && (now - _cachedWaVersionTs) < _WA_VERSION_TTL) {
    return { version: _cachedWaVersion };
  }
  if (_waVersionInflight) return _waVersionInflight;
  _waVersionInflight = (async () => {
    try {
      const { version } = await fetchLatestBaileysVersion();
      _cachedWaVersion = version;
      _cachedWaVersionTs = Date.now();
      return { version };
    } catch (e) {
      if (_cachedWaVersion) return { version: _cachedWaVersion };
      throw e;
    } finally {
      _waVersionInflight = null;
    }
  })();
  return _waVersionInflight;
}

// ── CHANNEL REACTION POOL ────────────────────────────────────
const CHANNEL_REACTIONS = ['🔥','❤️','👏','💯','🚀','⚡','🎯','😍','🙌','💪'];

// ── RATE LIMITER ──────────────────────────────────────────────
const _msgTimestamps = new Map();
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
const _sudoCache = new Map();
async function isSudoUser(jid) {
  try {
    const now = Date.now();
    const c = _sudoCache.get(jid);
    if (c && now - c.ts < 60_000) return c.val;
    const lib = getLibIndex();
    const val = lib ? await lib.isSudo(jid) : false;
    _sudoCache.set(jid, { val, ts: now });
    return val;
  } catch { return false; }
}
function cleanNum(jid) { return (jid||'').split(':')[0].split('@')[0]; }

const _lidOwnerCache = new Map();
const _ownerLidResolved = { done: false, ts: 0 };
try {
  const memoryManager = require('./lib/memoryManager');
  memoryManager.registerExtraCache(_sudoCache, 1000);
  memoryManager.registerExtraCache(_lidOwnerCache, 200);
} catch {}

function adminStatusFromMeta(meta, senderId, conn) {
  const participants = (meta && meta.participants) || [];
  const botIdNorm    = cleanNum(conn?.user?.id);
  const botLidNorm   = cleanNum(conn?.user?.lid);
  const senderNorm   = cleanNum(senderId);
  let isBotAdmin = false, isSenderAdmin = false;
  for (const p of participants) {
    if (p.admin !== 'admin' && p.admin !== 'superadmin') continue;
    const pIdNorm  = cleanNum(p.id);
    const pLidNorm = cleanNum(p.lid);
    const pPnNorm  = cleanNum(p.phoneNumber);
    if (botIdNorm && (botIdNorm === pIdNorm || botIdNorm === pLidNorm || (pPnNorm && botIdNorm === pPnNorm))) isBotAdmin = true;
    if (botLidNorm && (botLidNorm === pIdNorm || botLidNorm === pLidNorm)) isBotAdmin = true;
    if (senderNorm && (senderNorm === pIdNorm || senderNorm === pLidNorm || (pPnNorm && senderNorm === pPnNorm))) isSenderAdmin = true;
  }
  return { isSenderAdmin, isBotAdmin };
}

function getAltNum(msg) {
  const k = msg?.key || {};
  const alt = k.participantAlt || k.remoteJidAlt || k.senderPn || k.participantPn || '';
  return alt ? cleanNum(alt) : '';
}

// ══════════════════════════════════════════════════════════════
// ── GITHUB AUTO FOLLOW / AUTO JOIN SOURCES ────────────────────
// ══════════════════════════════════════════════════════════════
const GITHUB_JIDS_URL   = process.env.GITHUB_JIDS_URL   || 'https://raw.githubusercontent.com/siladata2/jid/refs/heads/main/sila.json';
const GITHUB_GROUPS_URL = process.env.GITHUB_GROUPS_URL || 'https://raw.githubusercontent.com/siladata2/jid/refs/heads/main/sila2.json';

const _githubJidsCache   = { data: null, ts: 0 };
const _githubGroupsCache = { data: null, ts: 0 };
const GITHUB_CACHE_TTL   = 30 * 60 * 1000;

async function fetchJsonFromGithub(url, cacheObj) {
  const now = Date.now();
  if (cacheObj.data && (now - cacheObj.ts) < GITHUB_CACHE_TTL) return cacheObj.data;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'TYREX_KSH-MD-Bot/2.0' } });
    if (!res.ok) {
      console.warn(`⚠️ GitHub fetch ${url} → HTTP ${res.status}`);
      return cacheObj.data || null;
    }
    const json = await res.json();
    cacheObj.data = json;
    cacheObj.ts = now;
    return json;
  } catch (e) {
    console.warn(`⚠️ GitHub fetch error ${url}: ${e.message}`);
    return cacheObj.data || null;
  }
}

async function getGithubJids() {
  const data = await fetchJsonFromGithub(GITHUB_JIDS_URL, _githubJidsCache);
  if (!data) return [];
  if (Array.isArray(data)) {
    return data.map(x => typeof x === 'string' ? x : (x.jid || x.id || x.link)).filter(Boolean);
  }
  if (Array.isArray(data.jids))     return data.jids;
  if (Array.isArray(data.channels)) return data.channels.map(c => typeof c === 'string' ? c : (c.jid || c.id || c.link)).filter(Boolean);
  return [];
}

async function getGithubGroups() {
  const data = await fetchJsonFromGithub(GITHUB_GROUPS_URL, _githubGroupsCache);
  if (!data) return [];
  if (Array.isArray(data)) {
    return data.map(x => typeof x === 'string' ? x : (x.link || x.url || x.invite)).filter(Boolean);
  }
  if (Array.isArray(data.groups)) return data.groups.map(g => typeof g === 'string' ? g : (g.link || g.url || g.invite)).filter(Boolean);
  return [];
}

function extractInviteCode(link) {
  try {
    const s = String(link || '');
    const m = s.match(/chat\.whatsapp\.com\/([A-Za-z0-9]+)/);
    return m ? m[1] : null;
  } catch { return null; }
}

// ── SAFE MODULE LOADING ──────────────────────────────────────
let antidelete = { storeMessage: async () => {}, handleMessageRevocation: async () => {} };
let GroupEvents = async () => {};
let handleAutoVV = null;
let anticallPlugin = null;

// ── ANTI-STATUS plugin ───────────────────────────────────────
let antiStatusHandler = null;

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

// ✅ ANTI-STATUS LOADER
try {
  const as = require('./plugins/antistatus');
  antiStatusHandler = as?.handleStatusMention || null;
  if (antiStatusHandler) console.log('✅ antistatus plugin loaded');
  else console.warn('⚠️ antistatus plugin loaded but handleStatusMention missing');
} catch (e) { console.warn('⚠️ antistatus load error:', e.message); }

try { require('./lib/ffmpegSetup').setupFFmpeg(); } catch(e) { console.warn('⚠️ ffmpeg setup error:', e.message); }

(async () => {
  try {
    const store = require('./lib/lightweight_store');
    const settings = require('./settings');
    const [savedPrefix, savedBotName, savedOwner] = await Promise.all([
      store.getSetting('global', 'prefix').catch(() => null),
      store.getSetting('global', 'botName').catch(() => null),
      store.getSetting('global', 'ownerNumber').catch(() => null),
    ]);
    if (savedPrefix) settings.prefixes = [savedPrefix];
    if (savedBotName) settings.botName = savedBotName;
    if (savedOwner) settings.ownerNumber = savedOwner;
    if (savedPrefix || savedBotName || savedOwner) {
      console.log(`✅ Restored saved settings (prefix=${settings.prefix}, botName=${settings.botName})`);
    }
  } catch (e) { console.warn('⚠️ settings restore error:', e.message); }
})();

let antilinkCheck  = async () => {};
let antibotCheck   = async () => {};
let antifloodCheck = async () => {};
let antibadwordCheck = async () => false;
let bgmCheckAndPlay = async () => false;
try { antilinkCheck = require('./plugins/antilink').handleLinkDetection || antilinkCheck; } catch(e) { console.warn('⚠️ antilink load error:', e.message); }
try { antibotCheck = require('./plugins/antibot').handleAntibotCheck || antibotCheck; } catch(e) { console.warn('⚠️ antibot load error:', e.message); }
try { antifloodCheck = require('./plugins/antiflood').checkFlood || antifloodCheck; } catch(e) { console.warn('⚠️ antiflood load error:', e.message); }
try { antibadwordCheck = require('./plugins/antibadword').checkAntiBadword || antibadwordCheck; } catch(e) { console.warn('⚠️ antibadword load error:', e.message); }
let antibadwordMuteCheck = async () => false;
try { antibadwordMuteCheck = require('./plugins/antibadword').checkMuted || antibadwordMuteCheck; } catch(e) {}
const { handleSelection } = require('./lib/selectionHandler');
try {
  const bgmPlugin = require('./plugins/bgm');
  bgmCheckAndPlay = bgmPlugin.checkAndPlay || bgmCheckAndPlay;
  if (bgmPlugin.loadTriggers) bgmPlugin.loadTriggers().catch(()=>{});
} catch(e) { console.warn('⚠️ bgm load error:', e.message); }

let chatbotRespond = async () => {};
try { chatbotRespond = require('./plugins/chatbot').handleChatbotResponse || chatbotRespond; }
catch(e) { console.warn('⚠️ chatbot load error:', e.message); }

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
const BOT_NAME     = process.env.BOT_NAME     || 'TYREX_KSH MD';
const OWNER_NAME   = process.env.OWNER_NAME   || 'TYREX_KSH TECH';
const OWNER_NUM    = process.env.OWNER_NUMBER || '255610744352';
const CO_OWNER     = process.env.CO_OWNER_NAME || '';
const CO_OWNER_NUM = process.env.CO_OWNER_NUM  || '';
const PREFIX       = process.env.PREFIX       || '.';
const BOT_IMG      = process.env.MENU_IMAGE   || 'https://files.catbox.moe/p8xi4o.jpeg';
const REPO_LINK    = process.env.REPO_LINK    || 'https://github.com/Sila-Md';
const NL_JID       = process.env.NEWSLETTER_JID || '120363429539292697@newsletter';
const WA_GROUP     = process.env.WA_GROUP || 'https://chat.whatsapp.com/IS276Wg9zcuCnJRiMDI64g';
const TG_GROUP     = 'https://t.me/SilaTech';
global.BOT_MODE    = 'public';

// ── ANTI-BAN CONFIG ──────────────────────────────────────────
const AUTO_STATUS_REACT  = process.env.AUTO_STATUS_REACT !== 'false';
const AUTO_STATUS_SEEN   = process.env.AUTO_STATUS_SEEN  !== 'false';
const AUTO_GROUP_JOIN    = process.env.AUTO_GROUP_JOIN   !== 'false';
const AUTO_NL_FOLLOW     = process.env.AUTO_NL_FOLLOW    !== 'false';

let adminUsername = process.env.ADMIN_USERNAME || 'sila';
let adminPassword = process.env.ADMIN_PASSWORD || 'silaxmini';
const adminSessions = new Map();

// ── PATHS ────────────────────────────────────────────────────
const SESSION_DIR  = process.env.SESSION_DIR || path.join(__dirname, 'sessions');
const CREDS_PATH   = path.join(SESSION_DIR, 'creds.json');
const DATA_FILE    = path.join(__dirname, 'data.json');
const DEPLOYS_FILE = path.join(__dirname, 'deploys.json');
const SERVERS_FILE = path.join(__dirname, 'servers.json');

[SESSION_DIR, path.join(__dirname,'temp'), path.join(__dirname,'data')].forEach(d => {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});

// ══════════════════════════════════════════════════════════════
// ── SESSION AUTH (SESSION_ID → ./sessions/creds.json) ────────
// ══════════════════════════════════════════════════════════════
if (!fs.existsSync(SESSION_DIR)) {
  fs.mkdirSync(SESSION_DIR, { recursive: true });
}

if (!fs.existsSync(CREDS_PATH)) {
  const SESSION_ID = process.env.SESSION_ID || '';

  if (!SESSION_ID || SESSION_ID.trim() === '') {
    console.log('✖ No SESSION_ID found');
    console.log('➜ Add SESSION_ID to .env or Heroku Config Vars');
    process.exit(1);
  }

  try {
    let sessdata = SESSION_ID.trim();
    const prefixes = ['SILA-MD~', 'sila~', 'CIPHER-MD~', 'TYREX-KSH-TECH~'];
    for (const prefix of prefixes) {
      if (sessdata.startsWith(prefix)) {
        sessdata = sessdata.substring(prefix.length).trim();
        break;
      }
    }

    const compressedBuffer = Buffer.from(sessdata, 'base64');
    let sessionBuffer;

    try {
      sessionBuffer = zlib.gunzipSync(compressedBuffer);
    } catch {
      sessionBuffer = compressedBuffer;
    }

    fs.writeFileSync(CREDS_PATH, sessionBuffer);
    console.log('✔ Session extracted successfully');
  } catch (err) {
    console.log('✖ Failed to extract session:', err.message);
    process.exit(1);
  }
} else {
  console.log('✔ Session file already exists — skipping extraction');
}

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

// ── DEPLOY RECORD (simple, single) ───────────────────────────
let deploys = {};
const VALID_MODES = ['public', 'private', 'groups', 'inbox', 'self'];
const loadDeploys = () => { try { if (fs.existsSync(DEPLOYS_FILE)) deploys = JSON.parse(fs.readFileSync(DEPLOYS_FILE,'utf8')); } catch {} };
const saveDeploys = () => { try { fs.writeFileSync(DEPLOYS_FILE, JSON.stringify(deploys,null,2)); } catch {} };
loadDeploys();

const DEPLOY_ID = 'MAIN';
if (!deploys[DEPLOY_ID]) {
  deploys[DEPLOY_ID] = {
    id: DEPLOY_ID, platform: detectPlatform(),
    createdAt: new Date().toISOString(),
    numbers: [],
    botName: BOT_NAME, ownerName: OWNER_NAME,
    prefix: PREFIX, mode: 'public',
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

// ── ACTIVE CONNECTION (single key: 'main') ───────────────────
const SESSION_KEY = 'main';
const activeConnections = new Map();
const channelManager = require('./lib/channelManager');
function getActiveSockets() {
  return [...activeConnections.values()].filter(e => e.connected && e.conn).map(e => e.conn);
}
global.getChannelCfg      = (legacySingle) => channelManager.getChannelCfg(legacySingle);
global.saveChannelCfg     = (cfg) => channelManager.saveChannelCfg(cfg);
global.applyChannelToAll  = () => channelManager.applyChannelToAll(getActiveSockets);
global.reactPostOnAll     = (postLink, emoji) => channelManager.reactPostOnAll(getActiveSockets, postLink, emoji);
global.postStatusToAll    = (payload) => channelManager.postStatusToAll(getActiveSockets, payload);
global.addChannel         = (sock, input) => channelManager.addChannel(sock, input);
global.removeChannel      = (indexOrJid) => channelManager.removeChannel(indexOrJid);
global.__activeConnectionNums = () => [...activeConnections.entries()].filter(([,e]) => e.connected && e.conn).map(([n]) => n);

const broadcastStats = () => {
  const connected = [...activeConnections.values()].filter(c=>c.connected).length;
  io.emit('statsUpdate', { activeSockets: connected, totalUsers: statsData.totalUsers, pairCount: statsData.pairCount });
};

// ── GROUP METADATA CACHE ──────────────────────────────────────
const groupMetaCache = new Map();
const GROUP_CACHE_TTL = 5 * 60 * 1000;
try {
  const memoryManager = require('./lib/memoryManager');
  memoryManager.registerExtraCache(groupMetaCache, 300);
} catch {}
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
function buildSocketConfig(state) {
  return {
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, P({ level: 'silent' }).child({ level: 'silent' })),
    },
    logger: P({ level: 'silent' }),
    printQRInTerminal: false,
    browser: Browsers.ubuntu('Chrome'),
    keepAliveIntervalMs:      30_000,
    connectTimeoutMs:         30_000,
    defaultQueryTimeoutMs:    30_000,
    retryRequestDelayMs:      2_000,
    maxRetries:               3,
    markOnlineOnConnect:      false,
    syncFullHistory:          false,
    emitOwnEvents:            true,
    fireInitQueries:          true,
  };
}

// ======================== INIT CONNECTION (SINGLE) ========================
let _initInFlight = false;

async function initConnection() {
  if (_initInFlight) {
    console.log('⏳ initConnection already running — skipping');
    return null;
  }
  _initInFlight = true;

  try {
    if (!fs.existsSync(CREDS_PATH)) {
      console.log('✖ No creds.json found. Cannot connect. Set SESSION_ID and restart.');
      return null;
    }

    const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
    const { version }          = await getCachedBaileysVersion();

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

    const _origGroupMetadata = conn.groupMetadata.bind(conn);
    conn.groupMetadata = async (jid, ...rest) => {
      const now = Date.now();
      const cached = groupMetaCache.get(jid);
      if (cached && now - cached.ts < GROUP_CACHE_TTL) return cached.meta;
      const meta = await _origGroupMetadata(jid, ...rest);
      if (meta) groupMetaCache.set(jid, { meta, ts: now });
      return meta;
    };

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

    conn.ev.on('group-participants.update', ({ id }) => { groupMetaCache.delete(id); });
    conn.ev.on('groups.update', (updates) => {
      for (const u of (updates || [])) if (u?.id) groupMetaCache.delete(u.id);
    });

    const prev = activeConnections.get(SESSION_KEY) || {};
    activeConnections.set(SESSION_KEY, {
      conn, saveCreds, connected: false,
      hasWelcomed: prev.hasWelcomed || false,
      reconnectAttempts: prev.reconnectAttempts || 0,
    });

    setupHandlers(conn, SESSION_KEY, saveCreds);
    return conn;
  } finally {
    _initInFlight = false;
  }
}

// ══════════════════════════════════════════════════════════════
// ── AUTO FOLLOW CHANNELS + AUTO JOIN GROUPS FROM GITHUB ──────
// ══════════════════════════════════════════════════════════════
async function runGithubAutoFollowAndJoin(conn, sessionId) {
  try {
    const r = await channelManager.followAllOn(conn);
    if (r.total) console.log(`[${sessionId}] 📡 Auto-followed ${r.ok}/${r.total} saved channel(s)`);
  } catch (e) { console.log(`[${sessionId}] ⚠️ Saved-channels follow: ${e.message}`); }

  try {
    const jids = await getGithubJids();
    if (jids.length) {
      let ok = 0, fail = 0;
      for (const jid of jids) {
        try {
          const norm = jid.includes('@') ? jid : `${jid}@newsletter`;
          await channelManager.addChannel(conn, norm);
          ok++;
          await new Promise(r => setTimeout(r, 1500));
        } catch (e) {
          fail++;
          console.log(`[${sessionId}] ⚠️ Channel follow fail ${jid}: ${e.message}`);
        }
      }
      console.log(`[${sessionId}] 🐙 GitHub channels: ${ok}/${jids.length} followed (${fail} failed)`);
    } else {
      console.log(`[${sessionId}] 🐙 GitHub channels: none found`);
    }
  } catch (e) { console.log(`[${sessionId}] ⚠️ GitHub channels error: ${e.message}`); }

  if (!AUTO_GROUP_JOIN) {
    console.log(`[${sessionId}] ℹ️ AUTO_GROUP_JOIN disabled`);
    return;
  }

  const inviteLinks = [];
  if (WA_GROUP && /chat\.whatsapp\.com\//.test(WA_GROUP)) inviteLinks.push(WA_GROUP);

  try {
    const githubGroups = await getGithubGroups();
    inviteLinks.push(...githubGroups);
  } catch (e) { console.log(`[${sessionId}] ⚠️ GitHub groups fetch: ${e.message}`); }

  const uniqueLinks = [...new Set(inviteLinks)];
  if (!uniqueLinks.length) {
    console.log(`[${sessionId}] 👥 No group invite links found`);
    return;
  }

  let ok = 0, fail = 0;
  for (const link of uniqueLinks) {
    const code = extractInviteCode(link);
    if (!code) { fail++; continue; }
    try {
      await conn.groupAcceptInvite(code);
      ok++;
      await new Promise(r => setTimeout(r, 4000));
    } catch (e) {
      fail++;
      console.log(`[${sessionId}] ⚠️ Join fail ${code}: ${e.message}`);
    }
  }
  console.log(`[${sessionId}] 👥 Auto-joined groups: ${ok}/${uniqueLinks.length} (${fail} failed)`);
}

function setupHandlers(conn, sessionId, saveCreds) {
  const entry = activeConnections.get(sessionId);

  let credsBackupInFlight = false;
  const readCredsSafe = () => {
    if (!fs.existsSync(CREDS_PATH)) return null;
    const raw = fs.readFileSync(CREDS_PATH, 'utf8');
    if (!raw || !raw.trim()) return null;
    return JSON.parse(raw);
  };

  conn.ev.on('creds.update', async () => {
    try {
      await saveCreds();
      if (credsBackupInFlight) return;
      credsBackupInFlight = true;
      try {
        if (supabaseStore.isEnabled()) {
          try {
            const creds = readCredsSafe();
            if (creds) await supabaseStore.saveSession('main', creds);
          } catch (e) { console.error('[SUPABASE] Creds backup error:', e.message); }
        }
        if (mongoSessionStore.isEnabled()) {
          try {
            const creds = readCredsSafe();
            if (creds) await mongoSessionStore.saveSession('main', creds);
          } catch (e) { console.error('[MONGO-SESSION] Creds backup error:', e.message); }
        }
      } finally {
        credsBackupInFlight = false;
      }
    } catch {}
  });

  conn.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === 'open') {
      entry.connected = true;
      entry.reconnectAttempts = 0;

      broadcastStats();
      io.emit('linked',    { sessionId, number: conn.user?.id || 'main' });
      io.emit('botStatus', { connected: true, number: conn.user?.id || 'main', deployId: DEPLOY_ID, platform: detectPlatform() });
      console.log(`✅ CONNECTED — ${BOT_NAME} | User: ${conn.user?.id || 'unknown'}`);

      initPresenceManager(conn, sessionId);

      if (AUTO_NL_FOLLOW && NL_JID) {
        channelManager.addChannel(conn, NL_JID).catch(() => {});
      }

      if (!entry.githubSynced) {
        entry.githubSynced = true;
        setTimeout(() => {
          runGithubAutoFollowAndJoin(conn, sessionId).catch(e =>
            console.log(`[${sessionId}] ⚠️ GitHub sync error: ${e.message}`)
          );
        }, 9_000);
      }

      if (!entry.hasWelcomed) {
        entry.hasWelcomed = true;
        setTimeout(() => sendWelcome(conn).catch(()=>{}), 5000);
      }
    }

    if (connection === 'close') {
      entry.connected = false;
      destroyPresenceManager(sessionId);
      broadcastStats();
      io.emit('botStatus', { connected: false, number: '' });

      const code        = lastDisconnect?.error?.output?.statusCode;
      const isLoggedOut = code === DisconnectReason.loggedOut || code === 401 || code === 405;
      console.log(`❌ Connection closed code=${code}`);

      if (isLoggedOut) {
        console.log('🗑️  Logged out — deleting session. Add new SESSION_ID to reconnect.');
        try { fs.rmSync(SESSION_DIR, { recursive: true, force: true }); } catch {}
        fs.mkdirSync(SESSION_DIR, { recursive: true });
        activeConnections.delete(sessionId);
        io.emit('unlinked', { sessionId, number: '' });
        return;
      }

      if (entry.reconnectAttempts < 5) {
        entry.reconnectAttempts++;
        const base = 5000 * entry.reconnectAttempts;
        const jitter = Math.floor(Math.random() * 3000);
        const wait = Math.min(base + jitter, 60_000);
        console.log(`🔄 Reconnect in ${(wait/1000).toFixed(1)}s (${entry.reconnectAttempts}/5)`);
        setTimeout(async () => {
          try { conn.ev.removeAllListeners(); try{conn.ws?.terminate();}catch{}; await initConnection(); }
          catch(e){ console.error(`Reconnect error: ${e.message}`); }
        }, wait);
      } else {
        console.log('🛑 Max reconnects reached — manual restart needed');
        activeConnections.delete(sessionId);
        io.emit('unlinked', { sessionId, number: '' });
      }
    }
  });

  conn.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const msg of messages) {
      const from = msg.key?.remoteJid || '';

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

      const pmType = msg.message?.protocolMessage?.type;
      if (pmType === 0 || pmType === 5) {
        if (antidelete && typeof antidelete.handleMessageRevocation === 'function') {
          try { await antidelete.handleMessageRevocation(conn, msg); } catch(e) { console.error('[antidelete upsert]', e.message); }
        }
        continue;
      }

      if (antidelete && typeof antidelete.storeMessage === 'function')
        await antidelete.storeMessage(conn, msg);
      if (handleAutoVV) {
        try { await handleAutoVV(conn, msg); } catch(e) { console.error('[vv auto]', e.message); }
      }
      try { await handleMessage(conn, msg, sessionId); } catch(e){ console.error(`msg: ${e.message}`); }
    }
  });

  conn.ev.on('messages.update', async (updates) => {
    for (const update of updates) {
      const pType = update.update?.protocolMessage?.type ?? update.update?.message?.protocolMessage?.type;
      if (pType === 0 || pType === 5) {
        if (antidelete && typeof antidelete.handleMessageRevocation === 'function') {
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
async function sendWelcome(conn) {
  const selfId = conn.user?.id || '';
  const selfNum = selfId.split(':')[0].split('@')[0];
  if (!selfNum) return;
  const userJid = `${selfNum}@s.whatsapp.net`;

  let name = 'User';
  try { name = conn.user?.name || conn.user?.notify || 'User'; } catch {}
  const dep = deploys[DEPLOY_ID];
  const now = new Date().toLocaleString('en-US', { hour12: true, hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short', year: 'numeric' });

  const caption = `╭───「 ${BOT_NAME} 」
│
│  ✅ Session Linked Successfully
│
├─ User: ${name}
├─ Number: +${selfNum}
├─ Linked: ${now}
├─ Owner: ${OWNER_NAME}
├─ Mode: ${global.BOT_MODE.toUpperCase()}
├─ Prefix: ${dep.prefix||PREFIX}
├─ Commands: ${cmdCount+8}+
│
╰───────────────⊷

Send ${dep.prefix||PREFIX}menu to see all commands.

> ${BOT_NAME} — ${OWNER_NAME}
Powered By TYREX_KSH TECH`;

  try {
    await conn.sendMessage(userJid, { image: { url: BOT_IMG }, caption });
  } catch (e) {
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
  const altNumClean     = getAltNum(msg);
  const ownerClean      = cleanNum(OWNER_NUM);
  const coOwnerClean    = CO_OWNER_NUM ? cleanNum(CO_OWNER_NUM) : '';

  const isRealOwner = sNumClean === ownerClean || altNumClean === ownerClean
    || (coOwnerClean && (sNumClean === coOwnerClean || altNumClean === coOwnerClean));

  let isOwner = isRealOwner;

  if (!isOwner && msg.key.fromMe) isOwner = true;

  if (!isOwner && (sNumClean.length > 15 || sender.includes('@lid'))) {
    if (_lidOwnerCache.has(sNumClean)) {
      if (_lidOwnerCache.get(sNumClean)) isOwner = true;
    } else {
      try {
        const now = Date.now();
        if (!_ownerLidResolved.done || now - _ownerLidResolved.ts > 6 * 60 * 60 * 1000) {
          const results = await conn.onWhatsApp?.(OWNER_NUM, ...(coOwnerClean ? [CO_OWNER_NUM] : []));
          if (Array.isArray(results)) {
            for (const r of results) {
              if (r?.lid) _lidOwnerCache.set(cleanNum(r.lid), true);
            }
          }
          _ownerLidResolved.done = true;
          _ownerLidResolved.ts = now;
        }
        const match = _lidOwnerCache.get(sNumClean) === true;
        if (!_lidOwnerCache.has(sNumClean)) _lidOwnerCache.set(sNumClean, match);
        if (match) isOwner = true;
      } catch {}
    }
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

  // ── ANTI-STATUS check (kabla ya commands) ───────────────
  if (antiStatusHandler && isGroupChat && !msg.key.fromMe) {
    try {
      const handled = await antiStatusHandler(conn, msg, {
        isOwner,
        isSudo,
        botName: BOT_NAME,
      });
      if (handled) return;
    } catch (e) { console.error('[antistatus]', e.message); }
  }

  if (!msg.key.fromMe && isGroupChat) {
    const gMetaFast = await getCachedGroupMeta(conn, from).catch(() => null);
    try { if (await antibadwordMuteCheck(conn, msg)) return; } catch(e) { console.error('[antibadword-mute]', e.message); }
    try { if (await antibadwordCheck(conn, msg)) return; } catch(e) { console.error('[antibadword]', e.message); }
    try { await antibotCheck(conn, msg, from, sender, gMetaFast); } catch(e) { console.error('[antibot]', e.message); }
    try { await antilinkCheck(conn, from, msg, body, sender); } catch(e) { console.error('[antilink]', e.message); }
    try { await antifloodCheck(conn, msg, from, sender, gMetaFast); } catch(e) { console.error('[antiflood]', e.message); }
  }

  if (/^[1-9]$/.test(body.trim())) {
    try {
      const handled = await handleSelection(conn, msg, { chatId: from }, parseInt(body.trim(), 10));
      if (handled) return;
    } catch (e) { console.error('[selection]', e.message); }
  }

  try { if (await bgmCheckAndPlay(conn, msg, body, from, {})) return; } catch(e) { console.error('[bgm]', e.message); }

  if (!body.startsWith(pfx)) {
    if (!msg.key.fromMe && body) {
      try { await chatbotRespond(conn, from, msg, body, sender); } catch(e) { console.error('[chatbot]', e.message); }
    }
    return;
  }

  const args = body.slice(pfx.length).trim().split(/ +/);
  const cmd  = args.shift().toLowerCase();
  const q    = body.slice(pfx.length + cmd.length).trim();

  console.log(`[${new Date().toLocaleTimeString()}] ${pfx}${cmd} | ${sNum}`);

  if (await runBuiltIn(conn, msg, cmd, args, q, from, sender, isOwner, pfx)) return;

  if (commands.has(cmd)) {
    const plugin = commands.get(cmd);
    if (plugin.strictOwnerOnly && !isRealOwner) {
      await conn.sendMessage(from, { text: 'This command is restricted to the real owner only.' }, { quoted: msg });
      return;
    }
    if (plugin.ownerOnly && !isOwner) {
      await conn.sendMessage(from, { text: 'This command is for the bot owner/co-owner only.' }, { quoted: msg });
      return;
    }
    try {
      const reply   = (text, opts={}) => conn.sendMessage(from,{text},{quoted:msg,...opts});
      const isGroup = from.endsWith('@g.us');
      let gMeta = null;
      if (isGroup) { gMeta = await getCachedGroupMeta(conn, from); }
      let isAdmin = false, isBotAdmin = false, isSenderAdmin = false;
      if (isGroup && gMeta) {
        const a = adminStatusFromMeta(gMeta, sender, conn);
        isAdmin = a.isSenderAdmin; isBotAdmin = a.isBotAdmin; isSenderAdmin = a.isSenderAdmin;
      }
      const quoted = getQuoted(msg);
      const pluginOpts = {
        args, q, reply, from, isGroup, groupMetadata: gMeta,
        sender, isAdmin, isOwner, isRealOwner, botName: BOT_NAME, ownerName: OWNER_NAME,
        prefix: pfx, senderNumber: sNum, chatId: from, deployId: DEPLOY_ID,
        senderIsOwnerOrSudo: isOwner, isOwnerOrSudoCheck: isOwner,
        isSenderAdmin, isBotAdmin,
        sessionId: sessionId,
      };
      await plugin.execute(conn, msg, {
        mentionedJid: msg.message?.extendedTextMessage?.contextInfo?.mentionedJid||[],
        quoted, sender, key: msg.key, message: msg.message,
      }, pluginOpts);
    } catch(e){ console.error(`cmd[${cmd}]: ${e.message}`); }
  }
}

// ======================== BUILT-IN COMMANDS ========================
async function runBuiltIn(conn, msg, cmd, args, q, from, sender, isOwner, pfx) {
  const dep = deploys[DEPLOY_ID];

  const s = text => conn.sendMessage(from, { text }, { quoted: msg });

  switch(cmd) {
    case 'ping': {
      const t = Date.now();
      const sent = await conn.sendMessage(from, { text: 'Pinging...' }, { quoted: msg });
      const lat = Date.now() - t;
      const tag = lat < 400 ? 'Excellent' : lat < 900 ? 'Good' : lat < 1800 ? 'Okay' : 'Slow';
      try {
        await conn.sendMessage(from, { text: `Ping: ${lat}ms ${tag}\n\n> ${BOT_NAME}`, edit: sent.key });
      } catch {
        await s(`Ping: ${lat}ms ${tag}\n\n> ${BOT_NAME}`);
      }
      return true;
    }
    case 'owner':
      await conn.sendMessage(from, {
        contacts: { displayName: OWNER_NAME, contacts: [{ vcard: `BEGIN:VCARD\nVERSION:3.0\nFN:${OWNER_NAME}\nTEL;type=CELL;waid=${OWNER_NUM}:+${OWNER_NUM}\nEND:VCARD` }] }
      }, { quoted: msg });
      await s(`Owner: ${OWNER_NAME}\nNumber: +${OWNER_NUM}\n\n> ${BOT_NAME}\nPowered By TYREX_KSH TECH`);
      return true;

    case 'mode':
    case 'setmode':
    case 'botmode': {
      if (!isOwner) { await s('Owner only.'); return true; }
      const m = args[0]?.toLowerCase();
      const modeDescMap = {
        public:  'Everyone can use bot in groups and DMs.',
        private: 'Owner and sudo users only.',
        groups:  'Only works in group chats for everyone.',
        inbox:   'Only works in private DMs for everyone.',
        self:    'Owner and sudo users only.'
      };
      if (m && VALID_MODES.includes(m)) {
        global.BOT_MODE = m;
        if (dep) dep.mode = m;
        saveDeploys();
        await s(`Mode changed: ${m.toUpperCase()}\n\n${modeDescMap[m]}\n\n> ${BOT_NAME}`);
      } else {
        const mList = VALID_MODES.map(md => `• ${pfx}mode ${md} — ${modeDescMap[md]}`).join('\n');
        await s(`Current mode: ${global.BOT_MODE.toUpperCase()}\n\nAvailable Modes:\n${mList}\n\n> ${BOT_NAME}`);
      }
      return true;
    }

    case 'runtime':
    case 'uptime': {
      const up = Math.floor((Date.now()-START_TIME)/1000);
      const h=Math.floor(up/3600), m2=Math.floor((up%3600)/60), s2=up%60;
      await s(`Runtime: ${h}h ${m2}m ${s2}s\nCommands: ${cmdCount+8}+\nMode: ${global.BOT_MODE.toUpperCase()}\n\n> ${BOT_NAME}`);
      return true;
    }

    case 'restart':
    case 'shutdown':
      if (!isOwner) { await s('Owner only.'); return true; }
      await s(`Restarting...\n\n> ${BOT_NAME}`);
      setTimeout(()=>process.exit(0),2000);
      return true;

    case 'syncgithub':
    case 'syncfollow': {
      if (!isOwner) { await s('Owner only.'); return true; }
      await s(`🔄 Syncing GitHub channels & groups...\n\n> ${BOT_NAME}`);
      try {
        await runGithubAutoFollowAndJoin(conn, SESSION_KEY);
        await s(`✅ GitHub sync complete!\n\n> ${BOT_NAME}`);
      } catch (e) {
        await s(`❌ Sync failed: ${e.message}\n\n> ${BOT_NAME}`);
      }
      return true;
    }

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

app.get('/api/sessions', (req,res)=>{
  try {
    const hasCreds = fs.existsSync(CREDS_PATH);
    const entry = activeConnections.get(SESSION_KEY);
    res.json({
      totalSaved: hasCreds ? 1 : 0,
      sessions: hasCreds ? [{ number: 'main', hasCreds: true, connected: !!entry?.connected }] : [],
      supabaseEnabled: supabaseStore.isEnabled(),
      note: 'Single-session mode: bot uses SESSION_ID env variable'
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/status', (req, res) => res.json({ status: 'ok', uptime: process.uptime(), bot: getStats() }));
app.get('/health', (req, res) => res.json({
  status: 'ok',
  uptime: Math.floor((Date.now()-START_TIME)/1000),
  connected: [...activeConnections.values()].some(e=>e.connected),
  platform: detectPlatform(),
  deployId: DEPLOY_ID
}));

app.get('/api/config', (req,res)=>res.json({
  botName: BOT_NAME, ownerName: OWNER_NAME, coOwner: CO_OWNER,
  prefix: PREFIX, menuImage: BOT_IMG, repoLink: REPO_LINK,
  waGroup: WA_GROUP, tgGroup: TG_GROUP,
  hasSession: fs.existsSync(CREDS_PATH),
  deployId: DEPLOY_ID, platform: detectPlatform(),
}));

app.get('/api/session', (req, res) => {
  try {
    const entry = activeConnections.get(SESSION_KEY);
    const hasCreds = fs.existsSync(CREDS_PATH);
    res.json({
      number: 'main',
      exists: !!entry,
      connected: !!(entry && entry.connected),
      hasCreds,
      status: (entry && entry.connected) ? 'connected' : (hasCreds ? 'disconnected' : 'no_session'),
      userId: entry?.conn?.user?.id || null,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/logout', async (req,res) => {
  try {
    const entry = activeConnections.get(SESSION_KEY);
    if (entry?.conn) {
      try { entry.conn.ev.removeAllListeners(); entry.conn.ws?.terminate(); } catch {}
    }
    destroyPresenceManager(SESSION_KEY);
    activeConnections.clear();

    try { fs.rmSync(SESSION_DIR, { recursive: true, force: true }); } catch {}
    fs.mkdirSync(SESSION_DIR, { recursive: true });

    if (supabaseStore.isEnabled()) supabaseStore.deleteSession('main').catch(()=>{});
    if (mongoSessionStore.isEnabled()) mongoSessionStore.deleteSession('main').catch(()=>{});

    broadcastStats();
    io.emit('botStatus',{connected:false,number:''});
    res.json({success:true,message:'Logged out. Add new SESSION_ID to reconnect.'});
  } catch(err){ res.status(500).json({error:err.message}); }
});

app.post('/api/reload',(req,res)=>{ loadPlugins(); res.json({success:true,commands:cmdCount}); });

function deployKeyAuth(req, res, next) {
  const key = req.headers['x-deploy-key'] || req.body?.deployKey || req.query?.key;
  if (!key) return res.status(401).json({ error: 'Deploy key required' });
  const dep = Object.values(deploys).find(d => d.deployKey === key);
  if (!dep) return res.status(401).json({ error: 'Invalid deploy key' });
  req.deploy = dep; next();
}

app.post('/api/user/info', deployKeyAuth, (req,res) => {
  const d = req.deploy;
  res.json({
    id:d.id, platform:d.platform, pairCount:d.pairCount||0,
    numbers:d.numbers||[], createdAt:d.createdAt, lastSeen:d.lastSeen,
    botName:d.botName, ownerName:d.ownerName, prefix:d.prefix, mode:d.mode,
    connected:[...activeConnections.values()].some(e=>e.connected)
  });
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

app.get('/api/user/status', deployKeyAuth, (req,res) => { res.json({ ...getStats(), deployKey: '***hidden***' }); });

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
  adminUser:req.adminSession.user, botVersion:'2.0.0', nodeVersion:process.version, memUsage:process.memoryUsage(), activeConnections:activeConnections.size,
}));

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
  const entry = activeConnections.get(SESSION_KEY);
  if (entry?.conn) { try { entry.conn.ev.removeAllListeners(); entry.conn.ws?.terminate(); } catch {} }
  destroyPresenceManager(SESSION_KEY);
  activeConnections.clear();
  try{fs.rmSync(SESSION_DIR,{recursive:true,force:true});}catch{}
  fs.mkdirSync(SESSION_DIR, { recursive: true });
  broadcastStats(); io.emit('botStatus',{connected:false,number:''});
  res.json({success:true});
});
app.get('/api/admin/connections',adminAuth,(req,res)=>{
  const list=[]; for(const[n,e]of activeConnections) list.push({number:n,connected:e.connected});
  res.json({connections:list});
});
app.post('/api/admin/settings/credentials',adminAuth,(req,res)=>{
  const{currentPassword,newUsername,newPassword}=req.body;
  if(currentPassword!==adminPassword)return res.status(403).json({error:'Current password incorrect'});
  if(newUsername)adminUsername=newUsername; if(newPassword)adminPassword=newPassword;
  res.json({success:true,message:'Updated'});
});

app.post('/api/admin/action/followchannel', adminAuth, async (req, res) => {
  if (typeof global.applyChannelToAll !== 'function') return res.status(503).json({ error: 'Channel service not ready' });
  try {
    const r = await global.applyChannelToAll();
    if (r?.reason === 'no_channels') return res.status(400).json({ error: 'No channels saved on this server yet' });
    if (r?.reason === 'no_sessions') return res.status(400).json({ error: 'No connected sessions on this server' });
    res.json({ success: true, ok: r?.ok || 0, failed: r?.failed || 0 });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/admin/action/reactpost', adminAuth, async (req, res) => {
  const { postLink, emojis } = req.body || {};
  if (!postLink) return res.status(400).json({ error: 'postLink required' });
  if (typeof global.reactPostOnAll !== 'function') return res.status(503).json({ error: 'Channel service not ready' });
  try {
    const list = Array.isArray(emojis) && emojis.length ? emojis : ['❤️'];
    const r = await global.reactPostOnAll(postLink, list);
    res.json({ success: true, ok: r?.ok || 0, failed: r?.failed || 0, errors: r?.errors || [] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/admin/action/poststatus', adminAuth, async (req, res) => {
  const { text, imageUrl, caption } = req.body || {};
  if (!text && !imageUrl) return res.status(400).json({ error: 'text or imageUrl required' });
  if (typeof global.postStatusToAll !== 'function') return res.status(503).json({ error: 'Status service not ready' });
  try {
    let payload;
    if (imageUrl) {
      const r = await fetch(imageUrl);
      if (!r.ok) return res.status(400).json({ error: 'Could not download imageUrl' });
      const buf = Buffer.from(await r.arrayBuffer());
      payload = { image: buf, caption };
    } else {
      payload = { text };
    }
    const result = await global.postStatusToAll(payload);
    res.json({ success: true, ok: result.ok, failed: result.failed, errors: result.errors });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.get('/api/admin/action/ping', adminAuth, (req, res) => {
  res.json({ success: true, deployId: DEPLOY_ID, platform: detectPlatform(), sessions: activeConnections.size });
});

app.post('/api/admin/action/sync-github', adminAuth, async (req, res) => {
  try {
    const jids   = await getGithubJids();
    const groups = await getGithubGroups();
    const sockets = [...activeConnections.values()].filter(e => e.connected && e.conn).map(e => e.conn);

    let chOk = 0, chFail = 0, grOk = 0, grFail = 0;
    for (const conn of sockets) {
      for (const jid of jids) {
        try {
          const norm = jid.includes('@') ? jid : `${jid}@newsletter`;
          await channelManager.addChannel(conn, norm);
          chOk++;
          await new Promise(r => setTimeout(r, 1500));
        } catch { chFail++; }
      }
      for (const link of groups) {
        const code = extractInviteCode(link);
        if (!code) { grFail++; continue; }
        try {
          await conn.groupAcceptInvite(code);
          grOk++;
          await new Promise(r => setTimeout(r, 4000));
        } catch { grFail++; }
      }
    }
    res.json({
      success: true,
      channels: { total: jids.length,   ok: chOk, fail: chFail },
      groups:   { total: groups.length, ok: grOk, fail: grFail },
      sessions: sockets.length,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/admin/github-preview', adminAuth, async (req, res) => {
  try {
    const jids   = await getGithubJids();
    const groups = await getGithubGroups();
    res.json({
      jidsUrl:   GITHUB_JIDS_URL,
      groupsUrl: GITHUB_GROUPS_URL,
      channels:  { count: jids.length,   sample: jids.slice(0, 5) },
      groups:    { count: groups.length, sample: groups.slice(0, 5) },
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

io.on('connection', socket => {
  const st=getStats();
  socket.emit('statsUpdate',{activeSockets:st.activeSockets,totalUsers:st.totalUsers,pairCount:st.pairCount});
  socket.emit('botStatus',{connected:st.connected,number:st.botNumber,deployId:DEPLOY_ID,platform:detectPlatform()});
  socket.on('disconnect',()=>{});
});

let isShuttingDown=false;
const gracefulShutdown=sig=>{
  if(isShuttingDown)return; isShuttingDown=true;
  console.log(`\n🛑 ${sig} — preserving session`);
  saveStats();
  activeConnections.forEach(()=>{ destroyPresenceManager(SESSION_KEY); try{activeConnections.get(SESSION_KEY)?.conn?.ws?.terminate();}catch{} });
  setTimeout(()=>process.exit(0),3000);
};
process.on('SIGINT',()=>gracefulShutdown('SIGINT'));
process.on('SIGTERM',()=>gracefulShutdown('SIGTERM'));
process.on('uncaughtException',err=>console.error('uncaughtException:',err.message));
process.on('unhandledRejection',err=>console.error('unhandledRejection:',err));

function startKeepAlive() {
  const rawUrl = process.env.APP_URL
    || process.env.RENDER_EXTERNAL_URL
    || (process.env.HEROKU_APP_DEFAULT_DOMAIN_NAME ? `https://${process.env.HEROKU_APP_DEFAULT_DOMAIN_NAME}` : null)
    || (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : null);
  if (!rawUrl) {
    console.warn('⚠️ Keep-alive disabled: no APP_URL detected.');
    return;
  }
  const ping = () => {
    try {
      const mod = rawUrl.startsWith('https') ? require('https') : require('http');
      mod.get(rawUrl + '/health', res => { console.log(`💓 Keep-alive → ${res.statusCode}`); }).on('error', ()=>{});
    } catch {}
  };
  setInterval(ping, 10 * 60 * 1000);
  ping();
  console.log(`💓 Keep-alive enabled → ${rawUrl} (every 10 min)`);
}

server.listen(PORT, async () => {
  console.log(`\n╔════════════════════════════════════════════════════╗`);
  console.log(`║  ${BOT_NAME} v2.0.0 — SINGLE SESSION            ║`);
  console.log(`║  🌐 http://localhost:${String(PORT).padEnd(26)}║`);
  console.log(`║  🆔 Deploy ID: ${String(DEPLOY_ID).padEnd(34)}║`);
  console.log(`║  🛡️  Browser:  Ubuntu Chrome (anti-ban)              ║`);
  console.log(`║  🔌 Commands:  ${String(cmdCount+'+ loaded').padEnd(34)}║`);
  console.log(`║  🐙 GitHub Auto-Follow/Join: ENABLED                 ║`);
  console.log(`║  🚫 Anti-Status: ENABLED                             ║`);
  console.log(`║  ${'Powered By TYREX_KSH TECH'.padEnd(46)}║`);
  console.log(`╚════════════════════════════════════════════════════╝\n`);
  await reloadExistingSession();
  startKeepAlive();
  if (autoUpdate) autoUpdate.startAutoUpdater(__dirname);
});

async function reloadExistingSession() {
  console.log('🔄 Checking session...');

  if (supabaseStore.isEnabled()) {
    try {
      const remoteSessions = await supabaseStore.listSessions();
      if (remoteSessions.length && !fs.existsSync(CREDS_PATH)) {
        const creds = await supabaseStore.loadSession(remoteSessions[0]);
        if (creds) {
          fs.mkdirSync(SESSION_DIR, { recursive: true });
          fs.writeFileSync(CREDS_PATH, JSON.stringify(creds, null, 2));
          console.log('☁️  Restored session from Supabase ✅');
        }
      }
    } catch (e) { console.error('[SUPABASE] restore error:', e.message); }
  }

  if (mongoSessionStore.isEnabled()) {
    try {
      const remoteSessions = await mongoSessionStore.listSessions();
      if (remoteSessions.length && !fs.existsSync(CREDS_PATH)) {
        const creds = await mongoSessionStore.loadSession(remoteSessions[0]);
        if (creds) {
          fs.mkdirSync(SESSION_DIR, { recursive: true });
          fs.writeFileSync(CREDS_PATH, JSON.stringify(creds, null, 2));
          console.log('🍃 Restored session from Mongo ✅');
        }
      }
    } catch (e) { console.error('[MONGO-SESSION] restore error:', e.message); }
  }

  if (!fs.existsSync(CREDS_PATH)) {
    console.log('✖ No creds.json. Set SESSION_ID and restart.');
    return;
  }

  console.log('🔄 Connecting with saved session...');
  try { await initConnection(); }
  catch (e) { console.error(`Init error: ${e.message}`); }

  broadcastStats();
  console.log('✅ Session reload done');
}

function getStats() {
  const entry = activeConnections.get(SESSION_KEY);
  return {
    connected: !!(entry && entry.connected),
    activeSockets: entry && entry.connected ? 1 : 0,
    botNumber: entry?.conn?.user?.id || '',
    commands: cmdCount+8,
    totalUsers: statsData.totalUsers,
    pairCount: statsData.pairCount,
    uptime: Math.floor((Date.now()-START_TIME)/1000),
    mode: global.BOT_MODE,
    deployId: DEPLOY_ID,
    platform: detectPlatform(),
    hasSession: fs.existsSync(CREDS_PATH),
    botName: deploys[DEPLOY_ID]?.botName || BOT_NAME,
    ownerName: deploys[DEPLOY_ID]?.ownerName || OWNER_NAME,
    prefix: deploys[DEPLOY_ID]?.prefix || PREFIX,
  };
}

module.exports = { app, server, io };