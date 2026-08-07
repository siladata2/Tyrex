/**
 * REDXBOT302 — Group Events (Welcome / Goodbye)
 * Fixed: Per-participant try/catch, welcome/goodbye respect group settings
 */

'use strict';

const path = require('path');
const store = require('./lightweight_store');
const { loadUserGroupData, isWelcomeOn, isGoodByeOn } = require('./index');

module.exports = async function GroupEvents(conn, update, config = {}) {
  try {
    const {
      botName       = '🔥 REDXBOT302 🔥',
      ownerName     = 'Abdul Rehman Rajpoot',
      menuImage     = 'https://files.catbox.moe/s36b12.jpg',
      newsletterJid = '120363405513439052@newsletter',
    } = config;

    const { id, participants, action } = update;
    if (!id || !Array.isArray(participants) || !action) return;

    // Check if welcome/goodbye is enabled for this group
    let welcomeEnabled = false;
    let goodbyeEnabled = false;
    try {
      welcomeEnabled = await isWelcomeOn(id);
      goodbyeEnabled = await isGoodByeOn(id);
    } catch { welcomeEnabled = false; goodbyeEnabled = false; }

    // Only proceed if the relevant feature is enabled
    const needsWelcome = (action === 'add' || action === 'invite') && welcomeEnabled;
    const needsGoodbye = (action === 'remove' || action === 'leave') && goodbyeEnabled;
    const needsPromote = action === 'promote';
    const needsDemote  = action === 'demote';

    if (!needsWelcome && !needsGoodbye && !needsPromote && !needsDemote) return;

    // Get group info
    let groupName = id;
    let groupSize = 0;
    try {
      const meta = await conn.groupMetadata(id);
      groupName  = meta.subject || id;
      groupSize  = meta.participants.length;
    } catch {}

    const ctxInfo = {
      forwardingScore: 999,
      isForwarded: true,
      forwardedNewsletterMessageInfo: {
        newsletterJid,
        newsletterName: `🔥 ${botName}`,
        serverMessageId: 200,
      },
    };

    for (const rawJid of participants) {
      // Baileys sometimes emits participant objects ({id, admin}) instead of plain jid strings
      const jid = typeof rawJid === 'string'
        ? rawJid
        : (rawJid && (rawJid.id || rawJid.jid)) || null;

      if (!jid || typeof jid !== 'string') {
        console.error(`[GroupEvents] Skipping ${action}: unresolved jid`, rawJid);
        continue;
      }

      try {
        const num = jid.split('@')[0];

        if (needsWelcome) {
          await conn.sendMessage(id, {
            image: { url: menuImage },
            caption:
`╔══════════════════════════╗
║  👋 *WELCOME TO THE GROUP* ║
╚══════════════════════════╝

Welcome @${num}! 🎉

📌 *Group:* ${groupName}
👥 *Members:* ${groupSize}

📖 *Group Rules:*
• Be respectful to everyone
• No spam or flooding
• No bad words or NSFW content
• Follow admin instructions

💡 Type *${process.env.PREFIX || '.'}menu* to see bot commands.

> 🔥 Powered by ${botName}
> By ${ownerName}`,
            mentions: [jid],
            contextInfo: ctxInfo,
          });

        } else if (needsGoodbye) {
          await conn.sendMessage(id, {
            text:
`╔══════════════════════════╗
║  😢 *GOODBYE!*             ║
╚══════════════════════════╝

@${num} has left the group.

📌 *Group:* ${groupName}
👥 *Members now:* ${Math.max(0, groupSize - 1)}

We will miss you! Come back anytime. 🙏

> 🔥 Powered by ${botName}`,
            mentions: [jid],
            contextInfo: ctxInfo,
          });

        } else if (needsPromote) {
          await conn.sendMessage(id, {
            text:
`🎊 *ADMIN PROMOTED!*

@${num} is now a group admin! 👑

Congratulations! 🎉

> 🔥 ${botName}`,
            mentions: [jid],
            contextInfo: ctxInfo,
          });

        } else if (needsDemote) {
          await conn.sendMessage(id, {
            text:
`📢 *ADMIN DEMOTED*

@${num} is no longer an admin.

> 🔥 ${botName}`,
            mentions: [jid],
            contextInfo: ctxInfo,
          });
        }

      } catch (e) {
        console.error(`[GroupEvents] Error handling ${action} for ${jid}:`, e.message);
      }
    }

  } catch (e) {
    console.error('[GroupEvents] Fatal error:', e.message);
  }
};
