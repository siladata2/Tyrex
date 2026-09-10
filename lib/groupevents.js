/**
 * 𝐒𝐈𝐋𝐀 𝐗 𝐌𝐈𝐍𝐈 — Group Events (Welcome / Goodbye)
 * Fixed: Per-participant try/catch, welcome/goodbye respect group settings
 * 𝐏𝐨𝐰𝐞𝐫𝐝 𝐁𝐲 𝐒𝐢𝐥𝐚 𝐓𝐞𝐜𝐡
 */

'use strict';

const path = require('path');
const store = require('./lightweight_store');
const { loadUserGroupData, isWelcomeOn, isGoodByeOn } = require('./index');

// ── UNIQUE SYMBOLS ──────────────────────────────────────────
const SYM = {
  gem: '𖭧', diamond: '𖤍', star: '𖥔', leaf: '𖧧',
  heart: '𖩘', arrow: '𖪊', flower: '𖫓', dot: '𖠋',
  cross: '𖨆', bullet: '𖣂', circle: '𖦹', wave: '𖬺'
};

module.exports = async function GroupEvents(conn, update, config = {}) {
  try {
    const {
      botName       = '𝐒𝐈𝐋𝐀 𝐗 𝐌𝐈𝐍𝐈',
      ownerName     = 'Richard Besisila',
      menuImage     = 'https://i.ibb.co/Gf4fr5BS/silaxmini.jpg',
      newsletterJid = '120363402325089913@newsletter',
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
        newsletterName: botName,
        serverMessageId: 200,
      },
    };

    for (const rawJid of participants) {
      const jid = typeof rawJid === 'string'
        ? rawJid
        : (rawJid && (rawJid.id || rawJid.jid)) || null;

      if (!jid || typeof jid !== 'string') {
        console.error(`[GroupEvents] Skipping ${action}: unresolved jid`, rawJid);
        continue;
      }

      try {
        const num = jid.split('@')[0];
        const prefix = process.env.PREFIX || '.';

        if (needsWelcome) {
          const welcomeMsg =
            `${SYM.gem} Welcome to ${groupName}\n` +
            `\n` +
            `${SYM.heart} Hello @${num}\n` +
            `\n` +
            `${SYM.dot} Group      ${SYM.arrow} ${groupName}\n` +
            `${SYM.dot} Members    ${SYM.arrow} ${groupSize}\n` +
            `${SYM.dot} Prefix     ${SYM.arrow} ${prefix}\n` +
            `\n` +
            `${SYM.leaf} Group Rules\n` +
            `${SYM.bullet} Be respectful to everyone\n` +
            `${SYM.bullet} No spam or flooding\n` +
            `${SYM.bullet} No bad words or NSFW content\n` +
            `${SYM.bullet} Follow admin instructions\n` +
            `\n` +
            `${SYM.arrow} Type ${prefix}menu to see bot commands\n` +
            `\n` +
            `${SYM.flower} ${botName} — ${ownerName}\n` +
            `𝐏𝐨𝐰𝐞𝐫𝐝 𝐁𝐲 𝐒𝐢𝐥𝐚 𝐓𝐞𝐜𝐡`;

          await conn.sendMessage(id, {
            image: { url: menuImage },
            caption: welcomeMsg,
            mentions: [jid],
            contextInfo: ctxInfo,
          });

        } else if (needsGoodbye) {
          const goodbyeMsg =
            `${SYM.cross} Goodbye\n` +
            `\n` +
            `@${num} has left the group\n` +
            `\n` +
            `${SYM.dot} Group       ${SYM.arrow} ${groupName}\n` +
            `${SYM.dot} Members now ${SYM.arrow} ${Math.max(0, groupSize - 1)}\n` +
            `\n` +
            `${SYM.heart} We will miss you — come back anytime\n` +
            `\n` +
            `${SYM.flower} ${botName}\n` +
            `𝐏𝐨𝐰𝐞𝐫𝐝 𝐁𝐲 𝐒𝐢𝐥𝐚 𝐓𝐞𝐜𝐡`;

          await conn.sendMessage(id, {
            text: goodbyeMsg,
            mentions: [jid],
            contextInfo: ctxInfo,
          });

        } else if (needsPromote) {
          const promoteMsg =
            `${SYM.star} Admin Promoted\n` +
            `\n` +
            `@${num} is now a group admin\n` +
            `\n` +
            `${SYM.gem} Congratulations\n` +
            `\n` +
            `${SYM.flower} ${botName}\n` +
            `𝐏𝐨𝐰𝐞𝐫𝐝 𝐁𝐲 𝐒𝐢𝐥𝐚 𝐓𝐞𝐜𝐡`;

          await conn.sendMessage(id, {
            text: promoteMsg,
            mentions: [jid],
            contextInfo: ctxInfo,
          });

        } else if (needsDemote) {
          const demoteMsg =
            `${SYM.cross} Admin Demoted\n` +
            `\n` +
            `@${num} is no longer an admin\n` +
            `\n` +
            `${SYM.flower} ${botName}\n` +
            `𝐏𝐨𝐰𝐞𝐫𝐝 𝐁𝐲 𝐒𝐢𝐥𝐚 𝐓𝐞𝐜𝐡`;

          await conn.sendMessage(id, {
            text: demoteMsg,
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