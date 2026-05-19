// plugins/prayer.js
const axios = require('axios');

module.exports = {
  command: 'jadwalsholat',
  aliases: ['prayer', 'sholat'],
  category: 'info',
  description: 'Get daily prayer times for a city (pakistan)',
  usage: '.jadwalsholat <city> (default: Jakarta)',

  async handler(sock, message, args, context) {
    const { chatId } = context;
    let city = args.join(' ') || 'Jakarta';
    try {
      const url = `https://api.deline.web.id/info/jadwalsholat?kota=${encodeURIComponent(city)}`;
      const { data } = await axios.get(url, { timeout: 10000 });
      if (!data.status) throw new Error(data.error || 'City not found');
      const r = data.result;
      const text = `🕌 *Jadwal Sholat* – ${r.lokasi}\n📅 ${r.tanggal} (${r.hijri})\n\n` +
        `🕋 Imsak : ${r.waktu.Imsak}\n` +
        `🌅 Subuh : ${r.waktu.Fajr}\n` +
        `☀️ Dhuhr : ${r.waktu.Dhuhr}\n` +
        `🌇 Asr   : ${r.waktu.Asr}\n` +
        `🌙 Maghrib: ${r.waktu.Maghrib}\n` +
        `🌃 Isha  : ${r.waktu.Isha}\n`;
      await sock.sendMessage(chatId, { text }, { quoted: message });
    } catch (err) {
      sock.sendMessage(chatId, { text: `❌ Could not fetch prayer times: ${err.message}` }, { quoted: message });
    }
  }
};
