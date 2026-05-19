/*****************************************************************************
 *                                                                           *
 *                     Developed By Abdul Rehman Rajpoot                     *
 *                     & Muzamil Khan                                        *
 *                                                                           *
 *****************************************************************************/

const axios = require('axios');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const store = require('../lib/lightweight_store');
const settings = require('../settings');

module.exports = {
    command: 'setdp',
    aliases: ['setbotdp', 'fulldp'],
    category: 'owner',
    description: 'Change bot profile picture (owner only)',
    usage: '.setdp <image url>  OR  reply to an image with .setdp',
    ownerOnly: true,

    async handler(sock, message, args, context) {
        const chatId = context.chatId || message.key.remoteJid;
        const channelInfo = context.channelInfo || {};

        let imageBuffer = null;
        let imageUrl = null;

        // Case 1: User replied to an image
        const quotedMsg = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        if (quotedMsg?.imageMessage) {
            try {
                imageBuffer = await downloadMediaMessage(
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
            } catch (e) {
                return await sock.sendMessage(chatId, {
                    text: `❌ Failed to download image: ${e.message}`,
                    ...channelInfo
                }, { quoted: message });
            }
        }
        // Case 2: URL provided
        else if (args.length > 0) {
            const url = args[0].trim();
            if (!/^https?:\/\//i.test(url)) {
                return await sock.sendMessage(chatId, {
                    text: '❌ Invalid URL.',
                    ...channelInfo
                }, { quoted: message });
            }
            try {
                const response = await axios.get(url, { responseType: 'arraybuffer' });
                imageBuffer = Buffer.from(response.data, 'binary');
                imageUrl = url;
            } catch (e) {
                return await sock.sendMessage(chatId, {
                    text: `❌ Failed to download from URL: ${e.message}`,
                    ...channelInfo
                }, { quoted: message });
            }
        } else {
            return await sock.sendMessage(chatId, {
                text: '❌ Please provide an image URL or reply to an image.\n\nUsage:\n`.setdp https://example.com/image.jpg`\nor reply to an image with `.setdp`',
                ...channelInfo
            }, { quoted: message });
        }

        try {
            // Update bot's profile picture
            await sock.updateProfilePicture(sock.user.id, imageBuffer);
            
            // Save URL to DB and update settings
            if (imageUrl) {
                await store.saveSetting('global', 'botDp', imageUrl);
                settings.botDp = imageUrl;
            } else {
                await store.saveSetting('global', 'botDp', 'uploaded via image');
                // Keep existing URL? We'll leave as is.
            }

            await sock.sendMessage(chatId, {
                text: '✅ Bot profile picture updated successfully!',
                ...channelInfo
            }, { quoted: message });
        } catch (error) {
            await sock.sendMessage(chatId, {
                text: `❌ Failed to update DP: ${error.message}`,
                ...channelInfo
            }, { quoted: message });
        }
    }
};
