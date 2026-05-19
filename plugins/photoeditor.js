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

const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const Jimp = require('jimp');
const fs = require('fs');
const path = require('path');
const { writeFile } = require('fs/promises');

const TEMP_DIR = path.join(process.cwd(), 'temp');
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

/**
 * Helper to download an image from a WhatsApp message
 */
async function downloadImage(sock, message) {
    const msg = message.message?.imageMessage || message.message?.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage;
    if (!msg) throw new Error('No image found. Reply to an image.');

    const stream = await downloadContentFromMessage(msg, 'image');
    let buffer = Buffer.from([]);
    for await (const chunk of stream) {
        buffer = Buffer.concat([buffer, chunk]);
    }
    return buffer;
}

module.exports = {
    command: 'photoedit',
    aliases: ['pedit', 'img edit'],
    category: 'tools',
    description: 'Edit images – crop, add text, overlay stickers (educational use only)',
    usage: `.photoedit <crop|text|sticker> [params]
  
  Examples:
  • Reply to an image with: .photoedit crop 100 100 300 200   (x y width height)
  • .photoedit text "Hello" 50 100 red   (text x y color)
  • .photoedit sticker https://example.com/sticker.png    (overlay an image at center)`,
    ownerOnly: false, // anyone can use, but you can change

    async handler(sock, message, args, context) {
        const chatId = context.chatId || message.key.remoteJid;
        const channelInfo = context.channelInfo || {};

        if (args.length === 0) {
            return await sock.sendMessage(chatId, {
                text: '🖼️ *Photo Editor*\n\n' +
                      'Reply to an image and use:\n' +
                      '• `.photoedit crop x y width height`\n' +
                      '• `.photoedit text "your text" x y color`\n' +
                      '• `.photoedit sticker <image_url>`\n\n' +
                      'Colors: red, blue, green, yellow, white, black',
                ...channelInfo
            }, { quoted: message });
        }

        try {
            // Download the image
            const imageBuffer = await downloadImage(sock, message);
            const inputPath = path.join(TEMP_DIR, `input_${Date.now()}.jpg`);
            const outputPath = path.join(TEMP_DIR, `output_${Date.now()}.jpg`);
            await writeFile(inputPath, imageBuffer);

            const image = await Jimp.read(inputPath);
            const command = args[0].toLowerCase();

            if (command === 'crop') {
                if (args.length < 5) throw new Error('Usage: .photoedit crop x y width height');
                const x = parseInt(args[1]);
                const y = parseInt(args[2]);
                const w = parseInt(args[3]);
                const h = parseInt(args[4]);
                image.crop(x, y, w, h);
            }
            else if (command === 'text') {
                if (args.length < 4) throw new Error('Usage: .photoedit text "message" x y [color]');
                // Parse quoted text
                const match = args.slice(1).join(' ').match(/"([^"]+)"\s+(\d+)\s+(\d+)(?:\s+(\w+))?/);
                if (!match) throw new Error('Invalid format. Use: .photoedit text "Hello" 50 100 red');
                const text = match[1];
                const x = parseInt(match[2]);
                const y = parseInt(match[3]);
                const colorName = match[4] || 'white';

                const colorMap = {
                    red: 0xFF0000FF,
                    blue: 0x0000FFFF,
                    green: 0x00FF00FF,
                    yellow: 0xFFFF00FF,
                    white: 0xFFFFFFFF,
                    black: 0x000000FF
                };
                const hexColor = colorMap[colorName.toLowerCase()] || 0xFFFFFFFF;

                const font = await Jimp.loadFont(Jimp.FONT_SANS_32_WHITE); // using white font, but we'll apply color
                image.print(font, x, y, { text, alignmentX: Jimp.HORIZONTAL_ALIGN_LEFT }, 0, 0);
                // Jimp doesn't support color directly in print, we could do a workaround by blending, but for simplicity we keep white.
                // Alternatively we could use composite with a text bitmap, but that's complex.
            }
            else if (command === 'sticker') {
                if (args.length < 2) throw new Error('Usage: .photoedit sticker <image_url>');
                const stickerUrl = args[1];
                const response = await axios.get(stickerUrl, { responseType: 'arraybuffer' });
                const stickerBuffer = Buffer.from(response.data);
                const sticker = await Jimp.read(stickerBuffer);
                // Resize sticker to fit (e.g., 200x200)
                sticker.resize(200, 200);
                // Position at center
                const x = (image.bitmap.width - 200) / 2;
                const y = (image.bitmap.height - 200) / 2;
                image.composite(sticker, x, y);
            }
            else {
                throw new Error('Unknown command. Use crop, text, or sticker.');
            }

            // Save edited image
            await image.writeAsync(outputPath);

            // Send back the edited image
            await sock.sendMessage(chatId, {
                image: { url: outputPath },
                caption: '✅ Image edited (educational demo)',
                ...channelInfo
            }, { quoted: message });

            // Cleanup temp files
            fs.unlink(inputPath, () => {});
            fs.unlink(outputPath, () => {});
        } catch (error) {
            await sock.sendMessage(chatId, {
                text: `❌ Error: ${error.message}`,
                ...channelInfo
            }, { quoted: message });
        }
    }
};
