'use strict';
/**
 * 🔥 REDXMINIBOT ULTRA — Downloader Plugins
 * YouTube MP3/MP4 · TikTok · Facebook
 */

const axios = require('axios').default;

const nlCtxBase = () => ({
  forwardingScore: 999, isForwarded: true,
  forwardedNewsletterMessageInfo: { newsletterJid: process.env.NEWSLETTER_JID || '120363405513439052@newsletter', newsletterName: '🔥 REDXMINIBOT ULTRA', serverMessageId: -1 },
});

// ── YOUTUBE SEARCH ─────────────────────────────────────────
const ytsearch = {
  pattern: 'ytsearch',
  description: 'Search YouTube',
  execute: async (conn, msg, m, opts) => {
    const { q, reply, botName } = opts;
    if (!q) return reply(`Usage: ${opts.prefix}ytsearch <query>`);
    try {
      const ytSearch = require('yt-search');
      await conn.sendMessage(opts.from, { react: { text: '🔍', key: msg.key } }).catch(()=>{});
      const { videos } = await ytSearch(q);
      if (!videos.length) return reply('❌ No results found.');
      const top = videos.slice(0, 5);
      const text = top.map((v,i) =>
        `*${i+1}.* ${v.title}\n   ⏱ ${v.duration.timestamp} | 👁 ${(v.views||0).toLocaleString()} views\n   🔗 ${v.url}`
      ).join('\n\n');
      reply(`╭━[ 🔍 *YOUTUBE SEARCH* ]━⊷\n┃ Query: ${q}\n┃\n┃ ${text.split('\n').join('\n┃ ')}\n╰━━━━━━━━━━━━━━━━━━━━━━━━⊷\n> 🔥 ${botName}`);
    } catch(e) { reply(`❌ Search error: ${e.message}`); }
  },
};

// ── YOUTUBE MP3 ────────────────────────────────────────────
const ytmp3 = {
  pattern: 'ytmp3',
  description: 'YouTube Audio Download',
  execute: async (conn, msg, m, opts) => {
    const { q, reply, from, botName } = opts;
    if (!q) return reply(`Usage: ${opts.prefix}ytmp3 <YouTube URL or search term>`);
    await conn.sendMessage(from, { react: { text: '⏳', key: msg.key } }).catch(()=>{});
    try {
      let url = q;
      if (!url.includes('youtube.com') && !url.includes('youtu.be')) {
        const ytSearch = require('yt-search');
        const { videos } = await ytSearch(q);
        if (!videos.length) return reply('❌ No results found.');
        url = videos[0].url;
        reply(`╭━[ 🎵 *DOWNLOADING* ]━⊷\n┃ 📌 ${videos[0].title}\n┃ ⏱ ${videos[0].duration.timestamp}\n┃ ⏳ Please wait...\n╰━━━━━━━━━━━━⊷`);
      }

      const ytdl = require('@distube/ytdl-core');
      const info  = await ytdl.getInfo(url);
      const title = info.videoDetails.title;
      const dur   = info.videoDetails.lengthSeconds;

      if (parseInt(dur) > 600) return reply('❌ Video too long! Max 10 minutes for audio.');

      const stream  = ytdl(url, { quality: 'highestaudio', filter: 'audioonly' });
      const chunks  = [];
      for await (const c of stream) chunks.push(c);
      const buffer  = Buffer.concat(chunks);

      await conn.sendMessage(from, {
        audio: buffer,
        mimetype: 'audio/mp4',
        ptt: false,
        fileName: `${title}.mp4`,
        contextInfo: { ...nlCtxBase(), externalAdReply: { title: `🎵 ${title}`, body: `Duration: ${Math.floor(dur/60)}m ${dur%60}s`, mediaType: 1 } },
      }, { quoted: msg });

      await conn.sendMessage(from, { react: { text: '✅', key: msg.key } }).catch(()=>{});
    } catch(e) {
      await conn.sendMessage(from, { react: { text: '❌', key: msg.key } }).catch(()=>{});
      reply(`╭━[ ❌ *DOWNLOAD FAILED* ]━⊷\n┃ ${e.message}\n╰━━━━━━━━━━━━⊷`);
    }
  },
};

