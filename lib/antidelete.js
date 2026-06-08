/*****************************************************************************
 *  REDXBOT302 — lib/antidelete.js
 *  Bridge: re-exports the antidelete plugin with permission fixes:
 *   ✅ ownerOnly forced to FALSE — group admins + all users can use .antidelete
 *   ✅ Handler wraps the original to also allow group admins to toggle it
 *   ✅ storeMessage / handleMessageRevocation / loadConfig / saveConfig unchanged
 *****************************************************************************/

'use strict';

const plugin = require('../plugins/antidelete');

// Wrap the handler: allow group admin OR owner to use .antidelete on/off/delpath
// Any user can still view .antidelete status
const _originalHandler = plugin.handler.bind(plugin);

async function permissionAwareHandler(sock, message, args, context = {}) {
  const action = (args[0] || '').toLowerCase().trim();
  const isOwner = context.isOwner || context.senderIsOwnerOrSudo || false;
  const isAdmin = context.isAdmin || false;

  // Read-only commands: anyone can use them
  const readOnly = ['status', '', undefined];
  const isReadOnly = readOnly.includes(action);

  // Write commands require owner OR group admin
  if (!isReadOnly && !isOwner && !isAdmin) {
    const chatId = context.chatId || message.key.remoteJid;
    await sock.sendMessage(chatId, {
      text: '❌ Only the bot owner or a group admin can change antidelete settings.'
    }, { quoted: message });
    return;
  }

  return _originalHandler(sock, message, args, context);
}

module.exports = {
  // Force ownerOnly OFF so the command is visible and reachable by everyone
  ...plugin,
  ownerOnly: false,
  handler: permissionAwareHandler,
};
