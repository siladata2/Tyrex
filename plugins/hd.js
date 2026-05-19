// hd.js
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { fromBuffer } = require('file-type');

module.exports = {
    command: 'hd',
    aliases: ['enhance', 'upscale'],
    category: 'tools',
    description: 'Enhance image to high resolution',
    usage: '.hd <image URL> or reply to an image with .hd',

    async handler(sock, message, args, context = {}) {
        const chatId = context.chatId || message.key.remoteJid;
        let imageUrl = null;

        // 1. Try to get image URL from arguments
        if (args.length > 0) {
            imageUrl = args[0];
        } 
        // 2. If no args, check if message is a reply with an image
        else if (message.message?.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage) {
            const quotedMsg = message.message.extendedTextMessage.contextInfo.quotedMessage.imageMessage;
            if (quotedMsg.url) {
                imageUrl = quotedMsg.url;
            }
        }
        // 3. If the message itself contains an image (not a quoted reply)
        else if (message.message?.imageMessage?.url) {
            imageUrl = message.message.imageMessage.url;
        }

        if (!imageUrl) {
            await sock.sendMessage(chatId, {
                text: '📸 *HD Image Enhancer*\n\n' +
                      'Please provide an image URL or reply to an image with `.hd`.\n' +
                      'Example: `.hd https://example.com/image.jpg`'
            }, { quoted: message });
            return;
        }

        // Send status message
        const statusMsg = await sock.sendMessage(chatId, {
            text: '🖼️ Enhancing image to HD... Please wait.'
        }, { quoted: message });

        try {
            const apiUrl = `https://api.deline.web.id/tools/hd?url=${encodeURIComponent(imageUrl)}`;
            const response = await axios.get(apiUrl, {
                timeout: 60000,
                responseType: 'arraybuffer'
            });

            // Check if response is an image
            const contentType = response.headers['content-type'];
            if (!contentType || !contentType.startsWith('image/')) {
                throw new Error('API did not return a valid image');
            }

            const imageBuffer = Buffer.from(response.data);
            const type = await fromBuffer(imageBuffer);
            if (!type || !type.mime.startsWith('image/')) {
                throw new Error('Received data is not an image');
            }

            await sock.sendMessage(chatId, {
                image: imageBuffer,
                caption: '✨ *Enhanced HD Image*'
            }, { quoted: message });

            await sock.sendMessage(chatId, { delete: statusMsg.key });
        } catch (error) {
            console.error('[HD] Error:', error.message);
            await sock.sendMessage(chatId, {
                text: `❌ Failed to enhance image.\nReason: ${error.message}`
            }, { quoted: message });
        }
    }
};
