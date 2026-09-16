'use strict';
require('dotenv').config();

module.exports = {
  BOT_NAME:    process.env.BOT_NAME    || 'TYREX_KSH MD',
  OWNER_NAME:  process.env.OWNER_NAME  || 'TYREX_KSH TECH',
  OWNER_NAME2: '',
  OWNER_NUM:   process.env.OWNER_NUMBER || '255610744352',
  CO_OWNER:    '',
  PREFIX:      process.env.PREFIX       || '.',
  VERSION:     '1.0.0',
  BOT_IMG:     process.env.MENU_IMAGE   || 'https://files.catbox.moe/p8xi4o.jpeg',
  REPO:        process.env.REPO_LINK    || 'https://github.com/Sila-Md',
  NL_JID:      process.env.NEWSLETTER_JID || '120363421404091643@newsletter',
  WA_GROUP:    'https://chat.whatsapp.com/IS276Wg9zcuCnJRiMDI64g',
  TG_GROUP:    'https://t.me/SilaTech',
};