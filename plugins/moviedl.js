'use strict';
// .movie — search + numbered-selector download, via arslan-apis-v2
const axios = require('axios');
const { registerHandler } = require('../lib/selectionHandler');

const SEARCH_API = 'https://arslan-apis-v2.vercel.app/movie/moviesearch';
const DL_API     = 'https://arslan-apis-v2.vercel.app/movie/moviesdl';
const TTL_MS     = 3 * 60 * 1000;

// key: `${chatId}:${senderId}` -> { items, expiresAt }
const pending = new Map();
function cleanExpired() {
  const now = Date.now();
  for (const [k, v] of pending) if (v.expiresAt < now) pending.delete(k);
}
function parseSize(s) {
  const m = /([\d.]+)\s*(mb|gb)/i.exec(s || '');
  if (!m) return 0;
  let n = parseFloat(m[1]);
  if (/gb/i.test(m[2])) n *= 1024;
  return n;
}

// Fires on any plain "1".."9" reply — wired centrally in index.js via
// lib/selectionHandler so multiple features (this, quiz, menus, etc.) can
// all claim numeric replies without stepping on each other.
registerHandler({
  name: 'movie-select',
  async check(sock, message, context, number) {
    cleanExpired();
    const chatId   = context.chatId || message.key.remoteJid;
    const senderId = message.key.participant || message.key.remoteJid;
    const key      = `${chatId}:${senderId}`;
    const state    = pending.get(key);
    if (!state) return false;                              // no pending movie search for this user — let other handlers try
    if (number < 1 || number > state.items.length) return false;

    pending.delete(key);
    const item = state.items[number - 1];
    await sock.sendMessage(chatId, { text: `⏳ Fetching *${item.title}*...` }, { quoted: message });

    try {
      const { data } = await axios.get(DL_API, { params: { url: item.url }, timeout: 30000 });
      if (!data?.status || !data.result) throw new Error('No download data returned');
      const r = data.result;
      const downloads = r.downloads || [];
      if (!downloads.length) throw new Error('No downloadable links found for this title');

      // Pick the largest available quality — "highest" isn't labeled
      // consistently across titles, but file size is a reliable proxy.
      const best = downloads.reduce((a, b) => parseSize(b.size) > parseSize(a.size) ? b : a, downloads[0]);
      const safeName = (r.movieName || item.title).replace(/[\\/:*?"<>|]/g, '').slice(0, 80);

      await sock.sendMessage(chatId, {
        document: { url: best.url },
        mimetype: 'video/mp4',
        fileName: `${safeName}.mp4`,
        caption: `🎬 *${r.movieName || item.title}*\n⭐ ${r.rating || 'N/A'} | 📅 ${r.releaseDate || 'N/A'}\n📦 ${best.size || 'Unknown size'}`,
      }, { quoted: message });
    } catch (e) {
      await sock.sendMessage(chatId, { text: `❌ Failed to fetch download: ${e.message}` }, { quoted: message });
    }
    return true; // handled — stop the selection chain either way
  },
});

module.exports = {
  command: 'movie',
  aliases: ['moviedl', 'film', 'movies'],
  category: 'download',
  description: 'Search movies and download by picking a number (1-9)',
  usage: '.movie <movie name>',

  async handler(sock, message, args, context = {}) {
    const chatId   = context.chatId || message.key.remoteJid;
    const senderId = message.key.participant || message.key.remoteJid;
    const query    = args.join(' ').trim();
    if (!query) return sock.sendMessage(chatId, { text: '🎬 *Movie Downloader*\n\nUsage: .movie <movie name>' }, { quoted: message });

    await sock.sendMessage(chatId, { text: `🔎 Searching *${query}*...` }, { quoted: message });
    try {
      const { data } = await axios.get(SEARCH_API, { params: { q: query }, timeout: 30000 });
      if (!data?.status || !data.result?.length) return sock.sendMessage(chatId, { text: '❌ No movies found for that search.' }, { quoted: message });

      const items = data.result.slice(0, 9);
      pending.set(`${chatId}:${senderId}`, { items, expiresAt: Date.now() + TTL_MS });

      const list = items.map((m, i) => `*${i + 1}.* ${m.title}`).join('\n\n');
      await sock.sendMessage(chatId, {
        text: `🎬 *Results for "${query}"*\n\n${list}\n\n👉 Reply with a number (1-${items.length}) to download that one.\n⏱️ Expires in 3 min.`,
      }, { quoted: message });
    } catch (e) {
      await sock.sendMessage(chatId, { text: `❌ Search failed: ${e.message}` }, { quoted: message });
    }
  },
};
