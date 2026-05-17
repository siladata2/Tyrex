'use strict';
/**
 * 🔥 REDXMINIBOT ULTRA — Group Admin Plugins
 */

const nlCtxBase = () => ({
  forwardingScore: 999, isForwarded: true,
  forwardedNewsletterMessageInfo: { newsletterJid: process.env.NEWSLETTER_JID || '120363405513439052@newsletter', newsletterName: '🔥 REDXMINIBOT ULTRA', serverMessageId: -1 },
});

async function getGroupMeta(conn, from) {
  try { return await conn.groupMetadata(from); } catch { return null; }
}

async function isUserAdmin(conn, from, jid) {
  const meta = await getGroupMeta(conn, from);
  if (!meta) return false;
  const p = meta.participants.find(p => p.id === jid);
  return p?.admin === 'admin' || p?.admin === 'superadmin';
}

const kick = {
  pattern: 'kick',
  description: 'Kick member from group',
  execute: async (conn, msg, m, opts) => {
    const { from, sender, reply, isGroup, isAdmin, isOwner, botName } = opts;
    if (!isGroup) return reply('❌ This command is for groups only!');
    const botJid = conn.user?.id;
    const botAdmin = await isUserAdmin(conn, from, botJid);
    if (!isAdmin && !isOwner) return reply(`╭━[ 🚫 *ACCESS* ]━⊷\n┃ ❌ You must be an admin!\n╰━━━━━━━━━━━━⊷`);
    if (!botAdmin) return reply(`╭━[ 🚫 *BOT ACCESS* ]━⊷\n┃ ❌ Make bot admin first!\n╰━━━━━━━━━━━━⊷`);
    const target = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
    if (!target) return reply(`Usage: ${opts.prefix}kick @user`);
    await conn.groupParticipantsUpdate(from, [target], 'remove');
    reply(`╭━[ 👢 *KICKED* ]━⊷\n┃ @${target.split('@')[0]} was kicked!\n╰━━━━━━━━━━━━⊷\n> 🔥 ${botName}`, { mentions: [target] });
  },
};

const promote = {
  pattern: 'promote',
  description: 'Promote to admin',
  execute: async (conn, msg, m, opts) => {
    const { from, reply, isGroup, isAdmin, isOwner, botName } = opts;
    if (!isGroup) return reply('❌ Groups only!');
    if (!isAdmin && !isOwner) return reply('❌ Admins only!');
    const target = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
    if (!target) return reply(`Usage: ${opts.prefix}promote @user`);
    await conn.groupParticipantsUpdate(from, [target], 'promote');
    reply(`╭━[ ⬆️ *PROMOTED* ]━⊷\n┃ @${target.split('@')[0]} is now admin!\n╰━━━━━━━━━━━━⊷\n> 🔥 ${botName}`, { mentions: [target] });
  },
};

const demote = {
  pattern: 'demote',
  description: 'Remove admin',
  execute: async (conn, msg, m, opts) => {
    const { from, reply, isGroup, isAdmin, isOwner, botName } = opts;
    if (!isGroup) return reply('❌ Groups only!');
    if (!isAdmin && !isOwner) return reply('❌ Admins only!');
    const target = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
    if (!target) return reply(`Usage: ${opts.prefix}demote @user`);
    await conn.groupParticipantsUpdate(from, [target], 'demote');
    reply(`╭━[ ⬇️ *DEMOTED* ]━⊷\n┃ @${target.split('@')[0]}'s admin removed!\n╰━━━━━━━━━━━━⊷\n> 🔥 ${botName}`, { mentions: [target] });
  },
};

const mute = {
  pattern: 'mute',
  description: 'Mute group',
  execute: async (conn, msg, m, opts) => {
    const { from, reply, isGroup, isAdmin, isOwner, botName } = opts;
    if (!isGroup) return reply('❌ Groups only!');
    if (!isAdmin && !isOwner) return reply('❌ Admins only!');
    await conn.groupSettingUpdate(from, 'announcement');
    reply(`╭━[ 🔇 *MUTED* ]━⊷\n┃ Group muted! Only admins can send messages.\n╰━━━━━━━━━━━━⊷\n> 🔥 ${botName}`);
  },
};

const unmute = {
  pattern: 'unmute',
  description: 'Unmute group',
  execute: async (conn, msg, m, opts) => {
    const { from, reply, isGroup, isAdmin, isOwner, botName } = opts;
    if (!isGroup) return reply('❌ Groups only!');
    if (!isAdmin && !isOwner) return reply('❌ Admins only!');
    await conn.groupSettingUpdate(from, 'not_announcement');
    reply(`╭━[ 🔊 *UNMUTED* ]━⊷\n┃ Group unmuted! Everyone can now send messages.\n╰━━━━━━━━━━━━⊷\n> 🔥 ${botName}`);
  },
};

const groupinfo = {
  pattern: 'groupinfo',
  description: 'Group information',
  execute: async (conn, msg, m, opts) => {
    const { from, reply, isGroup, botName } = opts;
    if (!isGroup) return reply('❌ Groups only!');
    const meta = await getGroupMeta(conn, from);
    if (!meta) return reply('❌ Cannot get group info.');
    const admins = meta.participants.filter(p=>p.admin).map(p=>`@${p.id.split('@')[0]}`).join(', ');
    const created = new Date(meta.creation * 1000).toLocaleDateString();
    reply(`╭━[ 👥 *GROUP INFO* ]━⊷\n┃ 📌 *Name:* ${meta.subject}\n┃ 👥 *Members:* ${meta.participants.length}\n┃ 👑 *Admins:* ${admins}\n┃ 📅 *Created:* ${created}\n┃ 📜 *Description:*\n┃ ${meta.desc||'No description'}\n╰━━━━━━━━━━━━⊷\n> 🔥 ${botName}`);
  },
};

const tagall = {
  pattern: 'tagall',
  description: 'Tag all members',
  execute: async (conn, msg, m, opts) => {
    const { from, reply, isGroup, isAdmin, isOwner, q, botName } = opts;
    if (!isGroup) return reply('❌ Groups only!');
    if (!isAdmin && !isOwner) return reply('❌ Admins only!');
    const meta  = await getGroupMeta(conn, from);
    if (!meta) return reply('❌ Cannot get group info.');
    const mentions = meta.participants.map(p=>p.id);
    const tags = mentions.map(j=>`@${j.split('@')[0]}`).join(' ');
    await conn.sendMessage(from, {
      text: `╭━[ 📢 *TAG ALL* ]━⊷\n┃ ${q||'Hey everyone!'}\n┃\n┃ ${tags}\n╰━━━━━━━━━━━━⊷\n> 🔥 ${botName}`,
      mentions,
      contextInfo: nlCtxBase(),
    }, { quoted: msg });
  },
};

const link = {
  pattern: 'link',
  description: 'Get group invite link',
  execute: async (conn, msg, m, opts) => {
    const { from, reply, isGroup, isAdmin, isOwner, botName } = opts;
    if (!isGroup) return reply('❌ Groups only!');
    if (!isAdmin && !isOwner) return reply('❌ Admins only!');
    try {
      const code = await conn.groupInviteCode(from);
      reply(`╭━[ 🔗 *GROUP LINK* ]━⊷\n┃ https://chat.whatsapp.com/${code}\n╰━━━━━━━━━━━━⊷\n> 🔥 ${botName}`);
    } catch { reply('❌ Could not get group link. Make bot admin!'); }
  },
};

module.exports = [kick, promote, demote, mute, unmute, groupinfo, tagall, link];
