// commands/igstalk.js
const axios = require('axios');

module.exports = {
    command: 'igstalk',
    aliases: ['ig'],
    category: 'stalker',
    description: 'Get Instagram profile information (daily limit may apply)',
    usage: '.igstalk <username>',

    async handler(sock, message, args, context) {
        const { chatId, channelInfo } = context;
        const username = args.join(' ').trim();

        if (!username) {
            return sock.sendMessage(chatId, {
                text: '📸 *Instagram Stalker*\n\nProvide an Instagram username.\nExample: `.igstalk juicee90y`',
                ...channelInfo
            }, { quoted: message });
        }

        const statusMsg = await sock.sendMessage(chatId, {
            text: `⏳ Fetching @${username}...`,
            ...channelInfo
        }, { quoted: message });

        try {
            const apiUrl = `https://api.deline.web.id/stalker/igstalk?username=${encodeURIComponent(username)}`;
            const { data } = await axios.get(apiUrl, { timeout: 20000 });

            if (!data.status) {
                throw new Error(data.error || data.detail || 'Profile not found or limit reached');
            }

            const profile = data.result;
            const caption = `
📸 *Instagram Profile: @${profile.username || username}*
━━━━━━━━━━━━━━━━━━━
👤 *Name:* ${profile.full_name || 'N/A'}
📝 *Bio:* ${profile.biography || 'No bio'}
🔗 *External URL:* ${profile.external_url || 'None'}
📊 *Followers:* ${profile.followers_count || 0}
👣 *Following:* ${profile.follows_count || 0}
📸 *Posts:* ${profile.media_count || 0}
🏢 *Business:* ${profile.is_business_account ? 'Yes' : 'No'}
✅ *Verified:* ${profile.is_verified ? 'Yes' : 'No'}
━━━━━━━━━━━━━━━━━━━
            `.trim();

            // If there's a profile picture, send it
            if (profile.profile_pic_url) {
                await sock.sendMessage(chatId, {
                    image: { url: profile.profile_pic_url },
                    caption,
                    ...channelInfo
                }, { quoted: message });
            } else {
                await sock.sendMessage(chatId, { text: caption, ...channelInfo }, { quoted: message });
            }

            await sock.sendMessage(chatId, { delete: statusMsg.key });
        } catch (error) {
            console.error('[IGSTALK]', error.message);
            await sock.sendMessage(chatId, {
                text: `❌ Failed: ${error.message}`,
                ...channelInfo
            }, { quoted: message });
        }
    }
};
