/*****************************************************************************
 *                     Developed By Abdul Rehman Rajpoot                     *
 *          messageHandler.js — REDXBOT302 RC12 ULTRA REWRITE v2             *
 *                                                                            *
 *  KEY FIXES (v2):                                                           *
 *   1. resolveSender() called FIRST — LID JIDs resolved before any check    *
 *   2. sendSafeMessage() used for ALL outbound sends — LID-safe routing     *
 *   3. DM logic + mode gate moved to TOP of pipeline (before group checks)  *
 *   4. chatbot/autoreply work in DM (removed if(isGroup) guards)            *
 *   5. pmblocker respects blockCommands flag correctly                       *
 *   6. senderId_OLD_REMOVED stub cleaned                                     *
 *****************************************************************************/

'use strict';

const fs      = require('fs');
const path    = require('path');
const settings = require('../settings');
const store   = require('./lightweight_store');
const commandHandler = require('./commandHandler');

// ── DM-safe send + LID resolver (must be imported before anything uses sock.sendMessage) ──
const { resolveSender } = require('./senderResolver');
const { sendSafeMessage } = require('./sendSafeMessage');

// ── Lazy plugin hooks (group-only, load on first use) ────────────────────────
let _antifloodPlugin, _groupGuardPlugin, _welcomePlugin;
function getAntiflood() {
  if (!_antifloodPlugin) {
    try { _antifloodPlugin = require('../plugins/antiflood'); }
    catch { _antifloodPlugin = { checkFlood: async () => {} }; }
  }
  return _antifloodPlugin;
}
function getGroupGuard() {
  if (!_groupGuardPlugin) {
    try { _groupGuardPlugin = require('../plugins/groupguard'); }
    catch { _groupGuardPlugin = { handleGroupGuard: async () => {} }; }
  }
  return _groupGuardPlugin;
}
function getWelcomePlugin() {
  if (!_welcomePlugin) { try{_welcomePlugin=require('../plugins/welcome');}catch(_){_welcomePlugin={};} }
  return _welcomePlugin;
}

const { printMessage, printLog } = require('./print');
const { isBanned }    = require('./isBanned');
const { isSudo }      = require('./index');
const isOwnerOrSudo                    = require('./isOwner');
const { isOwnerOnly }                  = require('./isOwner');
const isAdmin                          = require('./isAdmin');
// ── Safe plugin requires ────────────────────────────────────
let handleAutoread = async () => {};
let handleAutotypingForMessage = async () => {}, showTypingAfterCommand = async () => {};
let storeMessage = async () => {}, handleMessageRevocation = async () => {};
let storeEdit = async () => {}, handleMessageEdit = async () => {};
let handleAutoReply = async () => {};
let handleBadwordDetection = async () => {};
let handleLinkDetection = async () => {};
let isShadowBanned = () => false;
let handleTagDetection = async () => {};
let handleChatbotResponse = async () => {};
let handleAntibotCheck = async () => {};
let handleAntiSpam = async () => false;
let tictactoe = {}, connect4 = {};
try { ({ handleAutoread } = require('../plugins/autoread')); } catch(_) {}
try { ({ handleAutotypingForMessage, showTypingAfterCommand } = require('../plugins/autotyping')); } catch(_) {}
try { ({ storeMessage, handleMessageRevocation, storeEdit, handleMessageEdit } = require('../plugins/antidelete')); } catch(_) {}
try { ({ handleAutoReply } = require('../plugins/autoreply')); } catch(_) {}
try { ({ checkAntiBadword: handleBadwordDetection } = require('../plugins/antibadword')); } catch(_) {}
try { ({ handleLinkDetection, isShadowBanned } = require('../plugins/antilink')); } catch(_) {}
try { ({ handleTagDetection } = require('../plugins/antitag')); } catch(_) {}
try { ({ handleChatbotResponse } = require('../plugins/chatbot')); } catch(_) {}
try { ({ handleAntibotCheck } = require('../plugins/antibot')); } catch(_) {}
try { ({ handleAntiSpam } = require('../plugins/antispam')); } catch(_) {}
try { tictactoe = require('../plugins/tictactoe'); } catch(_) {}
try { connect4   = require('../plugins/connect4');  } catch(_) {}
const { addCommandReaction, addSuccessReaction, addErrorReaction } = require('./reactions');
const { getAutoForwardRules, shouldForward, forwardMessage }       = require('./forwardHelpers');
const memoryManager = require('./memoryManager');
let menuPlugin = null, welcomePlugin = null, mentionPlugin = null;
try { menuPlugin    = require('../plugins/menu');    } catch(_) {}
try { welcomePlugin = require('../plugins/welcome'); } catch(_) {}
try { mentionPlugin = require('../plugins/mention'); } catch(_) {}

