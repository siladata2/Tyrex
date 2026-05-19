/*****************************************************************************
 *                                                                           *
 *                     Developed By Abdul Rehman Rajpoot                     *
 *                     & Muzamil Khan                                        *
 *                                                                           *
 *****************************************************************************/

const gtts = require('gtts');
const fs = require('fs');
const path = require('path');

// 50+ Shayari in Hindi, Urdu, and English
const SHAYARI = [
    // Hindi (1-20)
    "मोहब्बत में हमने तुम्हें दिल दिया, तुमने क्या दिया? एक धोखा दिया, एक सज़ा दिया।",
    "हर किसी को मुकम्मल जहाँ नहीं मिलता, किसी को ख़ुशी तो किसी को जहर का प्याला मिलता है।",
    "उनकी आँखों में बसा कर देखा, तो पता चला कि वो किसी और के लिए धड़कती हैं।",
    "दिल टूटा तो एहसास हुआ, कि हर मोहब्बत का अंजाम अलग होता है।",
    "हम उनसे मिलने को तरस गए, और वो हमसे मिलकर भी खो गए।",
    "तेरी यादों ने ऐसा जादू किया, हर घड़ी तेरा ही ख्याल आया।",
    "बहुत खूबसूरत थी वो शाम, जब तुम मिले थे हमसे, अब तो हर शाम तुम्हारी याद लाती है।",
    "कभी हँसते हैं तो कभी रोते हैं, तेरे बिना हम क्या करते हैं?",
    "दिल की बात जुबां पर नहीं लाते, तुम्हें देखकर मुस्कुरा देते हैं।",
    "तेरी आँखों में खो जाने का दिल करता है, तेरे बिना जीने का मन नहीं करता।",
    "इश्क़ में हम तुम्हें क्या बताएँ, दिल का हाल जुबां पर नहीं आता।",
    "तेरे बिना हर लम्हा अधूरा है, तू ही मेरी ज़िन्दगी का सहारा है।",
    "दिल की धड़कन तुम हो, साँसों में बसी खुशबू तुम हो।",
    "तेरे इश्क़ में हम दीवाने हो गए, तेरे लिए हम पागल हो गए।",
    "हम तो तुम्हारे हो गए, अब और किसी के नहीं।",
    "तेरे बिना जीना सीखा है, तू न हो तो क्या होगा?",
    "तेरी यादों का सहारा लिए बैठे हैं, तू आए तो जिएं वरना मर जाएँ।",
    "तेरे इश्क़ ने हमें क्या बना दिया, दुनिया से बेगाना कर दिया।",
    "हम तुम्हें भूल जाएँ ऐसा हो न सके, तुम्हारे बिना हम कहाँ टिक सके?",
    "तेरी बातों में वो मिठास है, जैसे गुलाब में खुशबू का एहसास।",

    // Urdu (21-35)
    "उनकी यादों ने हमें तरसाया, रात भर जागकर हमने गुज़ारा।",
    "दिल में बसा लिया तुमको, अब निकालना मुश्किल है।",
    "तेरे प्यार में हमने दुनिया भुला दी, तू ही मेरी ज़िन्दगी बन गया।",
    "हम तो तेरे दीवाने हैं, तू समझे न समझे, हम तो तेरे दीवाने हैं।",
    "तेरी एक मुस्कान पे हम वारे जाएँ, तेरे लिए हम जान भी दे दें।",
    "दिल की बात छुपाई नहीं जाती, तुझसे मिलने की तमन्ना सताती है।",
    "तेरे इश्क़ ने हमें पागल कर दिया, हर घड़ी तेरा ही ख़याल रहता है।",
    "तेरी आँखों में डूबने का दिल करता है, तेरे बिना अब जीने का मन नहीं करता।",
    "तेरे बिना हर लम्हा सून है, तू ही मेरी दुनिया का रौशन चाँद है।",
    "तेरी हँसी मेरी दवा है, तेरा दर्द मेरा इलाज़ है।",
    "तेरे ख़त में लिखा था कि तुम आओगे, हमने राहें तक लीं, तुम न आए।",
    "बिछड़कर भी तेरे पास रहते हैं, ये दिल क्या जाने कैसे कहते हैं।",
    "तेरी याद ने जगाया रात भर, हम सोचते रहे तू क्यों नहीं मिला।",
    "तेरा दर्द बहुत है सीने में, फिर भी हम मुस्कुरा रहे हैं।",
    "तेरी बेरुखी ने मार डाला, हम तो तेरे लिए ही थे।",

    // English (36-50)
    "You are the sunshine of my life, without you everything is grey.",
    "In your eyes I found my home, in your arms I'll never roam.",
    "Every moment with you is a treasure, your love is my only pleasure.",
    "You are the poetry my heart writes, the melody that fills my nights.",
    "When you smile, the world smiles with me, your love sets my spirit free.",
    "I never knew love until you came, now I'll never be the same.",
    "You are the dream I never want to wake, the love my soul will always take.",
    "Your voice is music to my ears, your touch erases all my fears.",
    "With you, every day is spring, your love makes my heart sing.",
    "You are the star that guides my way, with you, I want to stay.",
    "My heart beats only for you, everything I am, I give to you.",
    "You are the reason I believe in love, a gift sent from above.",
    "In your eyes I see forever, in your heart we'll be together.",
    "Your love is like a gentle rain, washing away all my pain.",
    "You are the one I've waited for, my heart's open door."
];

