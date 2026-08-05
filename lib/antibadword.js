/**
 * 🛡️ ANTIBADWORD ENGINE — REDXBOT302 v7 ULTRA
 * Fixed: single config source, Set-based O(1) lookup,
 * leet-speak normalizer, multi-language 50+ word list,
 * separated single/multi-word detection.
 */

const store = require('./lightweight_store');

const OWNER_NAME = process.env.OWNER_NAME || 'Abdul Rehman Rajpoot';

/* ─── Bad Words (50+ across 9 languages) ──────────────────────────── */
const DEFAULT_BAD_WORDS = [
  // 🇬🇧 English (expanded)
  'fuck','shit','bitch','asshole','cunt','dick','bastard','whore','slut',
  'motherfucker','wanker','prick','twat','cocksucker','bullshit','piss',
  'dumbass','jackass','douchebag','retard','moron','scumbag','skank','arse',
  'nigger','nigga','faggot','dyke','spic','kike','chink','gook','wetback',
  'tranny','cripple','spaz','mong','gimp','beaner','darkie','cuck',
  'fuckface','dipshit','fuckwit','shithead','asshat','cumslut','cumshot',
  'fucktard','shitstain','dumbfuck','fuckboy','hoeass','slutbag',

  // 🇵🇰 Urdu / Hindi (greatly expanded)
  'madarchod','chutiya','gandu','bhosdike','bhenchod','harami','haramzada',
  'randi','kameena','lodu','bsdk','lund','choot','gaand','saala','machar',
  'teri maa','teri ma','teri ammi','teri behen','teri behan',
  'bakrichod','bhen ki aankh','gaand maar','tere baap','kutiya',
  'suar','kamina','haramkhor','ullu','gadha','gdhay','gadhe ka bacha',
  'tere maa ki','tere baap ki','kutti','randi baaz','chamar',
  'mc','bc','maderchod','bhanchod','chocho','taklu','laude',
  'teri maa ki aankh','teri maa ki','hijra','haraami','nalayak',
  'dhakkan','pagal','stupid sala','bewakoof','bakwas','chutiyapa',
  'gand mara','gandmara','chud','chudai','chudwao',
  'lnda','lauda','loda','loda lag','bur','buri','bkl','bkl mc',

  // 🇧🇩 Bengali (transliterated)
  'choda','chodar','chodna','chudi','magi','randi','beshya',
  'khanki','khanki magi','tor maa ke','tor baap ke','kutta',
  'shuorer bacha','shuor','harami','bal','baler','shala',
  'gandu','banchod','madharchod','bokachoda','chulkani',
  'kuttar bacha','khabis','hijra','bhonsri','tui khanis',

  // 🇸🇦 Arabic (transliterated, expanded)
  'sharmuta','ibn el sharmouta','manyak','kuss','zemel','ya khara',
  'kalb','ibn haram','hmar','zebbi','ya ibn el sharmouta',
  'yil an','kos omak','kos okhtak','ibn el sharmouta','ya ibn el',
  'zib','ayr','air','kuss ommak','ya sharmouta',

  // 🇪🇸 Spanish (expanded)
  'pendejo','puta','cabron','chingada','maricon','hijueputa','coño','verga',
  'marica','chingao','putamadre','culero','panocha','pinche',
  'chinga tu madre','vete a la mierda','culo','cabrona',

  // 🇫🇷 French (expanded)
  'putain','merde','enculé','salaud','batard','nique ta mere','connard',
  'fils de pute','ta gueule','va te faire foutre','ordure','conne',

  // 🇩🇪 German
  'scheiße','arschloch','hurensohn','wichser','schlampe','vollidiot',
  'dummkopf','verpiss dich','fick dich','scheisskopf',

  // 🇮🇩 Indonesian / Malay
  'anjing','bangsat','bajingan','babi','memek','kontol','kampret',
  'asu','keparat','celeng','tai','ngentot','jancok','cok',

  // 🇹🇷 Turkish
  'orospu','piç','amk','sik','götveren','pezevenk','ibne','amına koyayım',
  'oç','orospu cocugu','yarrak','salak','kahpe',

  // 🇧🇷 Portuguese (expanded)
  'porra','caralho','puta merda','viado','filha da puta','corno',
  'filho da puta','buceta','cu','merda','idiota','babaca','sua mae',

  // 🇷🇺 Russian (transliterated)
  'blyad','pizda','huy','suka','mudak','zalupa','poshel nahuy',
  'ebat','idi nahuy','chmo','govna','pizdets','blya',
];

