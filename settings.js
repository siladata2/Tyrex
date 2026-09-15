'use strict';
/*****************************************************************************
 *                     Developed By Sila Tech                                *
 *  🌐  GitHub   : https://github.com/Sila-Md                               *
 *    © 2026 Sila Tech. All rights reserved.                               *
 *****************************************************************************/

require('dotenv').config();

module.exports = {
  // ── BOT IDENTITY ─────────────────────────────────────────────
  _prefixesOverride: null,
  get prefixes()      { return this._prefixesOverride || [process.env.PREFIX || '.']; },
  set prefixes(v)     { this._prefixesOverride = v; },

  _botNameOverride: null,
  get botName()       { return this._botNameOverride || process.env.BOT_NAME || '𝐒𝐈𝐋𝐀 𝐗 𝐌𝐈𝐍𝐈'; },
  set botName(v)      { this._botNameOverride = v; },

  get botOwner()      { return process.env.OWNER_NAME || 'Richard Besisila'; },
  get ownerName()     { return process.env.OWNER_NAME || 'Richard Besisila'; },

  _ownerNumberOverride: null,
  get ownerNumber()   { return this._ownerNumberOverride || process.env.OWNER_NUMBER || '255789661031'; },
  set ownerNumber(v)  { this._ownerNumberOverride = v; },

  get botDesc()       { return process.env.BOT_DESC    || '𝐏𝐨𝐰𝐞𝐫𝐝 𝐁𝐲 𝐒𝐢𝐥𝐚 𝐓𝐞𝐜𝐡'; },
  get version()       { return process.env.BOT_VERSION || 'v2.0'; },

  // ── BOT SETTINGS ──────────────────────────────────────────────
  get prefix()        { return this.prefixes[0]; },
  get mode()          { return process.env.BOT_MODE || 'public'; },
  get platform() {
    if (process.env.PLATFORM)            return process.env.PLATFORM;
    if (process.env.RENDER)              return 'Render';
    if (process.env.RAILWAY_ENVIRONMENT) return 'Railway';
    if (process.env.DYNO)                return 'Heroku';
    return 'Local';
  },
  get timeZone()      { return process.env.TIMEZONE || process.env.TZ || 'Africa/Dar_es_Salaam'; },

  // ── MEDIA ─────────────────────────────────────────────────────
  _botDpOverride: null,
  get botDp()         { return this._botDpOverride || process.env.MENU_IMAGE || 'https://i.ibb.co/Gf4fr5BS/silaxmini.jpg'; },
  set botDp(v)        { this._botDpOverride = v; },
  get menuImage()     { return process.env.MENU_IMAGE || 'https://i.ibb.co/Gf4fr5BS/silaxmini.jpg'; },

  // ── LINKS ─────────────────────────────────────────────────────
  get whatsappGroup() { return process.env.WA_GROUP       || 'https://chat.whatsapp.com/IS276Wg9zcuCnJRiMDI64g'; },
  get telegramGroup() { return process.env.TG_GROUP       || 'https://t.me/SilaTech'; },
  get repoLink()      { return process.env.REPO_LINK      || 'https://github.com/Sila-Md'; },
  get newsletterJid() { return process.env.NEWSLETTER_JID || '120363402325089913@newsletter'; },

  // ── SESSION (single, SESSION_ID based) ───────────────────────
  get sessionId()     { return process.env.SESSION_ID || ''; },
  get sessionDir()    { return process.env.SESSION_DIR || './sessions'; },

  // ── DATABASE ──────────────────────────────────────────────────
  get mongoUrl()      { return process.env.MONGO_URL    || ''; },
  get postgresUrl()   { return process.env.POSTGRES_URL || ''; },
  get mysqlUrl()      { return process.env.MYSQL_URL    || ''; },
  get sqliteUrl()     { return process.env.DB_URL       || ''; },

  // ── ADMIN PANEL ───────────────────────────────────────────────
  get adminUser()     { return process.env.ADMIN_USERNAME || 'sila'; },
  get adminPass()     { return process.env.ADMIN_PASSWORD || 'sila'; },

  // ── APIS ──────────────────────────────────────────────────────
  APIs: {
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
  },
  APIKeys: {
    'https://api.xteam.xyz':       'd90a9e986e18778b',
    'https://api.lolhuman.xyz':    '85faf717d0545d14074659ad',
    'https://api.neoxr.my.id':     'yourkey',
    'https://violetics.pw':        'beta',
    'https://zenzapis.xyz':        'yourkey',
    'https://api-fgmods.ddns.net': 'fg-dylux'
  },

  // ── WARN SETTINGS ─────────────────────────────────────────────
  WARN_COUNT: 3,

  // ── MISC ──────────────────────────────────────────────────────
  get maxStoreMessages() { return parseInt(process.env.MAX_STORE_MESSAGES) || 50; },
};