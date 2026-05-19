'use strict';
/*****************************************************************************
 *                     Developed By Abdul Rehman Rajpoot                     *
 *  🌐  GitHub   : https://github.com/AbdulRehman19721986/redxbot302          *
 *  ▶️  YouTube  : https://youtube.com/@rootmindtech                         *
 *  💬  WhatsApp : https://whatsapp.com/channel/0029VbCPnYf96H4SNehkev10     *
 *  🔗  Telegram : https://t.me/TeamRedxhacker2                              *
 *    © 2026 Abdul Rehman Rajpoot. All rights reserved.                      *
 *****************************************************************************/

require('dotenv').config();

module.exports = {
  // ── BOT IDENTITY ─────────────────────────────────────────────
  get botName()      { return process.env.BOT_NAME       || '🔥 REDXBOT302 🔥'; },
  get botOwner()     { return process.env.OWNER_NAME     || 'Abdul Rehman Rajpoot'; },
  get ownerNumber()  { return process.env.OWNER_NUMBER   || '923009842133'; },
  get botDesc()      { return process.env.BOT_DESC       || 'Powered by REDXBOT302 🔥'; },
  get version()      { return process.env.BOT_VERSION    || 'v7.0 ULTRA'; },

  // ── BOT SETTINGS ──────────────────────────────────────────────
  get prefixes()     { return [process.env.PREFIX || '.']; },
  get prefix()       { return process.env.PREFIX         || '.'; },
  get mode()         { return process.env.BOT_MODE       || 'public'; },
  get platform()     { return process.env.PLATFORM       || 'heroku'; },

  // ── MEDIA ─────────────────────────────────────────────────────
  get botDp()        { return process.env.MENU_IMAGE     || 'https://files.catbox.moe/dfseqs.jpg'; },
  get menuImage()    { return process.env.MENU_IMAGE     || 'https://files.catbox.moe/dfseqs.jpg'; },

  // ── LINKS ─────────────────────────────────────────────────────
  get whatsappGroup(){ return process.env.WA_GROUP       || 'https://chat.whatsapp.com/LhSmx2SeXX75r8I2bxsNDo'; },
  get telegramGroup(){ return process.env.TG_GROUP       || 'https://t.me/TeamRedxhacker2'; },
  get repoLink()     { return process.env.REPO_LINK      || 'https://github.com/AbdulRehman19721986/REDXBOT-MD'; },
  get newsletterJid(){ return process.env.NEWSLETTER_JID || '120363405513439052@newsletter'; },

  // ── PAIRING (no SESSION_ID – pair only) ───────────────────────
  get pairingNumber(){ return process.env.PAIRING_NUMBER || process.env.OWNER_NUMBER || '923009842133'; },

  // ── DATABASE ──────────────────────────────────────────────────
  get mongoUrl()     { return process.env.MONGO_URL      || ''; },
  get postgresUrl()  { return process.env.POSTGRES_URL   || ''; },
  get mysqlUrl()     { return process.env.MYSQL_URL      || ''; },
  get sqliteUrl()    { return process.env.DB_URL         || ''; },

  // ── ADMIN PANEL ───────────────────────────────────────────────
  get adminUser()    { return process.env.ADMIN_USERNAME || 'redx'; },
  get adminPass()    { return process.env.ADMIN_PASSWORD || 'redx'; },

  // ── APIS (from verbose-fishstick config) ──────────────────────
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
