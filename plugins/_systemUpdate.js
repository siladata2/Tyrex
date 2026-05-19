/*****************************************************************************
 *  .update — OWNER-ONLY SYSTEM UPDATE COMMAND (HIDDEN FROM MENU)           *
 *  © 2026 Abdul Rehman Rajpoot. All rights reserved.                       *
 *****************************************************************************/

'use strict';

const path = require('path');

let _autoUpdate;
try { _autoUpdate = require('../lib/autoUpdate'); } catch {}

module.exports = {
  pattern:   'update',
  alias:     ['checkupdate', 'botupdate'],
  desc:      '',           // empty = hidden from menu listings
  category:  'system',
  ownerOnly: true,

  async execute(conn, msg, { from, isOwner, reply }) {
    if (!isOwner) return;

    if (!_autoUpdate) {
      return reply('❌ Auto-update module not loaded.');
    }

    await reply('🔄 *Checking for updates…* Please wait.');

    try {
      const baseDir = path.join(__dirname, '..');
      const result  = await _autoUpdate.checkForUpdates(baseDir);

      if (result.updated > 0) {
        return reply(
          `✅ *Update complete!*\n` +
          `📦 *Files updated:* ${result.updated}\n` +
          `🕐 *Checked at:* ${result.ts}\n\n` +
          `> Bot plugins have been hot-reloaded automatically.`
        );
      } else if (result.status === 'up_to_date') {
        return reply(
          `✅ *Already up to date!*\n` +
          `🕐 *Last checked:* ${result.ts}`
        );
      } else {
        return reply(
          `⚠️ *Update status:* \`${result.status}\`\n` +
          `${result.error ? `❌ Error: ${result.error}` : ''}`
        );
      }
    } catch (e) {
      return reply(`❌ Update failed: ${e.message}`);
    }
  },
};
