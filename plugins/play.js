/*****************************************************************************
 *                                                                           *
 *                     Developed By Abdul Rehman Rajpoot                     *
 *                     & Muzamil Khan                                        *
 *                                                                           *
 *  🌐  GitHub   : https://github.com/AbdulRehman19721986/redxbot302          *
 *  ▶️  YouTube  : https://youtube.com/@rootmindtech                         *
 *  💬  WhatsApp : https://whatsapp.com/channel/0029VbCPnYf96H4SNehkev10     *
 *  🔗  Telegram : https://t.me/TeamRedxhacker2                              *
 *                                                                           *
 *    © 2026 Abdul Rehman Rajpoot. All rights reserved.                      *
 *                                                                           *
 *****************************************************************************/

const yts = require('yt-search');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const { fromBuffer } = require('file-type');
const ytdl = require('@distube/ytdl-core'); // faster and more reliable

// 🔧 FFMPEG PATH RESOLUTION
const ffmpegStatic = require('ffmpeg-static');
let ffmpegPath = ffmpegStatic;
if (!ffmpegPath || !fs.existsSync(ffmpegPath)) {
    // fallback to @ffmpeg-installer/ffmpeg if installed
    try {
        const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
        ffmpegPath = ffmpegInstaller.path;
    } catch (e) {
        console.warn('⚠️ FFmpeg binary not found; commands may fail.');
        ffmpegPath = 'ffmpeg'; // hope it's in PATH
    }
}

const execAsync = promisify(exec);
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Format number with commas
 */
function formatNumber(num) {
    return num?.toLocaleString() || 'N/A';
}

/**
 * Convert any audio to MP3 using ffmpeg (ultrafast preset)
 */
async function convertToMp3(inputBuffer, inputExt) {
    const tempDir = path.join(process.cwd(), 'temp');
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

    const id = Date.now();
    const inputPath = path.join(tempDir, `play_in_${id}.${inputExt}`);
    const outputPath = path.join(tempDir, `play_out_${id}.mp3`);

    fs.writeFileSync(inputPath, inputBuffer);

    // Use the resolved ffmpeg path
    await execAsync(`"${ffmpegPath}" -i "${inputPath}" -codec:a libmp3lame -b:a 128k -preset ultrafast "${outputPath}"`, { timeout: 60000 });

    const outputBuffer = fs.readFileSync(outputPath);

    try { fs.unlinkSync(inputPath); } catch {}
    try { fs.unlinkSync(outputPath); } catch {}

    return outputBuffer;
}

/**
 * Download a buffer from a URL with retries and custom headers
 */
async function downloadBuffer(url, retries = 2) {
    let lastError;
    for (let i = 0; i <= retries; i++) {
        try {
            const response = await axios.get(url, {
                responseType: 'arraybuffer',
                timeout: 60000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Referer': 'https://www.youtube.com/',
                    'Accept': '*/*',
                }
            });
            return Buffer.from(response.data);
        } catch (err) {
            lastError = err;
            if (i < retries) await delay(2000);
        }
    }
    throw lastError;
}

/**
 * Method 1: ytdown.to proxy (original)
 */
