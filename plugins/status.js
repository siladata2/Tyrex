/*****************************************************************************
 *                     Personal Status – Visible to All Contacts
 *                     Developed By Abdul Rehman Rajpoot
 *****************************************************************************/

const { downloadContentFromMessage } = require('@whiskeysockets/baileys');

module.exports = {
    command: 'status',
    aliases: ['story', 'updatestatus'],
    category: 'owner',
    description: 'Post a personal WhatsApp status (visible to all your contacts)',
    usage: '.status <text>  or  reply to an image/video/audio with .status',
    ownerOnly: true,

    async handler(sock, message, args, context) {
        const { chatId, channelInfo } = context;
        const quotedMsg = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        const text = args.join(' ');

        // Show usage if no content
        if (!quotedMsg && !text) {
            return await sock.sendMessage(chatId, {
                text: `⚠️ *Personal Status* – Post an update visible to all your contacts\n\n` +
                      `Reply to an image/video/audio with:\n` +
                      `.status [caption]\n\n` +
                      `Or send text:\n` +
                      `.status Hello everyone!`,
                ...channelInfo
            }, { quoted: message });
        }

        try {
            // Show loading reaction
            await sock.sendMessage(chatId, { react: { text: '⏳', key: message.key } });

            let statusContent = {};

            // Handle quoted media
            if (quotedMsg) {
                let mediaType = null;
                let mediaMsg = null;

                if (quotedMsg.imageMessage) {
                    mediaType = 'image';
                    mediaMsg = quotedMsg.imageMessage;
                } else if (quotedMsg.videoMessage) {
                    mediaType = 'video';
                    mediaMsg = quotedMsg.videoMessage;
                } else if (quotedMsg.audioMessage) {
                    mediaType = 'audio';
                    mediaMsg = quotedMsg.audioMessage;
                } else {
                    return await sock.sendMessage(chatId, {
                        text: '❌ Unsupported media type. Reply to an image, video, or audio file.',
                        ...channelInfo
                    }, { quoted: message });
                }

                // Download media
                const stream = await downloadContentFromMessage(mediaMsg, mediaType);
                const buffer = [];
                for await (const chunk of stream) buffer.push(chunk);
                const mediaBuffer = Buffer.concat(buffer);

                // Build status content
                if (mediaType === 'image') {
                    statusContent = {
                        image: mediaBuffer,
                        caption: text || '',
                        status: true   // explicit status flag
                    };
                } else if (mediaType === 'video') {
                    statusContent = {
                        video: mediaBuffer,
                        caption: text || '',
                        status: true
                    };
                } else if (mediaType === 'audio') {
                    const isPTT = mediaMsg.ptt || false;
                    statusContent = {
                        audio: mediaBuffer,
                        mimetype: isPTT ? 'audio/ogg; codecs=opus' : 'audio/mpeg',
                        ptt: isPTT,
                        status: true
                    };
                }
            }
            // Text‑only status
            else {
                statusContent = {
                    text: text,
                    status: true
                };
            }

            // Post to status@broadcast – visible to all contacts
            await sock.sendMessage('status@broadcast', statusContent);

            // Success reaction and message
            await sock.sendMessage(chatId, { react: { text: '✅', key: message.key } });
            await sock.sendMessage(chatId, {
                text: '✅ Status posted! All your contacts will see it.',
                ...channelInfo
            }, { quoted: message });

        } catch (error) {
            console.error('[STATUS] Error:', error);
            await sock.sendMessage(chatId, {
                text: `❌ Failed to post status: ${error.message}`,
                ...channelInfo
            }, { quoted: message });
            await sock.sendMessage(chatId, { react: { text: '❌', key: message.key } });
        }
    }
};