// Optional plugins
let _handleStatusDmReply = null;
try { _handleStatusDmReply = require('../plugins/statusdl').handleStatusDmReply; } catch (_) {}
let _handleAutoVV = null;
try { _handleAutoVV = require('../plugins/viewonce').handleAutoVV; } catch (_) {}

let bgmPlugin = null;
try {
  try{bgmPlugin=require('../plugins/bgm');}catch(_){bgmPlugin=null;}
  if (bgmPlugin.loadTriggers) bgmPlugin.loadTriggers();
  printLog('info', '✅ BGM plugin loaded');
} catch (e) {
  printLog('error', `❌ BGM plugin failed to load: ${e.message}`);
}

let goodbyeHandler = null;
try {
  let gm=null; try{gm=require('../plugins/goodbye');}catch(_){}
  goodbyeHandler = gm.handleLeaveEvent || gm.handleGroupLeave;
  if (goodbyeHandler) printLog('info', '✅ Goodbye handler loaded');
} catch { printLog('warn', 'No goodbye plugin found'); }

// ── Caches ───────────────────────────────────────────────────────────────────
const forwardedCache  = new Map();
const FORWARD_CACHE_TTL = 5000;
module.exports.forwardedCache   = forwardedCache;
module.exports.FORWARD_CACHE_TTL = FORWARD_CACHE_TTL;

const _speedCache = {
  botMode:     { val: null, ts: 0 },
  stealthMode: { val: null, ts: 0 },
  stickerCmds: { val: null, ts: 0 },
};
const SPEED_TTL = 15000; // bumped to 15s — reduces DB reads significantly

// ── Group metadata micro-cache (avoid repeated sock.groupMetadata calls) ─────
const _groupMetaCache = new Map(); // chatId → { meta, ts }
const GROUP_META_TTL  = 60 * 1000; // 1 minute
global._groupMetaCache = _groupMetaCache;
global._groupMetaTTL   = GROUP_META_TTL;

async function cachedBotMode() {
  const now = Date.now();
  if (_speedCache.botMode.val !== null && now - _speedCache.botMode.ts < SPEED_TTL)
    return _speedCache.botMode.val;
  const v = (typeof global !== 'undefined' && global.MODE) || await store.getBotMode();
  _speedCache.botMode.val = v; _speedCache.botMode.ts = now; return v;
}
async function cachedStealthMode() {
  const now = Date.now();
  if (_speedCache.stealthMode.val !== null && now - _speedCache.stealthMode.ts < SPEED_TTL)
    return _speedCache.stealthMode.val;
  const v = await store.getSetting('global', 'stealthMode').catch(() => null);
  _speedCache.stealthMode.val = v; _speedCache.stealthMode.ts = now; return v;
}
global._bustSpeedCache = () => {
  _speedCache.botMode.ts = 0;
  _speedCache.stealthMode.ts = 0;
  _speedCache.stickerCmds.ts = 0;
};

const HAS_DB = !!(
  process.env.MONGO_URL || process.env.POSTGRES_URL ||
  process.env.MYSQL_URL || process.env.DB_URL
);
const STICKER_FILE = path.join(__dirname, '../data/sticker_commands.json');

async function getStickerCommands() {
  if (HAS_DB) return (await store.getSetting('global', 'stickerCommands')) || {};
  try {
    if (!fs.existsSync(STICKER_FILE)) return {};
    return JSON.parse(fs.readFileSync(STICKER_FILE, 'utf8'));
  } catch { return {}; }
}

const channelInfo = {
  contextInfo: {
    forwardingScore: 1,
    isForwarded: true,
    forwardedNewsletterMessageInfo: {
      newsletterJid:  '120363426816577327@newsletter',
      newsletterName: 'REDXBOT302',
      serverMessageId: 143,
    },
  },
};

// ── Helper: safe reply that works in DMs (LID-aware) ─────────────────────────
// All bot replies in this file go through here.
async function reply(sock, chatId, content, opts = {}) {
  return sendSafeMessage(sock, chatId, content, opts);
}