/* ─── Leet-speak map ───────────────────────────────────────────────── */
const LEET = { '0':'o','1':'i','3':'e','4':'a','@':'a','$':'s','!':'i','5':'s','7':'t','8':'b' };

function normalizeLeet(str) {
  return str.split('').map(c => LEET[c] || c).join('');
}

function normalizeRepeats(str) {
  return str.replace(/(.)\1{2,}/g, '$1$1'); // fuuuck → fuuck (partial norm)
}

function cleanText(text) {
  return normalizeRepeats(normalizeLeet(
    text.toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  ));
}

/* ─── Persistent word list ─────────────────────────────────────────── */
let _badWordSet = null;
let _multiWordPhrases = [];

async function loadWordList(chatId) {
  try {
    const custom = await store.getSetting(chatId, 'antibadword_wordlist');
    const base = DEFAULT_BAD_WORDS.concat(custom?.extra || []);
    const removed = new Set(custom?.removed || []);
    const words = base.filter(w => !removed.has(w));
    _badWordSet = new Set(words.filter(w => !w.includes(' ')));
    _multiWordPhrases = words.filter(w => w.includes(' '));
  } catch {
    _badWordSet = new Set(DEFAULT_BAD_WORDS.filter(w => !w.includes(' ')));
    _multiWordPhrases = DEFAULT_BAD_WORDS.filter(w => w.includes(' '));
  }
}

function detectBadWord(text) {
  const clean = cleanText(text);
  // Single-word check
  const words = clean.split(' ');
  for (const w of words) {
    if (w.length < 2) continue;
    if (_badWordSet && _badWordSet.has(w)) return true;
  }
  // Multi-word phrase check
  for (const phrase of _multiWordPhrases) {
    if (clean.includes(phrase)) return true;
  }
  return false;
}

/* ─── Config helpers ───────────────────────────────────────────────── */
async function getConfig(chatId) {
  try {
    return await store.getSetting(chatId, 'antibadword') || { enabled: false, action: 'delete' };
  } catch {
    return { enabled: false, action: 'delete' };
  }
}

async function saveConfig(chatId, cfg) {
  await store.saveSetting(chatId, 'antibadword', cfg);
}

/* ─── Warning helpers ──────────────────────────────────────────────── */
async function incrementWarning(chatId, userId) {
  try {
    const w = await store.getSetting(chatId, 'antibadword_warnings') || {};
    w[userId] = (w[userId] || 0) + 1;
    await store.saveSetting(chatId, 'antibadword_warnings', w);
    return w[userId];
  } catch { return 0; }
}

async function resetWarning(chatId, userId) {
  try {
    const w = await store.getSetting(chatId, 'antibadword_warnings') || {};
    delete w[userId];
    await store.saveSetting(chatId, 'antibadword_warnings', w);
  } catch {}
}

/* ─── Main detection handler ───────────────────────────────────────── */
async function handleBadwordDetection(sock, chatId, message, userMessage, senderId) {
  if (!chatId.endsWith('@g.us')) return;
  if (message.key.fromMe) return;
  if (!userMessage || !userMessage.trim()) return;

  const cfg = await getConfig(chatId);
  if (!cfg.enabled) return;

  // Load word list fresh each call (cached internally)
  await loadWordList(chatId);
  if (!detectBadWord(userMessage)) return;

  // Check bot is admin
  let groupMeta;
  try { groupMeta = await sock.groupMetadata(chatId); } catch { return; }
  const botId = sock.user.id.split(':')[0] + '@s.whatsapp.net';
  const botMember = groupMeta.participants.find(p => p.id === botId);
  if (!botMember?.admin) return;

  // Skip admins & owners
  const senderMember = groupMeta.participants.find(p => p.id === senderId);
  if (senderMember?.admin) return;

  // Delete the message first
  try { await sock.sendMessage(chatId, { delete: message.key }); } catch {}

  const num = senderId.split('@')[0];

  switch (cfg.action) {
    case 'kick':
      try {
        await sock.groupParticipantsUpdate(chatId, [senderId], 'remove');
        await sock.sendMessage(chatId, {
          text: `╭━━━━━━━━━━━━━━━━━━━━╮\n  🚫 *USER REMOVED*\n╰━━━━━━━━━━━━━━━━━━━━╯\n\n👤 @${num} was *kicked* for using prohibited language.\n\n> 🛡️ Protected by REDXBOT302`,
          mentions: [senderId]
        });
      } catch {}
      break;

    case 'warn':
      const count = await incrementWarning(chatId, senderId);
      if (count >= 3) {
        try {
          await sock.groupParticipantsUpdate(chatId, [senderId], 'remove');
          await resetWarning(chatId, senderId);
          await sock.sendMessage(chatId, {
            text: `╭━━━━━━━━━━━━━━━━━━━━╮\n  ⚠️ *AUTO-KICKED (3 WARNS)*\n╰━━━━━━━━━━━━━━━━━━━━╯\n\n👤 @${num} reached max warnings and was *removed*.\n\n> 🛡️ Protected by REDXBOT302`,
            mentions: [senderId]
          });
        } catch {}
      } else {
        await sock.sendMessage(chatId, {
          text: `╭━━━━━━━━━━━━━━━━━━━━╮\n  ⚠️ *WARNING ${count}/3*\n╰━━━━━━━━━━━━━━━━━━━━╯\n\n👤 @${num}, bad language is *not tolerated* here.\n⚠️ ${3 - count} more warning(s) before kick.\n\n> 🛡️ Protected by REDXBOT302`,
          mentions: [senderId]
        });
      }
      break;

    default: // delete
      await sock.sendMessage(chatId, {
        text: `╭━━━━━━━━━━━━━━━━━━━━╮\n  🗑️ *MESSAGE DELETED*\n╰━━━━━━━━━━━━━━━━━━━━╯\n\n👤 @${num}, watch your language! 🚫\n_Your message was removed._\n\n> 🛡️ Protected by REDXBOT302`,
        mentions: [senderId]
      });
  }
}