async function getAudioViaYtdown(url) {
    const { data } = await axios.post('https://app.ytdown.to/proxy.php',
        new URLSearchParams({ url }),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    const api = data.api;
    if (api?.status == 'ERROR') throw new Error(api.message);

    const media = api?.mediaItems?.find(m => m.type.toLowerCase() === 'audio');
    if (!media) throw new Error('Audio media not found');

    // Poll for completion (max 30 attempts = 150 seconds)
    for (let attempts = 0; attempts < 30; attempts++) {
        const { data: res } = await axios.get(media.mediaUrl);
        if (res?.error === 'METADATA_NOT_FOUND') throw new Error('Metadata not found');
        if (res?.percent === 'Completed' && res?.fileUrl !== 'In Processing...') {
            const audioBuffer = await downloadBuffer(res.fileUrl);
            return {
                buffer: audioBuffer,
                info: {
                    title: api.title,
                    thumbnail: api.imagePreviewUrl,
                    duration: media.mediaDuration,
                }
            };
        }
        await delay(5000);
    }
    throw new Error('ytdown.to polling timeout');
}

/**
 * Method 2: ytdl-core direct download
 */
async function getAudioViaYtdl(url) {
    return new Promise(async (resolve, reject) => {
        try {
            // Get video info first
            const info = await ytdl.getInfo(url);
            const title = info.videoDetails.title;
            const thumbnail = info.videoDetails.thumbnails[info.videoDetails.thumbnails.length - 1]?.url || '';
            const duration = info.videoDetails.lengthSeconds;

            // Choose highest quality audio-only format (prefer opus or webm)
            const format = ytdl.chooseFormat(info.formats, { quality: 'highestaudio' });
            if (!format) throw new Error('No audio format found');

            // Download as stream and collect buffer
            const stream = ytdl(url, { format });
            const chunks = [];
            stream.on('data', chunk => chunks.push(chunk));
            stream.on('end', () => {
                const buffer = Buffer.concat(chunks);
                resolve({
                    buffer: buffer,
                    info: {
                        title: title,
                        thumbnail: thumbnail,
                        duration: duration,
                    }
                });
            });
            stream.on('error', reject);
        } catch (err) {
            reject(err);
        }
    });
}

/**
 * Method 3: QasimDev API (fallback)
 */
async function getAudioViaQasimdev(url) {
    const apiUrl = `https://api.qasimdev.dpdns.org/api/loaderto/download?apiKey=qasim-dev&format=mp3&url=${url}`;
    const response = await axios.get(apiUrl, { timeout: 10000 });
    const data = response.data;

    if (!data.success || !data.data?.downloadUrl) {
        throw new Error('QasimDev API returned no download URL');
    }

    // Try the main URL first
    let audioBuffer;
    try {
        audioBuffer = await downloadBuffer(data.data.downloadUrl);
    } catch (err) {
        // If main fails, try alternative URLs
        if (data.data.alternativeUrls && data.data.alternativeUrls.length) {
            let found = false;
            for (const alt of data.data.alternativeUrls) {
                try {
                    audioBuffer = await downloadBuffer(alt.url);
                    found = true;
                    break;
                } catch (e) { /* continue */ }
            }
            if (!found) throw err;
        } else {
            throw err;
        }
    }

    const title = data.data.title || 'audio';

    return {
        buffer: audioBuffer,
        info: {
            title: title,
            thumbnail: data.data.thumbnail || '',
            duration: data.data.duration || 'N/A',
        }
    };
}

module.exports = {
    command: 'play',
    aliases: ['song', 'mp3'],
    category: 'music',
    description: 'Stream audio from YouTube',
    usage: '.play <song name>',

    async handler(sock, message, args, context) {
        const chatId = context.chatId || message.key.remoteJid;
        const channelInfo = context.channelInfo || {};
        const query = args.join(' ');

        if (!query) {
            return await sock.sendMessage(chatId, {
                text: '❌ Please provide a song name!\nExample: .play Moye Moye',
                ...channelInfo
            }, { quoted: message });
        }

        try {
            // React with 🎵 to indicate processing
            await sock.sendMessage(chatId, { react: { text: '🎵', key: message.key } });

            // Search YouTube
            const searchResult = await yts(query);
            const video = searchResult.videos[0];

            if (!video) {
                await sock.sendMessage(chatId, {
                    text: '❌ No results found for your query.',
                    ...channelInfo
                }, { quoted: message });
                return;
            }

            // Build thumbnail caption
            const views = formatNumber(video.views);
            const uploaded = video.uploadDate ? new Date(video.uploadDate).toLocaleDateString() : 'Unknown';
            const duration = video.timestamp || 'N/A';
            const caption = `╔══════════════════╗\n` +
                `║  *🎵 YOUTUBE AUDIO*  ║\n` +
                `╚══════════════════╝\n\n` +
                `📌 *Title:* ${video.title}\n` +
                `👤 *Channel:* ${video.author.name}\n` +
                `⏱️ *Duration:* ${duration}\n` +
                `👀 *Views:* ${views}\n` +
                `📅 *Uploaded:* ${uploaded}\n` +
                `🔗 *URL:* ${video.url}\n\n` +
                `⬇️ *Fetching audio...*`;

            // Send thumbnail with details
            await sock.sendMessage(chatId, {
                image: { url: video.thumbnail },
                caption: caption,
                ...channelInfo
            }, { quoted: message });

            // --- Try multiple methods with fallback ---
            let audioResult;
            let method = 'unknown';
            const errors = [];

            // Method 1: ytdown.to
            try {
                audioResult = await getAudioViaYtdown(video.url);
                method = 'ytdown.to';
            } catch (err1) {
                errors.push(`ytdown.to: ${err1.message}`);
                // Method 2: ytdl-core
                try {
                    audioResult = await getAudioViaYtdl(video.url);
                    method = 'ytdl-core';
                } catch (err2) {
                    errors.push(`ytdl-core: ${err2.message}`);
                    // Method 3: QasimDev API
                    try {
                        audioResult = await getAudioViaQasimdev(video.url);
                        method = 'QasimDev';
                    } catch (err3) {
                        errors.push(`QasimDev: ${err3.message}`);
                        throw new Error(`All methods failed:\n${errors.join('\n')}`);
                    }
                }
            }

            let { buffer: audioBuffer, info } = audioResult;
            let title = info.title.replace(/[^\w\s]/gi, '').substring(0, 100);

            // Detect file type and convert if not MP3
            const fileType = await fromBuffer(audioBuffer);
            let finalBuffer = audioBuffer;
            let ext = fileType?.ext || 'bin';

            if (!fileType || fileType.mime !== 'audio/mpeg') {
                finalBuffer = await convertToMp3(audioBuffer, ext);
            }

            // Send as WhatsApp audio
            await sock.sendMessage(chatId, {
                audio: finalBuffer,
                mimetype: 'audio/mpeg',
                fileName: `${title}.mp3`,
                ...channelInfo
            }, { quoted: message });

            console.log(`✅ Play command succeeded using ${method}`);

        } catch (error) {
            console.error('Play command error:', error);
            await sock.sendMessage(chatId, {
                text: `❌ *Error:* ${error.message}`,
                ...channelInfo
            }, { quoted: message });
        }
    }
};