// ── YOUTUBE MP4 ────────────────────────────────────────────
const ytmp4 = {
  pattern: 'ytmp4',
  description: 'YouTube Video Download',
  execute: async (conn, msg, m, opts) => {
    const { q, reply, from, botName } = opts;
    if (!q) return reply(`Usage: ${opts.prefix}ytmp4 <YouTube URL or search term>`);
    await conn.sendMessage(from, { react: { text: '⏳', key: msg.key } }).catch(()=>{});
    try {
      let url = q;
      if (!url.includes('youtube.com') && !url.includes('youtu.be')) {
        const ytSearch = require('yt-search');
        const { videos } = await ytSearch(q);
        if (!videos.length) return reply('❌ No results found.');
        url = videos[0].url;
      }

      const ytdl = require('@distube/ytdl-core');
      const info  = await ytdl.getInfo(url);
      const title = info.videoDetails.title;
      const dur   = info.videoDetails.lengthSeconds;

      if (parseInt(dur) > 300) return reply('❌ Video too long! Max 5 minutes for video.');

      reply(`╭━[ 📹 *DOWNLOADING* ]━⊷\n┃ 📌 ${title}\n┃ ⏱ ${Math.floor(dur/60)}m ${dur%60}s\n┃ ⏳ Please wait...\n╰━━━━━━━━━━━━⊷`);

      const stream  = ytdl(url, { quality: 'highestvideo', filter: 'videoandaudio' });
      const chunks  = [];
      for await (const c of stream) chunks.push(c);
      const buffer  = Buffer.concat(chunks);

      await conn.sendMessage(from, {
        video: buffer,
        mimetype: 'video/mp4',
        fileName: `${title}.mp4`,
        caption: `╭━[ 📹 *YOUTUBE VIDEO* ]━⊷\n┃ 📌 ${title}\n┃ ⏱ ${Math.floor(dur/60)}m ${dur%60}s\n╰━━━━━━━━━━━━⊷\n> 🔥 ${botName}`,
        contextInfo: nlCtxBase(),
      }, { quoted: msg });

      await conn.sendMessage(from, { react: { text: '✅', key: msg.key } }).catch(()=>{});
    } catch(e) {
      await conn.sendMessage(from, { react: { text: '❌', key: msg.key } }).catch(()=>{});
      reply(`╭━[ ❌ *DOWNLOAD FAILED* ]━⊷\n┃ ${e.message}\n╰━━━━━━━━━━━━⊷`);
    }
  },
};

// ── TIKTOK ────────────────────────────────────────────────
const tiktok = {
  pattern: 'tiktok',
  description: 'Download TikTok video',
  execute: async (conn, msg, m, opts) => {
    const { q, reply, from, botName } = opts;
    if (!q || !q.includes('tiktok')) return reply(`Usage: ${opts.prefix}tiktok <TikTok URL>`);
    await conn.sendMessage(from, { react: { text: '⏳', key: msg.key } }).catch(()=>{});
    try {
      const r = await axios.get(`https://api.tikmate.app/api/lookup?url=${encodeURIComponent(q)}`, { timeout: 20000 });
      const data = r.data;
      if (!data?.token) throw new Error('Could not parse TikTok link');
      const dlUrl = `https://tikmate.app/download/${data.token}/${data.id}.mp4`;
      const vidR  = await axios.get(dlUrl, { responseType: 'arraybuffer', timeout: 60000 });
      const buf   = Buffer.from(vidR.data);
      await conn.sendMessage(from, {
        video: buf,
        mimetype: 'video/mp4',
        caption: `╭━[ 🎵 *TIKTOK* ]━⊷\n┃ ✅ No watermark!\n╰━━━━━━━━━━━━⊷\n> 🔥 ${botName}`,
        contextInfo: nlCtxBase(),
      }, { quoted: msg });
      await conn.sendMessage(from, { react: { text: '✅', key: msg.key } }).catch(()=>{});
    } catch(e) {
      await conn.sendMessage(from, { react: { text: '❌', key: msg.key } }).catch(()=>{});
      reply(`❌ TikTok download failed: ${e.message}`);
    }
  },
};

// ── INSTAGRAM ─────────────────────────────────────────────
const instagram = {
  pattern: 'ig',
  description: 'Instagram download',
  execute: async (conn, msg, m, opts) => {
    const { q, reply, from, botName } = opts;
    if (!q || !q.includes('instagram')) return reply(`Usage: ${opts.prefix}ig <Instagram URL>`);
    await conn.sendMessage(from, { react: { text: '⏳', key: msg.key } }).catch(()=>{});
    try {
      const r = await axios.get(`https://api.rbeats.in/instagram?url=${encodeURIComponent(q)}`, { timeout: 30000 });
      const data = r.data;
      const url  = data?.url || data?.download_url || data?.video_url;
      if (!url) throw new Error('No download URL found');
      const vidR = await axios.get(url, { responseType: 'arraybuffer', timeout: 60000 });
      const buf  = Buffer.from(vidR.data);
      await conn.sendMessage(from, {
        video: buf,
        mimetype: 'video/mp4',
        caption: `╭━[ 📸 *INSTAGRAM* ]━⊷\n┃ ✅ Downloaded!\n╰━━━━━━━━━━━━⊷\n> 🔥 ${botName}`,
        contextInfo: nlCtxBase(),
      }, { quoted: msg });
      await conn.sendMessage(from, { react: { text: '✅', key: msg.key } }).catch(()=>{});
    } catch(e) {
      await conn.sendMessage(from, { react: { text: '❌', key: msg.key } }).catch(()=>{});
      reply(`❌ Instagram download failed: ${e.message}`);
    }
  },
};

module.exports = [ytsearch, ytmp3, ytmp4, tiktok, instagram];
