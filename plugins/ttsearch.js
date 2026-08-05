const axios = require('axios');
const {
generateWAMessageContent,
generateWAMessageFromContent
} = require('@whiskeysockets/baileys');

module.exports = {
command: 'ttsearch',
aliases: ['tiktoksearch', 'tiksearch', 'searchtiktok'],
category: 'search',
description: 'Search TikTok videos',

async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message.key.remoteJid;

    if (!args.length) {
        return await sock.sendMessage(chatId, {
            text: '⚠️ Please provide a search term.\n\nExample: .ttsearch sports cars'
        }, { quoted: message });
    }

    const query = args.join(' ');

    try {
        const res = await axios.get(
            `https://tikwm.com/api/feed/search?keywords=${encodeURIComponent(query)}`
        );

        const videos = res?.data?.data?.videos;

        if (!videos || !videos.length) {
            return await sock.sendMessage(chatId, {
                text: '❌ No TikTok videos found!'
            }, { quoted: message });
        }

        const carouselCards = await Promise.all(
            videos.slice(0, 9).map(async (video, index) => {

                const title = video.title || 'No Title';
                const duration = video.duration
                    ? `${video.duration}s`
                    : 'Unknown';

                const views = video.play_count?.toLocaleString() || 'N/A';
                const likes = video.digg_count?.toLocaleString() || 'N/A';
                const author = video.author?.unique_id || 'tiktok';
                const videoId = video.video_id;

                const tiktokUrl =
                    `https://www.tiktok.com/@${author}/video/${videoId}`;

                const imageMsg = (
                    await generateWAMessageContent(
                        {
                            image: {
                                url: video.cover
                            }
                        },
                        {
                            upload: sock.waUploadToServer
                        }
                    )
                ).imageMessage;

                return {
                    header: {
                        title: title,
                        hasMediaAttachment: true,
                        imageMessage: imageMsg
                    },
                    body: {
                        text:

`🎵 TikTok Video

📌 Title: ${title}

⏱ Duration: ${duration}
👁 Views: ${views}
❤️ Likes: ${likes}

🔗 ${tiktokUrl}"}, footer: { text:"Page ${index + 1} of ${Math.min(videos.length, 9)}`
},
nativeFlowMessage: {
buttons: [
{
name: "cta_url",
buttonParamsJson: JSON.stringify({
display_text: "Open Video",
url: tiktokUrl,
merchant_url: tiktokUrl
})
}
]
}
};
})
);

        const msg = generateWAMessageFromContent(
            chatId,
            {
                viewOnceMessage: {
                    message: {
                        interactiveMessage: {
                            body: {
                                text: `🎵 TikTok Search Results\n\nQuery: ${query}`
                            },
                            footer: {
                                text: 'Swipe left/right to browse results'
                            },
                            carouselMessage: {
                                cards: carouselCards
                            }
                        }
                    }
                }
            },
            {}
        );

        await sock.relayMessage(
            chatId,
            msg.message,
            {
                messageId: msg.key.id
            }
        );

    } catch (error) {
        console.error('TikTok Search Error:', error);

        await sock.sendMessage(chatId, {
            text: '❌ Failed to fetch TikTok videos.'
        }, { quoted: message });
    }
}

};                               
