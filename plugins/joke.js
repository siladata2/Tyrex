/*****************************************************************************
 *                                                                           *
 *                     Developed By Abdul Rehman Rajpoot                     *
 *                     & Muzamil Khan                                        *
 *                                                                           *
 *****************************************************************************/

const gtts = require('gtts');
const fs = require('fs');
const path = require('path');

const JOKES = [
    "Why don't scientists trust atoms? Because they make up everything!",
    "एक आदमी डॉक्टर के पास गया और बोला – डॉक्टर साहब, मुझे हर रात सपना आता है कि मैं एक कप चाय हूँ। डॉक्टर बोले – अरे यार, तू तो छोड़, चाय की पत्तियाँ कैसी हैं?",
    "What do you call a fake noodle? An impasta!",
    "टीचर: 'तुम्हें पढ़ाई क्यों नहीं करनी?' स्टूडेंट: 'सर, मैं तो किताबें पढ़ता हूँ, पर वो मुझे नहीं पढ़तीं।'",
    "I told my wife she should embrace her mistakes. She gave me a hug."
];

module.exports = {
    command: 'joke',
    aliases: ['humour', 'chutkula'],
    category: 'fun',
    description: '😂 Listen to a random joke in TTS',
    usage: '.joke [language code]',

    async handler(sock, message, args, context) {
        const { chatId, channelInfo } = context;
        let language = args.length && /^[a-z]{2}$/.test(args[args.length - 1]) ? args.pop() : 'en';
        const text = JOKES[Math.floor(Math.random() * JOKES.length)];

        const filePath = path.join(process.cwd(), 'tmp', `joke-${Date.now()}.mp3`);
        if (!fs.existsSync(path.dirname(filePath))) fs.mkdirSync(path.dirname(filePath), { recursive: true });

        try {
            await sock.sendMessage(chatId, { react: { text: '😂', key: message.key } });
            const tts = new gtts(text, language);
            await new Promise((resolve, reject) => tts.save(filePath, (err) => err ? reject(err) : resolve()));
            await sock.sendMessage(chatId, { audio: { url: filePath }, mimetype: 'audio/mpeg', ptt: true, ...channelInfo }, { quoted: message });
        } catch (err) {
            console.error('Joke error:', err);
            await sock.sendMessage(chatId, { text: `❌ Joke failed: ${err.message}`, ...channelInfo }, { quoted: message });
        } finally {
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        }
    }
};