/* ─── Command handler ──────────────────────────────────────────────── */
async function handleAntiBadwordCommand(sock, chatId, message, match) {
  const cfg = await getConfig(chatId);

  const help = () => sock.sendMessage(chatId, {
    text:
      `╭━━━━━━━━━━━━━━━━━━━━━━━━━╮\n` +
      `  🛡️ *A N T I B A D W O R D*\n` +
      `  ✦ REDXBOT302 v7 ULTRA ✦\n` +
      `╰━━━━━━━━━━━━━━━━━━━━━━━━━╯\n\n` +
      `📋 *COMMANDS*\n` +
      `┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄\n` +
      `  ◈ \`.antibadword on\` — Enable\n` +
      `  ◈ \`.antibadword off\` — Disable\n` +
      `  ◈ \`.antibadword set delete\` — Delete msg\n` +
      `  ◈ \`.antibadword set warn\` — Warn (3x→kick)\n` +
      `  ◈ \`.antibadword set kick\` — Instant kick\n` +
      `  ◈ \`.antibadword add <word>\` — Add word\n` +
      `  ◈ \`.antibadword remove <word>\` — Remove word\n` +
      `  ◈ \`.antibadword list\` — Show word count\n` +
      `  ◈ \`.antibadword status\` — Show settings\n\n` +
      `📊 *STATUS*\n` +
      `┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄\n` +
      `  ◈ Active: ${cfg.enabled ? '✅ ON' : '❌ OFF'}\n` +
      `  ◈ Action: ${(cfg.action || 'delete').toUpperCase()}\n` +
      `  ◈ Languages: 9 (EN/UR/AR/ES/FR/DE/ID/TR/PT)\n` +
      `  ◈ Base words: ${DEFAULT_BAD_WORDS.length}+\n\n` +
      `> 🔰 By ${OWNER_NAME} · REDXBOT302`
  }, { quoted: message });

  if (!match) return help();

  const parts = match.trim().split(' ');
  const sub = parts[0].toLowerCase();

  if (sub === 'on') {
    cfg.enabled = true;
    cfg.action = cfg.action || 'delete';
    await saveConfig(chatId, cfg);
    return sock.sendMessage(chatId, {
      text: `╭━━━━━━━━━━━━━━━━━━━━╮\n  ✅ *ANTIBADWORD ON*\n╰━━━━━━━━━━━━━━━━━━━━╯\n\n🛡️ Now monitoring for bad words.\n⚙️ Action: *${cfg.action.toUpperCase()}*\n🌐 Languages: EN · UR · AR · ES · FR · DE · ID · TR · PT\n\n> 🔰 REDXBOT302 v7 ULTRA`
    }, { quoted: message });
  }

  if (sub === 'off') {
    cfg.enabled = false;
    await saveConfig(chatId, cfg);
    return sock.sendMessage(chatId, {
      text: `╭━━━━━━━━━━━━━━━━━━━━╮\n  ❌ *ANTIBADWORD OFF*\n╰━━━━━━━━━━━━━━━━━━━━╯\n\n🛡️ Monitoring disabled.\n\n> 🔰 REDXBOT302 v7 ULTRA`
    }, { quoted: message });
  }

  if (sub === 'set') {
    const action = parts[1]?.toLowerCase();
    if (!['delete','kick','warn'].includes(action)) {
      return sock.sendMessage(chatId, { text: '❌ Valid actions: *delete · kick · warn*' }, { quoted: message });
    }
    cfg.action = action;
    await saveConfig(chatId, cfg);
    const icons = { delete:'🗑️', kick:'👢', warn:'⚠️' };
    return sock.sendMessage(chatId, {
      text: `╭━━━━━━━━━━━━━━━━━━━━╮\n  ${icons[action]} *ACTION SET: ${action.toUpperCase()}*\n╰━━━━━━━━━━━━━━━━━━━━╯\n\n✅ Action updated successfully.\n\n> 🔰 REDXBOT302 v7 ULTRA`
    }, { quoted: message });
  }

  if (sub === 'add') {
    const word = parts.slice(1).join(' ').toLowerCase().trim();
    if (!word) return sock.sendMessage(chatId, { text: '❌ Provide a word: `.antibadword add <word>`' }, { quoted: message });
    const wl = await store.getSetting(chatId, 'antibadword_wordlist') || { extra: [], removed: [] };
    if (!wl.extra.includes(word)) wl.extra.push(word);
    await store.saveSetting(chatId, 'antibadword_wordlist', wl);
    return sock.sendMessage(chatId, { text: `✅ Word *"${word}"* added to filter list.` }, { quoted: message });
  }

  if (sub === 'remove') {
    const word = parts.slice(1).join(' ').toLowerCase().trim();
    if (!word) return sock.sendMessage(chatId, { text: '❌ Provide a word: `.antibadword remove <word>`' }, { quoted: message });
    const wl = await store.getSetting(chatId, 'antibadword_wordlist') || { extra: [], removed: [] };
    if (!wl.removed.includes(word)) wl.removed.push(word);
    wl.extra = wl.extra.filter(w => w !== word);
    await store.saveSetting(chatId, 'antibadword_wordlist', wl);
    return sock.sendMessage(chatId, { text: `✅ Word *"${word}"* removed from filter.` }, { quoted: message });
  }

  if (sub === 'list') {
    const wl = await store.getSetting(chatId, 'antibadword_wordlist') || { extra: [], removed: [] };
    return sock.sendMessage(chatId, {
      text: `╭━━━━━━━━━━━━━━━━━━━━╮\n  📋 *WORD LIST*\n╰━━━━━━━━━━━━━━━━━━━━╯\n\n📦 Base words: *${DEFAULT_BAD_WORDS.length}*\n➕ Custom added: *${wl.extra.length}*\n➖ Custom removed: *${wl.removed.length}*\n🌐 Total active: *${DEFAULT_BAD_WORDS.length + wl.extra.length - wl.removed.length}*\n\n> 🔰 REDXBOT302 v7 ULTRA`
    }, { quoted: message });
  }

  if (sub === 'status') {
    const wl = await store.getSetting(chatId, 'antibadword_wordlist') || { extra: [], removed: [] };
    return sock.sendMessage(chatId, {
      text: `╭━━━━━━━━━━━━━━━━━━━━━━━━╮\n  🛡️ *ANTIBADWORD STATUS*\n╰━━━━━━━━━━━━━━━━━━━━━━━━╯\n\n  ◈ Status:  ${cfg.enabled ? '✅ *ACTIVE*' : '❌ *INACTIVE*'}\n  ◈ Action:  ⚙️ *${(cfg.action||'delete').toUpperCase()}*\n  ◈ Words:   📦 *${DEFAULT_BAD_WORDS.length + wl.extra.length - wl.removed.length}* active\n  ◈ Langs:   🌐 9 languages\n  ◈ Leet:    🔤 Auto-detected\n\n> 🔰 By ${OWNER_NAME}`
    }, { quoted: message });
  }

  return help();
}

module.exports = {
  handleAntiBadwordCommand,
  handleBadwordDetection,
  // Legacy compat
  setAntiBadword: async (c, t, a) => { const cfg = await getConfig(c); cfg.enabled=true; cfg.action=a; await saveConfig(c,cfg); return true; },
  getAntiBadword: getConfig,
  removeAntiBadword: async (c) => { await saveConfig(c, { enabled:false, action:'delete' }); return true; },
  incrementWarningCount: incrementWarning,
  resetWarningCount: resetWarning,
};
