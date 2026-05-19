/*****************************************************************************
 *                     Group Status – Mentions all members
 *                     Developed By Abdul Rehman Rajpoot
 *****************************************************************************/

const { downloadContentFromMessage } = require('@whiskeysockets/baileys');

module.exports = {
    command: 'gcstatus',
    aliases: ['statusgc', 'groupstatus', 'swgc'],
    category: 'group',
    description: 'Post an announcement in the group (mentions all members)',
    usage: '.gcstatus <text>  or  reply to an image/video/audio with .gcstatus',
    // Only group owner can use it (you can change to isOwner if you want)
    ownerOnly: true,   // uses isOwner from context (bot owner only)
    // If you want to allow group admins, you'd need to check group metadata inside handler.

    async handler(sock, message, args, context) {
        const { chatId, isGroup, isOwner, senderId } = context;

        // Must be used in a group
        if (!isGroup) {
            return await sock.sendMessage(chatId, {
                text: '❌ This command can only be used in groups!'
            }, { quoted: message });
        }

        // Optional: also allow group admins, not just bot owner
        // if (!isOwner) { ... }  – keep as ownerOnly true for simplicity

        const quotedMsg = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        const text = args.join(' ');

        // If no quoted media and no text, show usage
        if (!quotedMsg && !text) {
            return await sock.sendMessage(chatId, {
                text: `⚠️ *Group Status* – Announce to everyone\n\n` +
                      `Reply to an image/video/audio with:\n` +
                      `.gcstatus [caption]\n\n` +
                      `Or send text:\n` +
                      `.gcstatus Hello everyone!`,
                ...context.channelInfo
            }, { quoted: message });
        }

        try {
            // Show loading reaction
            await sock.sendMessage(chatId, { react: { text: '⏳', key: message.key } });

            // Get all group members for mention
            const groupMeta = await sock.groupMetadata(chatId);
            const participants = groupMeta.participants;
            const mentionedJid = participants.map(p => p.id);

            let messageContent = {};

            // Handle quoted media
            if (quotedMsg) {
                // Determine media type
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
                        text: '❌ Unsupported media type. Reply to an image, video, or audio file.'
                    }, { quoted: message });
                }

                // Download media
                const stream = await downloadContentFromMessage(mediaMsg, mediaType);
                const buffer = [];
                for await (const chunk of stream) buffer.push(chunk);
                const mediaBuffer = Buffer.concat(buffer);

                // Build the media object
                if (mediaType === 'image') {
                    messageContent = {
                        image: mediaBuffer,
                        caption: text || '',
                        contextInfo: {
                            isGroupStatus: true,
                            mentionedJid
                        }
                    };
                } else if (mediaType === 'video') {
                    messageContent = {
                        video: mediaBuffer,
                        caption: text || '',
                        contextInfo: {
                            isGroupStatus: true,
                            mentionedJid
                        }
                    };
                } else if (mediaType === 'audio') {
                    const isPTT = mediaMsg.ptt || false;
                    messageContent = {
                        audio: mediaBuffer,
                        mimetype: isPTT ? 'audio/ogg; codecs=opus' : 'audio/mpeg',
                        ptt: isPTT,
                        contextInfo: {
                            isGroupStatus: true,
                            mentionedJid
                        }
                    };
                }
            }
            // Text‑only message
            else {
                messageContent = {
                    text: text,
                    contextInfo: {
                        isGroupStatus: true,
                        mentionedJid
                    }
                };
            }

            // Send the status announcement
            await sock.sendMessage(chatId, messageContent, { quoted: message });

            // Success reaction
            await sock.sendMessage(chatId, { react: { text: '✅', key: message.key } });

        } catch (error) {
            console.error('Group Status Error:', error);
            await sock.sendMessage(chatId, {
                text: `❌ Failed to post group status: ${error.message}`
            }, { quoted: message });
            await sock.sendMessage(chatId, { react: { text: '❌', key: message.key } });
        }
    }
};
