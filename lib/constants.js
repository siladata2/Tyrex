// lib/constants.js — TYREX_KSH MD Global Constants — TYREX_KSH TECH
// ⚠️  All JIDs/links pulled from settings.js — edit there only
'use strict';
const settings = require('../settings');

module.exports = {
  /* ── Owner JIDs ──────────────────────────────────────────── */
  get CHANNEL_JID()    { return settings.channelJid; },
  get CHANNEL_JID_ALT() { return '120363421404091643@newsletter'; },
  get HOME_GROUP_JID() { return settings.whatsappGroup.replace('https://chat.whatsapp.com/', '') + '@g.us'; },
  OWNER_NUMBER: '255610744352',
  get OWNER_JID() { return `${this.OWNER_NUMBER}@s.whatsapp.net`; },

  /* ── Bot Info ─────────────────────────────────────────────── */
  BOT_NAME:   'TYREX_KSH MD',
  BOT_VERSION: '1.0.0',
  get GITHUB_URL()    { return settings.githubRepo || 'https://github.com/Sila-Md'; },
  get PAIR_URL()      { return settings.pairSite; },
  get VPS_URL()       { return settings.vpsLink; },
  get CHANNEL_URL()   { return settings.channelLink; },
  get GROUP_URL()     { return settings.whatsappGroup || 'https://chat.whatsapp.com/IS276Wg9zcuCnJRiMDI64g'; },
  OWNER_NAME: 'TYREX_KSH TECH',

  /* ── Multi-Channel Support ───────────────────────────────── */
  // Bot supports BOTH channels simultaneously
  CHANNEL_JIDS: [
    '120363429539292697@newsletter',
    '120363421404091643@newsletter'
  ],

  /* ── Newsletter contextInfo (ready-to-spread) ────────────── */
  get channelInfo() { return settings.channelInfo; },

  /* ── Helpers ──────────────────────────────────────────────── */
  async notifyChannel(sock, text, image) {
    // Send to BOTH channels
    for (const jid of this.CHANNEL_JIDS) {
      try {
        const msg = image
          ? { image: { url: image }, caption: text }
          : { text };
        await sock.sendMessage(jid, msg);
      } catch {}
    }
  },
  async notifyGroup(sock, text, image) {
    try {
      const msg = image
        ? { image: { url: image }, caption: text }
        : { text };
      await sock.sendMessage(settings.whatsappGroup.includes('@g.us')
        ? settings.whatsappGroup
        : null, msg);
    } catch {}
  },
  async notifyOwner(sock, text) {
    try { await sock.sendMessage(`255610744352@s.whatsapp.net`, { text }); } catch {}
  },

  /* ── Branding Footer ──────────────────────────────────────── */
  FOOTER: 'Powered By TYREX_KSH TECH',
};