// ── Memory cache init flag ────────────────────────────────────────────────────
let memoryCacheSet = false;

/* ============================================================================
 *  handleMessages — main entry point
 * ========================================================================== */
async function handleMessages(sock, messageUpdate) {
  try {
    // Init memory manager once
    if (!memoryCacheSet) {
      let chatbot=null; try{chatbot=require('../plugins/chatbot');}catch(_){}
      if (chatbot.chatMemory) {
        memoryManager.setCaches(forwardedCache, chatbot.chatMemory);
        memoryCacheSet = true;
      }
    }

    const { messages, type } = messageUpdate;
    if (type !== 'notify') return;

    const message = messages[0];
    if (!message?.message) return;

    await printMessage(message, sock);

    // ─── STEP 1: Resolve chatId + isGroup ─────────────────────────────────
    const chatId  = message.key.remoteJid;
    const isGroup = chatId.endsWith('@g.us');

    // ─── STEP 2: Resolve senderId (LID-safe, MUST be before any perm check) ──
    // In Baileys RC12+, DMs from non-linked users arrive as @lid JIDs.
    // resolveSender() maps them to real @s.whatsapp.net JIDs via cache/contacts.
    // Without this, owner checks fail and bot treats everyone as a stranger in DMs.
    const senderId = await resolveSender(message, sock, chatId);

    // ─── STEP 3: Anti-delete store + auto-read (non-blocking) ─────────────
    storeMessage(sock, message).catch(() => {});
    storeEdit(sock, message).catch(() => {});   // save original for edit-tracking
    cachedStealthMode().then(ghostMode => {
      if (!ghostMode?.enabled)
        handleAutoread(sock, message).catch(e => printLog('error', `Autoread: ${e.message}`));
    }).catch(() => {});

    // ─── STEP 4: Protocol messages (deletions) ────────────────────────────
    const protoType = message.message?.protocolMessage?.type;
    if (protoType === 0) {
      printLog('info', 'Message deletion detected');
      await handleMessageRevocation(sock, message);
      return;
    }
    // type 14 = MESSAGE_EDIT (WhatsApp native edit)
    if (protoType === 14 || message.message?.editedMessage) {
      handleMessageEdit(sock, message).catch(() => {});
      return;
    }

    // ─── STEP 5: Status DM reply (owner reply to status → triggers download) ──
    if (_handleStatusDmReply && message.key.fromMe) {
      _handleStatusDmReply(sock, message).catch(() => {});
    }

    // ─── STEP 6: Extract message text ─────────────────────────────────────
    const rawText = (
      message.message?.conversation ||
      message.message?.extendedTextMessage?.text ||
      message.message?.imageMessage?.caption ||
      message.message?.videoMessage?.caption ||
      message.message?.buttonsResponseMessage?.selectedButtonId ||
      ''
    );
    const messageText = rawText.trim();
    const userMessage = messageText.toLowerCase();

    // ─── STEP 7: Permission checks (cached 30s per sender) ────────────────
    const sessionId = sock?.user?.id
      ? isOwnerOrSudo.cleanJid(sock.user.id) : null;
    const _permKey = `${senderId}:${message.key.fromMe ? '1' : '0'}`;
    const _permNow = Date.now();
    if (!global._permCache) global._permCache = new Map();
    let _cached = global._permCache.get(_permKey);
    if (!_cached || _permNow - _cached.ts > 30000) {
      const [_sudo, _owner, _banned] = await Promise.all([
        isSudo(senderId).catch(() => false),
        isOwnerOrSudo(senderId, sock, chatId, message.key.fromMe, sessionId).catch(() => false),
        isBanned(senderId).catch(() => false),
      ]);
      _cached = { sudo: _sudo, owner: _owner, banned: _banned, ts: _permNow };
      global._permCache.set(_permKey, _cached);
      // Evict stale entries
      if (global._permCache.size > 500) {
        const cutoff = _permNow - 60000;
        for (const [k, v] of global._permCache)
          if (v.ts < cutoff) global._permCache.delete(k);
      }
    }
    const senderIsSudo        = _cached.sudo;
    const senderIsOwnerOrSudo = _cached.owner;
    const isOwnerOrSudoCheck  = senderIsOwnerOrSudo;
    const userBanned          = _cached.banned;

    // ─── STEP 8: DM mode gate — checked BEFORE group-only logic ──────────
    // This is the core DM fix: evaluate mode + pmblocker for non-group early,
    // so we can return fast and avoid running group-only guards on DMs.
    if (!isGroup && !message.key.fromMe) {
      const botMode = await cachedBotMode();

      // Mode gate: 'groups' mode blocks DMs for non-owner/sudo
      if (botMode === 'groups' && !isOwnerOrSudoCheck) return;
      // Mode gate: 'private'/'self' — only owner/sudo allowed everywhere
      if ((botMode === 'private' || botMode === 'self') && !isOwnerOrSudoCheck) return;

      // PM blocker (respects blockCommands flag)
      if (!senderIsSudo && !isOwnerOrSudoCheck) {
        let readState = async()=>{}; try{({readState}=require('../plugins/pmblocker'));}catch(_){}
        const pmState = await readState();
        if (pmState.enabled) {
          const hasPrefix = settings.prefixes.some(p => userMessage.startsWith(p));
          // blockCommands=false → only block plain text, let prefixed commands through
          if (pmState.blockCommands || !hasPrefix) {
            await reply(sock, chatId, {
              text: pmState.message || '🚫 Private messages are blocked. Use groups.',
            });
            setTimeout(() => sock.updateBlockStatus(chatId, 'block').catch(() => {}), 500);
            return;
          }
        }
      }
    }

    // ─── STEP 9: Banned user gate ─────────────────────────────────────────
    if (userBanned && !userMessage.startsWith('.unban')) {
      if (Math.random() < 0.1) {
        await reply(sock, chatId, {
          text: 'You are banned. Contact an admin to be unbanned.',
          ...channelInfo,
        });
      }
      return;
    }

    // ─── STEP 10: Mention detection ───────────────────────────────────────
    try {
      const ownerNumber = settings.ownerNumber?.replace(/[^0-9]/g, '');
      if (ownerNumber)
        await mentionPlugin.handleMention(sock, message, `${ownerNumber}@s.whatsapp.net`);
    } catch (e) { printLog('error', `Mention: ${e.message}`); }

    // ─── STEP 11: Button / interactive responses ──────────────────────────
    if (message.message?.interactiveResponseMessage) {
      if (menuPlugin.handleButtonResponse)
        await menuPlugin.handleButtonResponse(sock, message, { chatId, senderId, isGroup, channelInfo });
      return;
    }
    if (message.message?.buttonsResponseMessage) {
      const buttonId = message.message.buttonsResponseMessage.selectedButtonId;
      if (buttonId.startsWith('cat_')) {
        let menuLegacy=null; try{menuLegacy=require('../plugins/smenu');}catch{menuLegacy=menuPlugin||{};}
        await menuLegacy.handler(sock, message, [buttonId.replace('cat_', '')],
          { chatId, senderId, isGroup, channelInfo });
        return;
      }
      if (buttonId === 'channel') {
        await reply(sock, chatId, { text: '*Join our Channel:*\nhttps://whatsapp.com/channel/0029VbCPnYf96H4SNehkev10' },
          { quoted: message });
        return;
      }
      if (buttonId === 'owner') {
        let ownerCmd={}; try{ownerCmd=require('../plugins/owner');}catch(_){}
        await ownerCmd.handler(sock, message, [], { chatId, senderId, isGroup, channelInfo });
        return;
      }
      if (buttonId === 'support') {
        await reply(sock, chatId, { text: '*Support*\nhttps://whatsapp.com/channel/0029VbCPnYf96H4SNehkev10' },
          { quoted: message });
        return;
      }
    }

    // ─── STEP 12: Sticker commands ────────────────────────────────────────
    if (message.message?.stickerMessage) {
      const fileSha256 = message.message.stickerMessage.fileSha256;
      if (fileSha256) {
        const hash = Buffer.from(fileSha256).toString('base64');
        const stickers = await getStickerCommands();
        if (stickers[hash]) return; // sticker command handled internally
      }
    }

    // ─── STEP 13: smenu number-selection handler ──────────────────────────
    if (/^[0-9]+$/.test(userMessage.trim())) {
      try {
        const pending = global._smenuPending;
        if (pending) {
          const pk    = `smenu_${chatId}_${senderId}`;
          const entry = pending.get(pk);
          if (entry && Date.now() < entry.expires) {
            const num = parseInt(userMessage.trim());
            if (num >= 1 && num <= entry.categories.length) {
              let smenuPlugin=null; try{smenuPlugin=require('../plugins/smartmenu');}catch(_){}
              await smenuPlugin.handler(sock, message, [String(num)],
                { chatId, senderId, isGroup, channelInfo });
              pending.delete(pk);
              return;
            }
          }
        }
      } catch { /* not a smenu reply */ }
    }

    // ─── STEP 14: Download quality-menu number selection ──────────────────
    if (/^[1-9][0-9]?$/.test(userMessage.trim())) {
      try {
        const dlPending = global._dlPending;
        if (dlPending) {
          const pk    = `dlmenu_${chatId}_${senderId}`;
          const entry = dlPending.get(pk);
          if (entry && Date.now() < entry.expires) {
            const num  = parseInt(userMessage.trim());
            const item = entry.items[num - 1];
            if (item) {
              dlPending.delete(pk);
              const { default: axios } = require('axios');
              const dlUrl = item.url || item.download || item.link;
              if (dlUrl) {
                await sock.sendMessage(chatId, { react: { text: '⬇️', key: message.key } });
                try {
                  const resp = await axios.get(dlUrl, { responseType: 'arraybuffer', timeout: 60000 });
                  const ct  = resp.headers['content-type'] || 'video/mp4';
                  const buf = Buffer.from(resp.data);
                  if (ct.includes('video'))
                    await reply(sock, chatId, { video: buf, mimetype: 'video/mp4' }, { quoted: message });
                  else if (ct.includes('image'))
                    await reply(sock, chatId, { image: buf }, { quoted: message });
                  else
                    await reply(sock, chatId, { document: buf, mimetype: ct, fileName: 'download' }, { quoted: message });
                } catch {
                  await reply(sock, chatId, { text: `⬇️ Direct link:\n${dlUrl}` }, { quoted: message });
                }
                return;
              }
            }
          }
        }
      } catch { /* not a dl menu reply */ }
    }

    // ─── STEP 15: YT sliding-session guard ───────────────────────────────
    if (/^[0-9]+$/.test(userMessage.trim()) && global._ytSessions?.has(senderId)) return;

    // ─── STEP 16: Deline games ────────────────────────────────────────────
    try {
      let delineGames=null; try{delineGames=require('../plugins/deline-games');}catch(_){}
      if (await delineGames.handleGameReply(sock, message, chatId, userMessage)) return;
    } catch {}

    // ─── STEP 17: Game moves (tictactoe / connect4) ───────────────────────
    if (/^[1-9]$/.test(userMessage) || userMessage === 'surrender') {
      if (await tictactoe.handleMove(sock, message, chatId, senderId, userMessage)) return;
    }
    if (/^[1-7]$/.test(userMessage) || userMessage === 'surrender') {
      if (await connect4.handleMove(sock, message, chatId, senderId, userMessage)) return;
    }

    // ─── STEP 18: Auto-forward ────────────────────────────────────────────
    try {
      if (!forwardedCache.has(message.key.id)) {
        forwardedCache.set(message.key.id, Date.now());
        if (forwardedCache.size > 1000) {
          const now = Date.now();
          for (const [id, ts] of forwardedCache)
            if (now - ts > FORWARD_CACHE_TTL) forwardedCache.delete(id);
        }
        const rules = await (async () => {
          const now = Date.now();
          if (!global._fwdRulesCache || now - global._fwdRulesCache.ts > 10000)
            global._fwdRulesCache = { rules: await getAutoForwardRules(), ts: now };
          return global._fwdRulesCache.rules;
        })();
        if (Array.isArray(rules)) {
          for (const rule of rules) {
            if (!rule.enabled || chatId !== rule.sourceJid) continue;
            if (message.key.fromMe && rule.mode !== 'owner') continue;
            const should = await shouldForward(sock, message, rule.mode, isGroup, senderId);
            if (should) {
              printLog('info', `[AUTO-FWD] → ${rule.targetJid} (${rule.mode})`);
              forwardMessage(sock, message, rule.targetJid)
                .catch(e => printLog('error', `Forward error: ${e.message}`));
            }
          }
        }
      }
    } catch (e) { printLog('error', `[AUTO-FWD] ${e.message}`); }

    // ─── STEP 19: Message count + auto-reply + auto-VV (non-blocking) ─────
    if (!message.key.fromMe) {
      store.incrementMessageCount(chatId, senderId).catch(() => {});
      if (userMessage)
        handleAutoReply(sock, chatId, message, userMessage).catch(() => {});
      if (_handleAutoVV)
        _handleAutoVV(sock, message).catch(() => {});
    }

    // ─── STEP 20: Group-only protection (antiflood, antilink, etc.) ───────
    if (isGroup) {
      const isOwnerSudoSender = await isOwnerOrSudo(senderId, sock, chatId).catch(() => false);
      await Promise.allSettled([
        userMessage ? handleBadwordDetection(sock, message) : Promise.resolve(),
        handleLinkDetection(sock, chatId, message, userMessage, senderId),
        handleTagDetection(sock, chatId, message, senderId),
        handleAntibotCheck(sock, message, chatId, senderId),
        handleAntiSpam(sock, chatId, message, senderId, isOwnerSudoSender).catch(() => {}),
        getAntiflood().checkFlood(sock, message, chatId, senderId).catch(() => {}),
        getGroupGuard().handleGroupGuard(sock, message, chatId, senderId).catch(() => {}),
      ]);
    }

    // ─── STEP 20.5: Shadow-ban gate ──────────────────────────────────────
    // Users in antilink shadow-ban list are silently ignored for all commands
    if (isGroup && isShadowBanned(chatId, senderId)) return;

    // ─── STEP 21: BGM command + trigger ──────────────────────────────────
    const usedPrefix = settings.prefixes.find(p => userMessage.startsWith(p));
    if (usedPrefix && bgmPlugin?.handler) {
      const fullArgs = messageText.slice(usedPrefix.length).trim().split(/\s+/);
      if (fullArgs[0]?.toLowerCase() === 'bgm') {
        await bgmPlugin.handler(sock, message, fullArgs.slice(1), {
          chatId, senderId, isGroup,
          isSenderAdmin: false, isBotAdmin: false,
          senderIsOwnerOrSudo, isOwnerOrSudoCheck,
          channelInfo, rawText, userMessage, messageText,
        });
        return;
      }
    }
    if (!usedPrefix && bgmPlugin?.checkAndPlay) {
      try {
        if (await bgmPlugin.checkAndPlay(sock, message, userMessage, chatId, channelInfo)) return;
      } catch (e) { printLog('error', `[BGM] trigger: ${e.message}`); }
    }

    // ─── STEP 22: Command detection ───────────────────────────────────────
    const command = commandHandler.getCommand(userMessage, settings.prefixes);

    // No command → chatbot (now works in DM and group)
    if (!usedPrefix && !command) {
      await handleAutotypingForMessage(sock, chatId, userMessage);
      const botMode = await cachedBotMode();
      const canUseChatbot =
        botMode === 'public' ||
        (botMode === 'groups' && isGroup) ||
        (botMode === 'inbox'  && !isGroup) ||
        isOwnerOrSudoCheck;
      if (canUseChatbot)
        await handleChatbotResponse(sock, chatId, message, userMessage, senderId);
      return;
    }

    if (!command) {
      // Has prefix but unknown command — try chatbot as fallback
      const botMode = await cachedBotMode();
      const canUseChatbot =
        botMode === 'public' ||
        (botMode === 'groups' && isGroup) ||
        (botMode === 'inbox'  && !isGroup) ||
        isOwnerOrSudoCheck;
      if (canUseChatbot)
        await handleChatbotResponse(sock, chatId, message, userMessage, senderId);
      return;
    }

    // ─── STEP 23: Bot mode access gate ───────────────────────────────────
    const botMode = await cachedBotMode();
    const allowed = (() => {
      if (isOwnerOrSudoCheck) return true;
      switch (botMode) {
        case 'public':               return true;
        case 'private': case 'self': return false;   // owner/sudo only — already returned true above
        case 'groups':               return isGroup;
        case 'inbox':                return !isGroup;
        default:                     return true;    // unknown → allow
      }
    })();
    if (!allowed) return;

    // ─── STEP 24: Parse args ──────────────────────────────────────────────
    let args;
    if (usedPrefix)
      args = messageText.slice(usedPrefix.length).trim().split(/\s+/).slice(1);
    else
      args = messageText.trim().split(/\s+/).slice(1);

    // ─── STEP 25: Permission checks ───────────────────────────────────────
    if (command.strictOwnerOnly) {
      if (!isOwnerOnly(senderId) && !isOwnerOnly(sessionId || '')) {
        await reply(sock, chatId,
          { text: '❌ This command is restricted to the real owner only!', ...channelInfo },
          { quoted: message });
        return;
      }
    }
    if (command.ownerOnly && !senderIsOwnerOrSudo) {
      await reply(sock, chatId,
        { text: '❌ Owner, co-owner, or sudo only!', ...channelInfo },
        { quoted: message });
      return;
    }
    if (command.groupOnly && !isGroup) {
      await reply(sock, chatId,
        { text: '❌ This command is group only!', ...channelInfo },
        { quoted: message });
      return;
    }

    let isSenderAdmin = false, isBotAdmin = false;
    if (command.adminOnly && isGroup) {
      const adminStatus = await isAdmin(sock, chatId, senderId);
      isSenderAdmin = adminStatus.isSenderAdmin;
      isBotAdmin    = adminStatus.isBotAdmin;
      if (!isBotAdmin) {
        await reply(sock, chatId,
          { text: '❌ Make the bot admin first!', ...channelInfo },
          { quoted: message });
        return;
      }
      if (!isSenderAdmin && !message.key.fromMe && !senderIsOwnerOrSudo) {
        await reply(sock, chatId,
          { text: '❌ Group admins only!', ...channelInfo },
          { quoted: message });
        return;
      }
    }

    // ─── STEP 26: Execute command ─────────────────────────────────────────
    const isRealOwner = isOwnerOnly(senderId) || (sessionId && isOwnerOnly(sessionId));
    const context = {
      chatId, senderId, isGroup,
      isSenderAdmin, isBotAdmin,
      senderIsOwnerOrSudo, isOwnerOrSudoCheck,
      isRealOwner, sessionId,
      channelInfo, rawText, userMessage, messageText,
    };

    await addCommandReaction(sock, message);
    try {
      const start    = Date.now();
      await command.handler(sock, message, args, context);
      const duration = Date.now() - start;
      await commandHandler.recordCommandSpeed(command.command, duration);
      await addSuccessReaction(sock, message);
      await showTypingAfterCommand(sock, chatId);
    } catch (err) {
      await addErrorReaction(sock, message);
      printLog('error', `Command [${command.command}]: ${err.message}`);
      console.error(err.stack);
      await reply(sock, chatId,
        { text: `❌ Error: ${err.message}`, ...channelInfo },
        { quoted: message });
    }

  } catch (err) {
    printLog('error', `Message handler fatal: ${err.message}`);
    console.error(err.stack);
  }
}

