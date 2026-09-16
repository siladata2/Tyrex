/*****************************************************************************
 *                     Developed By TYREX_KSH TECH                                *
 *  🌐  GitHub   : https://github.com/Sila-Md                               *
 *    © 2026 TYREX_KSH TECH. All rights reserved.                               *
 *****************************************************************************/

require('dotenv').config();

// ─────────────────────────────────────────────────────────────
// SESSION CONFIG (Single session — SESSION_ID based)
// ─────────────────────────────────────────────────────────────
global.SESSION_ID     = process.env.SESSION_ID || '';
global.SESSION_DIR    = process.env.SESSION_DIR || './sessions';

// Owner / bot metadata
global.OWNER_NUMBER   = process.env.OWNER_NUMBER || '255610744352';
global.OWNER_NAME     = process.env.OWNER_NAME   || '𝐓𝐘𝐑𝐄𝐗-𝐊𝐒𝐇-𝐓𝐄𝐂𝐇';
global.BOT_NAME       = process.env.BOT_NAME     || '𝐓𝐘𝐑𝐄𝐗-𝐊𝐒𝐇-𝐓𝐄𝐂𝐇';
global.PREFIX         = process.env.PREFIX       || '.';
global.BOT_MODE       = process.env.BOT_MODE     || 'public';

// Newsletter JID (auto-follow on connect)
global.NEWSLETTER_JID = process.env.NEWSLETTER_JID || '120363429539292697@newsletter';

// ─────────────────────────────────────────────────────────────
// External APIs used by plugins
// ─────────────────────────────────────────────────────────────
global.APIs = {
  xteam:    'https://api.xteam.xyz',
  dzx:      'https://api.dhamzxploit.my.id',
  lol:      'https://api.lolhuman.xyz',
  violetics:'https://violetics.pw',
  neoxr:    'https://api.neoxr.my.id',
  zenzapis: 'https://zenzapis.xyz',
  akuari:   'https://api.akuari.my.id',
  akuari2:  'https://apimu.my.id',
  nrtm:     'https://fg-nrtm.ddns.net',
  bg:       'http://bochil.ddns.net',
  fgmods:   'https://api-fgmods.ddns.net'
};

global.APIKeys = {
  'https://api.xteam.xyz':       'd90a9e986e18778b',
  'https://api.lolhuman.xyz':    '85faf717d0545d14074659ad',
  'https://api.neoxr.my.id':     'yourkey',
  'https://violetics.pw':        'beta',
  'https://zenzapis.xyz':        'yourkey',
  'https://api-fgmods.ddns.net': 'fg-dylux'
};

module.exports = {
  // ── Session (single) ──
  SESSION_ID:     global.SESSION_ID,
  SESSION_DIR:    global.SESSION_DIR,

  // ── Bot metadata ──
  BOT_NAME:       global.BOT_NAME,
  OWNER_NUMBER:   global.OWNER_NUMBER,
  OWNER_NAME:     global.OWNER_NAME,
  PREFIX:         global.PREFIX,
  BOT_MODE:       global.BOT_MODE,

  // ── Misc ──
  WARN_COUNT:     3,
  NEWSLETTER_JID: global.NEWSLETTER_JID,
  APIs:           global.APIs,
  APIKeys:        global.APIKeys
};