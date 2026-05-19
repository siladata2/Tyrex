// plugins/gdrive.js
const axios = require('axios');

module.exports = {
  command: 'gdrive',
  aliases: ['googledrive', 'gdrivedown'],
  category: 'download',
  description: 'Get direct download link for Google Drive files',
  usage: '.gdrive <drive URL>',

  async handler(sock, message, args, context) {
    const { chatId } = context;
    const url = args[0]?.trim();
    if (!url || !url.includes('drive.google.com')) {
      return sock.sendMessage(chatId, {
        text: '📁 *Google Drive Downloader*\n\nProvide a Google Drive share link.\nExample: .gdrive https://drive.google.com/file/d/...'
      }, { quoted: message });
    }

    await sock.sendMessage(chatId, { react: { text: '📂', key: message.key } });

    try {
      const apiUrl = `https://api.deline.web.id/downloader/gdrive?url=${encodeURIComponent(url)}`;
      const { data } = await axios.get(apiUrl, { timeout: 15000 });
      if (!data.status || !data.result?.downloadUrl) {
        throw new Error(data.error || 'No download link');
      }

      const { downloadUrl, fileName, fileSize, mimetype } = data.result;
      const caption = `📁 *${fileName}*\n📦 Size: ${fileSize}\n🔗 [Direct Download](${downloadUrl})\n\n_Note: Click the link to download. File type: ${mimetype || 'unknown'}_`;

      await sock.sendMessage(chatId, { text: caption }, { quoted: message });
    } catch (err) {
      console.error('GDrive error:', err);
      sock.sendMessage(chatId, { text: `❌ Failed: ${err.message}` }, { quoted: message });
    }
  }
};
