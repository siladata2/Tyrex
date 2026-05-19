const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const fs = require('fs');
const path = require('path');
const { randomBytes } = require('crypto');
const ffmpeg = require('fluent-ffmpeg');

const TMP_DIR = path.join(process.cwd(), 'tmp');
if (!fs.existsSync(TMP_DIR)) {
    fs.mkdirSync(TMP_DIR, { recursive: true });
}

module.exports = {
    command: 'toaudio',
    aliases: ['vid2mp3', 'video2audio'],
    category: 'converter',
    description: 'Convert a video to audio (MP3). Reply to a video message.',
    usage: '.toaudio (reply to a video)',
    
    async handler(sock, message, args, context) {
        const { chatId, channelInfo } = context;
        
        // Check if the message is a reply to a video
        const quotedMsg = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        if (!quotedMsg) {
            return sock.sendMessage(chatId, {
                text: '❌ Please reply to a video message.',
                ...channelInfo
            }, { quoted: message });
        }

        // Get video message from quoted
        let videoMessage = quotedMsg.videoMessage;
        if (!videoMessage) {
            return sock.sendMessage(chatId, {
                text: '❌ The replied message is not a video.',
                ...channelInfo
            }, { quoted: message });
        }

        try {
            // Send initial status
            await sock.sendMessage(chatId, {
                text: '⏳ Downloading video...',
                ...channelInfo
            }, { quoted: message });

            // Download the video
            const stream = await downloadContentFromMessage(videoMessage, 'video');
            const chunks = [];
            for await (const chunk of stream) {
                chunks.push(chunk);
            }
            const videoData = Buffer.concat(chunks);

            // Save to temp file
            const ext = videoMessage.mimetype?.split('/')[1] || 'mp4';
            const videoPath = path.join(TMP_DIR, `${randomBytes(4).toString('hex')}.${ext}`);
            fs.writeFileSync(videoPath, videoData);

            await sock.sendMessage(chatId, {
                text: '⏳ Converting to audio...',
                ...channelInfo
            }, { quoted: message });

            // Output audio path
            const audioPath = path.join(TMP_DIR, `${randomBytes(4).toString('hex')}.mp3`);

            // Convert using ffmpeg
            await new Promise((resolve, reject) => {
                ffmpeg(videoPath)
                    .toFormat('mp3')
                    .audioBitrate(128)
                    .on('end', resolve)
                    .on('error', reject)
                    .save(audioPath);
            });

            // Read the converted audio
            const audioBuffer = fs.readFileSync(audioPath);

            // Send the audio
            await sock.sendMessage(chatId, {
                audio: audioBuffer,
                mimetype: 'audio/mpeg',
                fileName: `audio_${Date.now()}.mp3`,
                caption: '✅ Converted to audio',
                ...channelInfo
            }, { quoted: message });

            // Cleanup temp files
            fs.unlink(videoPath, () => {});
            fs.unlink(audioPath, () => {});

        } catch (err) {
            console.error('ToAudio error:', err);
            await sock.sendMessage(chatId, {
                text: `❌ Error: ${err.message}`,
                ...channelInfo
            }, { quoted: message });
        }
    }
};
