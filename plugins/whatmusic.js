// commands/whatmusic.js
const axios = require('axios');

module.exports = {
    command: 'whatmusic',
    aliases: ['whatsong', 'identify'],
    category: 'tools',
    description: 'Identify song title and artist from an audio URL',
    usage: '.whatmusic <audio_url>',

    async handler(sock, message, args, context) {
        const { chatId, channelInfo } = context;
        const url = args.join(' ').trim();

        if (!url) {
            return sock.sendMessage(chatId, {
                text: '🎵 *WhatMusic*\n\nProvide a direct audio URL.\nExample: `.whatmusic https://example.com/song.mp3`',
                ...channelInfo
            }, { quoted: message });
        }

        const statusMsg = await sock.sendMessage(chatId, {
            text: '🎧 Identifying song...',
            ...channelInfo
        }, { quoted: message });

        try {
            const apiUrl = `https://api.deline.web.id/tools/whatmusic?url=${encodeURIComponent(url)}`;
            const { data } = await axios.get(apiUrl, { timeout: 30000 });

            if (!data.status) throw new Error(data.error || 'Could not identify');

            const { title, artists } = data.result;
            const caption = `
🎵 *Song Identified*
━━━━━━━━━━━━━━━━━━━
🎤 *Title:* ${title || 'Unknown'}
👨‍🎤 *Artist:* ${artists || 'Unknown'}
━━━━━━━━━━━━━━━━━━━
            `.trim();

            await sock.sendMessage(chatId, {
                text: caption,
                ...channelInfo
            }, { quoted: message });

            await sock.sendMessage(chatId, { delete: statusMsg.key });
        } catch (error) {
            console.error('[WHATMUSIC]', error.message);
            await sock.sendMessage(chatId, {
                text: `❌ Failed: ${error.message}`,
                ...channelInfo
            }, { quoted: message });
        }
    }
};