/* ============================================================================
 *  Group participant update
 * ========================================================================== */
async function handleGroupParticipantUpdate(sock, update) {
  try {
    const { id, participants, action, author } = update;
    if (!id.endsWith('@g.us')) return;
    const botMode     = await cachedBotMode();
    const isPublicMode = botMode === 'public' || botMode === 'groups';

    switch (action) {
      case 'promote':
        if (!isPublicMode) return;
        await require('../plugins/promote').handlePromotionEvent(sock, id, participants, author);
        break;
      case 'demote':
        if (!isPublicMode) return;
        await require('../plugins/demote').handleDemotionEvent(sock, id, participants, author);
        break;
      case 'add':
        if (typeof welcomePlugin.handleJoinEvent === 'function')
          await welcomePlugin.handleJoinEvent(sock, id, participants);
        break;
      case 'remove':
        if (goodbyeHandler) await goodbyeHandler(sock, id, participants);
        break;
      default:
        printLog('warning', `Unhandled group action: ${action}`);
    }
    try { await getWelcomePlugin().handleParticipantUpdate(sock, update); } catch {}
  } catch (err) {
    printLog('error', `Group update: ${err.message}`);
    console.error(err.stack);
  }
}

/* ============================================================================
 *  Status handler
 * ========================================================================== */
async function handleStatus(sock, status) {
  try {
    await require('../plugins/autostatus').handleStatusUpdate(sock, status);
  } catch (e) { printLog('error', `Status handler: ${e.message}`); }
  try {
    await require('../plugins/statusdl').handleAutoStatusSave(sock, status);
  } catch {}
}

/* ============================================================================
 *  Call handler
 * ========================================================================== */
async function handleCall(sock, calls) {
  try {
    let anticall=null; try{anticall=require('../plugins/anticall');}catch(_){}
    for (const call of calls) await anticall.handleIncomingCall(sock, call);
  } catch (e) { printLog('error', `Call handler: ${e.message}`); }
}

// Start memory monitoring after everything loads
setTimeout(() => memoryManager.startMonitoring(), 5000);

module.exports = { handleMessages, handleGroupParticipantUpdate, handleStatus, handleCall };
