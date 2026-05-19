// imagine.js
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { fromBuffer } = require('file-type');

const IMAGE_APIS = [
    { url: 'https://shizoapi.onrender.com/api/ai/imagine', param: 'query', apikey: 'shizo' },
    { url: 'https://api.agaxt.dev/ai/text2img', param: 'text' },
    { url: 'https://api.neoxr.eu/api/text2img', param: 'text' },
    { url: 'https://api.ryzendesu.vip/api/ai/text2img', param: 'text' },
    { url: 'https://api.giftedtech.my.id/api/ai/text2img', param: 'q', apikey: 'gifted' }
];

function enhancePrompt(prompt) {
    const qualityEnhancers = [
        'high quality', 'detailed', 'masterpiece', 'best quality',
        'ultra realistic', '4k', 'highly detailed', 'professional photography',
        'cinematic lighting', 'sharp focus'
    ];
    const numEnhancers = Math.floor(Math.random() * 2) + 3;
    const selected = qualityEnhancers.sort(() => Math.random() - 0.5).slice(0, numEnhancers);
    return `${prompt}, ${selected.join(', ')}`;
}

module.exports = {
    command: 'imagine',
    aliases: ['aiimage', 'draw', 'genimage'],
    category: 'ai',
    description: 'Generate an AI image based on your prompt',
    usage: '.imagine <prompt>',

    async handler(sock, message, args, context = {}) {
        const chatId = context.chatId || message.key.remoteJid;
        const prompt = args.join(' ').trim();

        if (!prompt) {
            await sock.sendMessage(chatId, {
                text: '🎨 *AI IMAGE GENERATOR*\n\n' +
                      'Please provide a prompt.\n' +
                      'Example: `.imagine a beautiful sunset over mountains`'
            }, { quoted: message });
            return;
        }

        // Send initial status
        const statusMsg = await sock.sendMessage(chatId, {
            text: `🎨 Generating image for:\n"${prompt}"\n\n⏳ This may take 30-60 seconds...`
        }, { quoted: message });

        try {
            const enhancedPrompt = enhancePrompt(prompt);
            let imageBuffer = null;
            let lastError = null;

            for (const api of IMAGE_APIS) {
                try {
                    let url;
                    if (api.apikey) {
                        url = `${api.url}?${api.param}=${encodeURIComponent(enhancedPrompt)}&apikey=${api.apikey}`;
                    } else {
                        url = `${api.url}?${api.param}=${encodeURIComponent(enhancedPrompt)}`;
                    }

                    const response = await axios.get(url, {
                        timeout: 45000,
                        responseType: 'arraybuffer',
                        headers: { 'User-Agent': 'Mozilla/5.0' }
                    });

                    const contentType = response.headers['content-type'];
                    if (contentType && contentType.startsWith('image/')) {
                        imageBuffer = Buffer.from(response.data);
                        break;
                    }

                    // Try to parse as JSON
                    let jsonData;
                    try {
                        jsonData = JSON.parse(response.data.toString());
                    } catch (e) {
                        continue;
                    }

                    // Look for image URL or base64
                    let imgUrl = jsonData?.imageUrl || jsonData?.result || jsonData?.data?.imageUrl ||
                                 jsonData?.url || jsonData?.image || jsonData?.download;
                    if (imgUrl && typeof imgUrl === 'string' && imgUrl.startsWith('http')) {
                        const imgRes = await axios.get(imgUrl, { responseType: 'arraybuffer', timeout: 20000 });
                        imageBuffer = Buffer.from(imgRes.data);
                        break;
                    }
                    // If base64 image in response
                    if (jsonData?.image && typeof jsonData.image === 'string') {
                        const base64Data = jsonData.image.replace(/^data:image\/\w+;base64,/, '');
                        imageBuffer = Buffer.from(base64Data, 'base64');
                        break;
                    }
                } catch (e) {
                    lastError = e;
                    console.log(`[IMAGINE] API ${api.url} failed: ${e.message}`);
                }
            }

            if (!imageBuffer) {
                throw new Error(lastError?.message || 'All image APIs failed');
            }

            const type = await fromBuffer(imageBuffer);
            if (!type || !type.mime.startsWith('image/')) {
                throw new Error('Received data is not a valid image');
            }

            await sock.sendMessage(chatId, {
                image: imageBuffer,
                caption: `🎨 *Generated Image*\n\nPrompt: ${prompt}`
            }, { quoted: message });

            await sock.sendMessage(chatId, { delete: statusMsg.key });
        } catch (error) {
            console.error('[IMAGINE] Error:', error.message);
            await sock.sendMessage(chatId, {
                text: `❌ Failed to generate image.\nReason: ${error.message}\n\nTry a different prompt or try again later.`
            }, { quoted: message });
        }
    }
};
