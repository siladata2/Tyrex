'use strict';
/**
 * 🔥 REDXMINIBOT ULTRA v8.0 — Settings & Config
 * Edit this file OR use environment variables (.env)
 */

module.exports = {
  // ── Bot Identity ──────────────────────────────────────────
  BOT_NAME:      process.env.BOT_NAME      || '🔥 REDXMINIBOT ULTRA 🔥',
  OWNER_NAME:    process.env.OWNER_NAME    || 'Abdul Rehman Rajpoot',
  OWNER_NUMBER:  process.env.OWNER_NUMBER  || '923009842133',
  CO_OWNER_NAME: process.env.CO_OWNER_NAME || 'Muzamil Khan',
  CO_OWNER_NUM:  process.env.CO_OWNER_NUM  || '923183928892',

  // ── Prefix ────────────────────────────────────────────────
  PREFIX: process.env.PREFIX || '.',

  // ── Bot Mode: 'public' (all users) | 'private' (owner only)
  BOT_MODE: process.env.BOT_MODE || 'public',

  // ── Menu / Thumbnail Image ────────────────────────────────
  MENU_IMAGE: process.env.MENU_IMAGE || 'https://files.catbox.moe/s36b12.jpg',

  // ── Links ─────────────────────────────────────────────────
  REPO_LINK:       process.env.REPO_LINK       || 'https://github.com/AbdulRehman19721986/REDXBOT-MD',
  WA_GROUP:        process.env.WA_GROUP        || 'https://chat.whatsapp.com/LhSmx2SeXX75r8I2bxsNDo',
  TG_GROUP:        process.env.TG_GROUP        || 'https://t.me/TeamRedxhacker2',
  CHANNEL_LINK:    process.env.CHANNEL_LINK    || 'https://whatsapp.com/channel/0029VbCkm3rAe5VzCYLtNb2u',

  // ── WhatsApp Newsletter / Channel JID ─────────────────────
  // To get your JID: share your channel link, open in browser,
  // the number in the URL becomes the JID (append @newsletter)
  NEWSLETTER_JID:  process.env.NEWSLETTER_JID  || '120363405513439052@newsletter',
  NEWSLETTER_NAME: process.env.NEWSLETTER_NAME || '🔥 REDXMINIBOT ULTRA',

  // ── Auto Features ─────────────────────────────────────────
  AUTO_STATUS_SEEN:  process.env.AUTO_STATUS_SEEN  !== 'false',  // view statuses
  AUTO_STATUS_REACT: process.env.AUTO_STATUS_REACT !== 'false',  // react to statuses
  AUTO_CHANNEL_FOLLOW: process.env.AUTO_CHANNEL_FOLLOW !== 'false', // auto-follow channel on pair

  // ── Admin Panel ───────────────────────────────────────────
  ADMIN_USERNAME: process.env.ADMIN_USERNAME || 'redx',
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || 'redx302ultra',

  // ── Server ────────────────────────────────────────────────
  PORT: parseInt(process.env.PORT) || 3000,

  // ── Connection Tuning ─────────────────────────────────────
  CONNECT_TIMEOUT_MS:       35000,
  KEEP_ALIVE_INTERVAL_MS:   10000,
  QUERY_TIMEOUT_MS:         35000,
  MAX_RECONNECT_ATTEMPTS:   12,
  RECONNECT_BASE_DELAY_MS:  2000,
  MAX_RECONNECT_DELAY_MS:   25000,
};
