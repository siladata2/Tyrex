/*****************************************************************************
 *                                                                           *
 *                     Developed By Abdul Rehman Rajpoot                     *
 *                                                            *
 *                                                                           *
 *****************************************************************************/

const axios = require('axios');
const FormData = require('form-data');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const store = require('../lib/lightweight_store');

// Fish Audio API (for voice cloning)
const FISH_API_KEY = '10af77300da14d0fb520eee5f06462aa';
const FISH_API_BASE = 'https://api.fish.audio/v1';

// Google Translate TTS (free, no key)
const GOOGLE_TTS_URL = 'https://translate.google.com/translate_tts';

module.exports = {
    command: 'tts2',
    aliases: ['voiceclone', 'fishaudio', 'say'],
    category: 'ai',
    description: 'Text to speech with voice cloning (supports Urdu/Hindi)',
    usage: 
        '.tts2 speak <text>                – English TTS\n' +
        '.tts2 speak-urdu <text>            – Urdu/Hindi TTS\n' +
        '.tts2 clone <name>                  – Clone voice from replied audio\n' +
        '.tts2 list-voices                    – List your cloned voices\n' +
        '.tts2 speak-cloned <name> <text>     – Use cloned voice\n' +
        '.tts2 delete <name>                   – Delete a cloned voice\n' +
        '.tts2 guide                           – Detailed guide',
    ownerOnly: false,

    async handler(sock, message, args, context) {
        const chatId = context.chatId || message.key.remoteJid;
        const senderId = (context.senderId || message.key.participant || message.key.remoteJid).split(':')[0];
        const channelInfo = context.channelInfo || {};

        const logAndReply = async (msg, isError = false) => {
            console.log(`[TTS2] ${msg}`);
            await sock.sendMessage(chatId, { 
                text: isError ? `❌ ${msg}` : `✅ ${msg}`, 
                ...channelInfo 
            }, { quoted: message });
        };

        if (args.length === 0) {
            return await sock.sendMessage(chatId, {
                text: `🎤 *TTS2 Voice Commands*

• \`.tts2 speak Hello world\` – English TTS
• \`.tts2 speak-urdu سلام دنیا\` – Urdu/Hindi TTS
• \`.tts2 clone MyVoice\` – Clone from replied audio
• \`.tts2 list-voices\` – Your cloned voices
• \`.tts2 speak-cloned MyVoice Hello\` – Use cloned voice
• \`.tts2 delete MyVoice\` – Delete a voice
• \`.tts2 guide\` – Detailed instructions`,
                ...channelInfo
            }, { quoted: message });
        }

        const subCmd = args[0].toLowerCase();

        // ==================== GUIDE ====================
        if (subCmd === 'guide') {
            return await sock.sendMessage(chatId, {
                text: `🎤 *TTS2 Voice Guide*

1. **Basic TTS (Free)**:
   • English: \`.tts2 speak Hello world\`
   • Urdu/Hindi: \`.tts2 speak-urdu سلام دنیا\`

2. **Voice Cloning**:
   • Send any voice note/audio
   • Reply with \`.tts2 clone VoiceName\`
   • Wait 10-20 seconds for processing

3. **Use Cloned Voice**:
   • \`.tts2 speak-cloned VoiceName Hello\`

4. **List Voices**: \`.tts2 list-voices\`

5. **Delete Voice**: \`.tts2 delete VoiceName\`

*Uses Fish Audio (20k credits/month) + Google TTS (free)*`,
                ...channelInfo
            }, { quoted: message });
        }

        // ==================== BASIC ENGLISH TTS (Google) ====================
        if (subCmd === 'speak') {
            if (args.length < 2) {
                return await logAndReply('Usage: `.tts2 speak Hello world`', true);
            }
            const text = args.slice(1).join(' ');

            await logAndReply('Generating English speech...');

            try {
                const url = `${GOOGLE_TTS_URL}?ie=UTF-8&q=${encodeURIComponent(text)}&tl=en&client=tw-ob`;
                
                const response = await axios.get(url, {
                    responseType: 'arraybuffer',
                    headers: { 'User-Agent': 'Mozilla/5.0' },
                    timeout: 15000
                });

                const audioBuffer = Buffer.from(response.data);

                await sock.sendMessage(chatId, {
                    audio: audioBuffer,
                    mimetype: 'audio/mpeg',
                    ptt: false,
                    caption: `🔊 "${text}"`,
                    ...channelInfo
                }, { quoted: message });

            } catch (error) {
                console.error('[TTS2] English TTS error:', error);
                await logAndReply(`Failed: ${error.message}`, true);
            }
            return;
        }

        // ==================== URDU/HINDI TTS (Google) ====================
        if (subCmd === 'speak-urdu') {
            if (args.length < 2) {
                return await logAndReply('Usage: `.tts2 speak-urdu آپ کیسے ہیں`', true);
            }
            const text = args.slice(1).join(' ');

            await logAndReply('Generating Urdu speech...');

            try {
                const url = `${GOOGLE_TTS_URL}?ie=UTF-8&q=${encodeURIComponent(text)}&tl=ur&client=tw-ob`;
                
                const response = await axios.get(url, {
                    responseType: 'arraybuffer',
                    headers: { 'User-Agent': 'Mozilla/5.0' },
                    timeout: 15000
                });

                const audioBuffer = Buffer.from(response.data);

                await sock.sendMessage(chatId, {
                    audio: audioBuffer,
                    mimetype: 'audio/mpeg',
                    ptt: false,
                    caption: `🔊 "${text}"`,
                    ...channelInfo
                }, { quoted: message });

            } catch (error) {
                console.error('[TTS2] Urdu TTS error:', error);
                await logAndReply(`Failed: ${error.message}`, true);
            }
            return;
        }

        // ==================== VOICE CLONING ====================
        if (subCmd === 'clone') {
            if (args.length < 2) {
                return await logAndReply('Please provide a name for the cloned voice.', true);
            }
            const voiceName = args.slice(1).join(' ').trim();

            // Check if replied to an audio message
            const quotedMsg = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
            const isAudio = quotedMsg?.audioMessage || quotedMsg?.voiceMessage;
            if (!isAudio) {
                return await logAndReply('Please reply to an audio/voice message to clone.', true);
            }

            await logAndReply('Downloading reference audio...');

            try {
                // Download the audio
                const buffer = await downloadMediaMessage(
                    { 
                        key: { 
                            id: message.message.extendedTextMessage.contextInfo.stanzaId,
                            remoteJid: message.key.remoteJid,
                            fromMe: false
                        },
                        message: quotedMsg 
                    },
                    'buffer',
                    {}
                );

                await logAndReply('Uploading to Fish Audio for cloning...');

                // Prepare multipart form
                const form = new FormData();
                form.append('name', voiceName);
                form.append('audio', buffer, 'reference.mp3');
                form.append('visibility', 'private');

                const response = await axios.post(`${FISH_API_BASE}/voices`, form, {
                    headers: {
                        ...form.getHeaders(),
                        'Authorization': `Bearer ${FISH_API_KEY}`,
                    },
                    timeout: 60000,
                });

                const voice = response.data;
                await logAndReply(`✅ Voice cloned!\nName: ${voice.name}\nID: ${voice.voiceId}\n\nUse: .tts2 speak-cloned ${voice.name} <text>`);
                
            } catch (error) {
                console.error('[TTS2] Clone error:', error.response?.data || error.message);
                await logAndReply(`Clone failed: ${error.response?.data?.message || error.message}`, true);
            }
            return;
        }

        // ==================== LIST VOICES ====================
        if (subCmd === 'list-voices') {
            try {
                const response = await axios.get(`${FISH_API_BASE}/voices`, {
                    headers: { 'Authorization': `Bearer ${FISH_API_KEY}` },
                    timeout: 10000
                });
                const voices = response.data;
                
                if (!voices.length) {
                    return await logAndReply('No saved voices. Clone one first with `.tts2 clone <name>`');
                }
                
                let msg = '🗣️ *Your Voices*\n\n';
                voices.forEach(v => {
                    msg += `• ${v.name}\n`;
                });
                await logAndReply(msg);
                
            } catch (error) {
                await logAndReply(`Failed to list voices: ${error.message}`, true);
            }
            return;
        }

        // ==================== SPEAK WITH CLONED VOICE ====================
        if (subCmd === 'speak-cloned') {
            if (args.length < 3) {
                return await logAndReply('Usage: `.tts2 speak-cloned VoiceName Hello world`', true);
            }
            const voiceName = args[1];
            const text = args.slice(2).join(' ');

            await logAndReply(`Generating speech with voice "${voiceName}"...`);

            try {
                // First get voice ID
                const list = await axios.get(`${FISH_API_BASE}/voices`, {
                    headers: { 'Authorization': `Bearer ${FISH_API_KEY}` }
                });
                const voice = list.data.find(v => v.name.toLowerCase() === voiceName.toLowerCase());
                
                if (!voice) {
                    return await logAndReply(`Voice "${voiceName}" not found. Use .tts2 list-voices`, true);
                }

                // Synthesize
                const response = await axios.post(`${FISH_API_BASE}/tts`, {
                    text: text,
                    voiceId: voice.voiceId,
                    format: 'mp3',
                }, {
                    headers: {
                        'Authorization': `Bearer ${FISH_API_KEY}`,
                        'Content-Type': 'application/json',
                    },
                    responseType: 'arraybuffer',
                    timeout: 30000,
                });

                const audioBuffer = Buffer.from(response.data);

                await sock.sendMessage(chatId, {
                    audio: audioBuffer,
                    mimetype: 'audio/mpeg',
                    ptt: false,
                    caption: `🔊 "${voiceName}" says: ${text}`,
                    ...channelInfo
                }, { quoted: message });

            } catch (error) {
                console.error('[TTS2] Speak cloned error:', error);
                await logAndReply(`Failed: ${error.message}`, true);
            }
            return;
        }

        // ==================== DELETE VOICE ====================
        if (subCmd === 'delete') {
            if (args.length < 2) {
                return await logAndReply('Please specify voice name to delete.', true);
            }
            const voiceName = args.slice(1).join(' ').trim();

            try {
                const list = await axios.get(`${FISH_API_BASE}/voices`, {
                    headers: { 'Authorization': `Bearer ${FISH_API_KEY}` }
                });
                const voice = list.data.find(v => v.name.toLowerCase() === voiceName.toLowerCase());
                
                if (!voice) {
                    return await logAndReply(`Voice "${voiceName}" not found.`, true);
                }
                
                await axios.delete(`${FISH_API_BASE}/voices/${voice.voiceId}`, {
                    headers: { 'Authorization': `Bearer ${FISH_API_KEY}` }
                });
                
                await logAndReply(`Voice "${voiceName}" deleted.`);
                
            } catch (error) {
                await logAndReply(`Delete failed: ${error.message}`, true);
            }
            return;
        }

        await logAndReply('Unknown command. Use `.tts2 guide` for help.', true);
    }
};