module.exports = {
    command: 'shayari',
    aliases: ['sher', 'poetry', 'kavita'],
    category: 'fun',
    description: '🎤 Hear a beautiful shayari/poem in TTS (reply with number to select)',
    usage: '.shayari [number]',

    async handler(sock, message, args, context) {
        const { chatId, channelInfo, senderId } = context;
        const input = args[0]?.toLowerCase();

        // If no args or not a number, show list
        if (!args.length || isNaN(parseInt(input))) {
            // Show numbered list (first 20)
            const list = SHAYARI.map((s, i) => `${i+1}. ${s.substring(0, 30)}...`).slice(0, 20).join('\n');
            const caption = `🎤 *SHAYARI LIST (1-${SHAYARI.length})*\n\n${list}\n\n_Reply with a number to hear that shayari._`;
            
            if (!global.shayariSessions) global.shayariSessions = {};
            global.shayariSessions[chatId] = {
                userId: senderId,
                list: SHAYARI,
                timestamp: Date.now()
            };

            return await sock.sendMessage(chatId, {
                text: caption,
                ...channelInfo
            }, { quoted: message });
        }

        // Handle number selection
        const num = parseInt(input);
        if (isNaN(num) || num < 1 || num > SHAYARI.length) {
            return await sock.sendMessage(chatId, {
                text: `❌ Invalid number. Please enter a number between 1 and ${SHAYARI.length}.`,
                ...channelInfo
            }, { quoted: message });
        }

        const text = SHAYARI[num - 1];
        // Detect language: if text contains Devanagari, use hi; if contains Arabic script, use ur; else en
        let language = 'hi';
        if (/[a-zA-Z]/.test(text) && !/[ऀ-ॿ]/.test(text)) {
            language = 'en';
        } else if (/[\u0600-\u06FF]/.test(text)) {
            language = 'ur';
        }

        const filePath = path.join(process.cwd(), 'tmp', `shayari-${Date.now()}.mp3`);
        if (!fs.existsSync(path.dirname(filePath))) fs.mkdirSync(path.dirname(filePath), { recursive: true });

        try {
            await sock.sendMessage(chatId, { react: { text: '🎤', key: message.key } });
            const tts = new gtts(text, language);
            await new Promise((resolve, reject) => tts.save(filePath, (err) => err ? reject(err) : resolve()));
            await sock.sendMessage(chatId, {
                audio: { url: filePath },
                mimetype: 'audio/mpeg',
                ptt: true,
                ...channelInfo
            }, { quoted: message });
        } catch (err) {
            console.error('Shayari error:', err);
            await sock.sendMessage(chatId, {
                text: `❌ Failed to generate audio: ${err.message}`,
                ...channelInfo
            }, { quoted: message });
        } finally {
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        }
    }
};
