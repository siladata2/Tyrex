// plugins/terabox.js
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const APIS = [
  {
    name: 'Qasimdev',
    fetch: async (url) => {
      const apiUrl = `https://api.qasimdev.dpdns.org/api/terabox/download?apiKey=qasim-dev&url=${encodeURIComponent(url)}`;
      const { data } = await axios.get(apiUrl, { timeout: 30000 });
      if (!data.success || !data.data?.files?.length) throw new Error('No files');
      return data.data;
    }
  },
  {
    name: 'Deline',
    fetch: async (url) => {
      const apiUrl = `https://api.deline.web.id/downloader/terabox?url=${encodeURIComponent(url)}`;
      const { data } = await axios.get(apiUrl, { timeout: 20000 });
      if (!data.status || !data.result?.files?.length) throw new Error('No files');
      return {
        files: data.result.files,
        totalFiles: data.result.files.length,
        thumbnail: data.result.thumbnail
      };
    }
  }
];

async function downloadFile(url, filepath) {
  const response = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: 600000,
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
    headers: { 'User-Agent': 'Mozilla/5.0' }
  });
  fs.writeFileSync(filepath, response.data);
}

module.exports = {
  command: 'terabox',
  aliases: ['tera', 'tbox', 'tbdl'],
  category: 'download',
  description: 'Download files from TeraBox',
  usage: '.terabox <terabox link>',

  async handler(sock, message, args, context) {
    const chatId = context.chatId || message.key.remoteJid;
    const url = args.join(' ').trim();

    if (!url) {
      return sock.sendMessage(chatId, { text: '📦 *TeraBox Downloader*\n\nUsage: .terabox <terabox link>' }, { quoted: message });
    }

    if (!/terabox\.com|1024terabox\.com|teraboxapp\.com|terabox\.app/i.test(url)) {
      return sock.sendMessage(chatId, { text: '❌ *Invalid TeraBox link!*' }, { quoted: message });
    }

    await sock.sendMessage(chatId, { text: '⏳ *Processing TeraBox link...*' }, { quoted: message });

    let fileData = null;
    let lastError = null;

    for (const api of APIS) {
      try {
        fileData = await api.fetch(url);
        break;
      } catch (err) {
        console.log(`${api.name} failed:`, err.message);
        lastError = err;
      }
    }

    if (!fileData) {
      return sock.sendMessage(chatId, { text: `❌ Failed: ${lastError?.message || 'All APIs failed'}` }, { quoted: message });
    }

    const files = fileData.files;
    const totalFiles = fileData.totalFiles || files.length;
    const file = files[0];
    const title = file.title || 'Untitled';
    const size = file.size || 'Unknown';
    const downloadUrl = file.downloadUrl || file.url;
    const fileType = file.type || 'unknown';

    await sock.sendMessage(chatId, {
      text: `📦 *TeraBox File*\n\n📄 *Name:* ${title}\n📊 *Size:* ${size}\n📁 *Type:* ${fileType}\n📂 *Total Files:* ${totalFiles}\n\n⏳ *Downloading...*`
    }, { quoted: message });

    const tempDir = path.join(process.cwd(), 'tmp');
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
    const filename = `${Date.now()}_${title.replace(/[^a-z0-9.]/gi, '_').slice(0, 100)}`;
    const filePath = path.join(tempDir, filename);

    try {
      await downloadFile(downloadUrl, filePath);
      const stats = fs.statSync(filePath);
      const sizeMB = stats.size / (1024 * 1024);
      if (sizeMB > 100) {
        fs.unlinkSync(filePath);
        return sock.sendMessage(chatId, { text: `❌ File too large! (${sizeMB.toFixed(2)}MB > 100MB limit)` }, { quoted: message });
      }

      const ext = title.split('.').pop().toLowerCase();
      const buffer = fs.readFileSync(filePath);
      const videoExts = ['mp4', 'mkv', 'avi', 'mov', 'wmv', 'flv', 'webm', '3gp'];
      const audioExts = ['mp3', 'wav', 'aac', 'flac', 'm4a', 'ogg', 'opus'];
      const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'];

      const caption = `✅ *Download Complete!*\n\n📄 *File:* ${title}\n📊 *Size:* ${size}\n\n> *_Downloaded from TeraBox_*`;

      if (videoExts.includes(ext)) {
        await sock.sendMessage(chatId, { video: buffer, mimetype: 'video/mp4', fileName: title, caption }, { quoted: message });
      } else if (audioExts.includes(ext)) {
        await sock.sendMessage(chatId, { audio: buffer, mimetype: 'audio/mpeg', fileName: title }, { quoted: message });
        await sock.sendMessage(chatId, { text: caption }, { quoted: message });
      } else if (imageExts.includes(ext)) {
        await sock.sendMessage(chatId, { image: buffer, caption }, { quoted: message });
      } else {
        await sock.sendMessage(chatId, { document: buffer, mimetype: 'application/octet-stream', fileName: title, caption }, { quoted: message });
      }

      fs.unlinkSync(filePath);
      if (totalFiles > 1) {
        await sock.sendMessage(chatId, { text: `ℹ️ This TeraBox link contains ${totalFiles} files. Only the first file was downloaded.` }, { quoted: message });
      }
    } catch (err) {
      console.error('Terabox download error:', err);
      sock.sendMessage(chatId, { text: `❌ Download failed: ${err.message}` }, { quoted: message });
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
  }
};
