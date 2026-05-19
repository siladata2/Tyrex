/*****************************************************************************
 *                                                                           *
 *                     Developed By Abdul Rehman Rajpoot                     *
 *                                                            *
 *                                                                           *
 *****************************************************************************/

const gTTS = require('gtts');
const fs = require('fs');
const path = require('path');

module.exports = {
    command: 'tts',
    aliases: ['texttospeech', 'speak'],
    category: 'tools',
    description: 'Convert text to speech and send as an audio message.',
    usage: '.tts <text> [language code]\nExample: .tts Hello world (English)\n.tts Bonjour le monde fr (French)\n.tts سلام دنیا ur (Urdu)',

    async handler(sock, message, args, context) {
        const { chatId, channelInfo } = context;

        if (!args.length) {
            return sock.sendMessage(
                chatId,
                { text: '*Please provide text for TTS.*\nExample: `.tts Hello world`\nWith language: `.tts Hola mundo es`', ...channelInfo },
                { quoted: message }
            );
        }

        let language = 'en';
        // If last argument is a 2-letter language code, use it
        if (args.length > 1 && /^[a-z]{2}$/.test(args[args.length - 1])) {
            language = args.pop();
        }

        const text = args.join(' ').trim();
        const tempDir = path.join(process.cwd(), 'tmp');
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
        const filePath = path.join(tempDir, `tts-${Date.now()}.mp3`);

        try {
            // Generate TTS file
            await new Promise((resolve, reject) => {
                const tts = new gTTS(text, language);
                tts.save(filePath, (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });

            // Send the audio
            await sock.sendMessage(chatId, {
                audio: { url: filePath },
                mimetype: 'audio/mpeg',
                fileName: 'tts.mp3',
                ...channelInfo
            }, { quoted: message });

        } catch (err) {
            console.error('TTS error:', err.message);
            await sock.sendMessage(
                chatId,
                { text: `❌ Failed to generate TTS audio.\nReason: ${err.message}`, ...channelInfo },
                { quoted: message }
            );
        } finally {
            // Clean up
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        }
    }
};
