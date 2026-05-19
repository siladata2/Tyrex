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

const axios = require('axios');
const cheerio = require('cheerio');
const sharp = require('sharp');

// ================= CONFIG =================
const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36'
};

// Session store: maps sender JID to { stage, results, movie, downloads }
const sessions = new Map();

// ================= HELPERS =================
/**
 * Download and resize an image to a thumbnail buffer (for document preview)
 */
async function getThumbnailBuffer(url) {
    if (!url) return null;
    try {
        const { data } = await axios.get(url, {
            responseType: 'arraybuffer',
            headers: HEADERS
        });
        return await sharp(data).resize(300, 300).jpeg({ quality: 80 }).toBuffer();
    } catch {
        return null;
    }
}

/**
 * Extract the final download link from a MovieDriveBD download page
 */
async function getFinalLink(dlPageUrl) {
    try {
        const { data } = await axios.get(dlPageUrl, {
            headers: HEADERS,
            maxRedirects: 5
        });
        const $ = cheerio.load(data);
        return (
            $('a.button2.download-link').attr('href') ||
            $('a#download').attr('href')
        );
    } catch {
        return null;
    }
}

// ================= MAIN COMMAND =================
module.exports = {
    command: 'movie',
    aliases: ['film', 'moviebd', 'mdbd', 'movies'],
    category: 'downloader',
    description: 'Search & download movies from MovieDriveBD',
    usage: '.movie <name>\n.movie Pathaan\n.movie Jawan 2023',

    async handler(sock, message, args, context = {}) {
        const chatId = context.chatId || message.key.remoteJid;
        const channelInfo = context.channelInfo || {};
        const senderId = context.senderId || message.key.participant || message.key.remoteJid;
        const query = args.join(' ').trim();

        // Helper to reply easily
        const reply = (text, extra = {}) =>
            sock.sendMessage(chatId, { text, ...channelInfo, ...extra }, { quoted: message });

        if (!query) {
            return reply(
                `🎬 *Movie Downloader*\n\n` +
                `*Usage:* \`.movie <movie name>\`\n\n` +
                `*Examples:*\n` +
                `• \`.movie Pathaan\`\n` +
                `• \`.movie Jawan 2023\`\n` +
                `• \`.movie Avengers Endgame\`\n` +
                `• \`.movie RRR\`\n` +
                `• \`.movie Black Panther\`\n`
            );
        }

        // Initial reaction
        await sock.sendMessage(chatId, { react: { text: '⏳', key: message.key } });

        try {
            // ================= SEARCH =================
            const searchUrl = `https://moviedrivebd.com/?s=${encodeURIComponent(query)}`;
            const { data } = await axios.get(searchUrl, { headers: HEADERS });
            const $ = cheerio.load(data);

            const results = [];
            $('div.result-item').each((i, el) => {
                const title = $(el).find('article > div.details > div.title > a').text().trim();
                const link = $(el).find('article > div.details > div.title > a').attr('href');
                if (link) results.push({ title, link });
            });

            if (!results.length) {
                return reply('❌ No movies found for that name.');
            }

            // Build result list
            let text = `🎬 *Movie Search Results*\n\n`;
            text += `🔎 *Query:* ${query}\n\n`;
            results.forEach((v, i) => {
                text += `*${i + 1}.* ${v.title}\n`;
            });
            text += `\n✳️ Reply with the *number* of the movie you want.`;

            await reply(text);

            // Save session
            sessions.set(senderId, {
                stage: 'search',
                results
            });

            // ================= MANUAL REPLY HANDLER =================
            const handler = async (update) => {
                const msg = update.messages?.[0];
                if (!msg?.message) return;
                // Ignore reactions and other non‑text updates
                if (msg.message.reactionMessage) return;
                if (msg.key.remoteJid !== chatId) return;
                if (!sessions.has(senderId)) return;

                const body =
                    msg.message.conversation ||
                    msg.message.extendedTextMessage?.text ||
                    msg.message.imageMessage?.caption ||
                    msg.message.videoMessage?.caption ||
                    '';

                const choice = parseInt(body);
                if (isNaN(choice)) return;

                const session = sessions.get(senderId);

                // ----- STAGE 1: MOVIE SELECTION -----
                if (session.stage === 'search') {
                    const selected = session.results[choice - 1];
                    if (!selected) {
                        await reply('❌ Invalid movie number.');
                        return;
                    }

                    // React
                    setTimeout(() => {
                        sock.sendMessage(chatId, { react: { text: '📑', key: msg.key } });
                    }, 300);

                    // Fetch movie details page
                    const { data: detData } = await axios.get(selected.link, { headers: HEADERS });
                    const $d = cheerio.load(detData);

                    const movie = {
                        title: $d('h1').text().trim(),
                        imdb: $d('#repimdb > strong').text() || 'N/A',
                        runtime: $d('.runtime').text() || 'N/A',
                        date: $d('.date').text() || 'N/A',
                        image: $d('.poster img').attr('src'),
                        initLink: $d('a[href*="/links/"]').first().attr('href')
                    };

                    // Get initial download page
                    const { data: qData } = await axios.get(movie.initLink, { headers: HEADERS });
                    const dlPage = cheerio.load(qData)('#link').attr('href');

                    // Get final download page with quality options
                    const { data: last } = await axios.get(dlPage, { headers: HEADERS });
                    const $l = cheerio.load(last);

                    const downloads = [];
                    $l('.download-section a.download-btn').each((i, el) => {
                        downloads.push({
                            quality: $l(el).find('.btn-text').text().replace(/\s+/g, ' ').trim(),
                            dlPage: $l(el).attr('href')
                        });
                    });

                    if (downloads.length === 0) {
                        await reply('❌ No download links found for this movie.');
                        sessions.delete(senderId);
                        return;
                    }

                    // Build caption with qualities
                    let cap = `🎬 *${movie.title}*\n\n`;
                    cap += `⭐ IMDB: ${movie.imdb}\n`;
                    cap += `⏳ Runtime: ${movie.runtime}\n`;
                    cap += `📅 Release: ${movie.date}\n\n`;
                    cap += `*Available Qualities:*\n`;
                    downloads.forEach((d, i) => {
                        cap += `*${i + 1}.* ${d.quality}\n`;
                    });
                    cap += `\n✳️ Reply with the *number* of the quality you want.`;

                    // Send poster + caption
                    await sock.sendMessage(
                        chatId,
                        {
                            image: { url: movie.image },
                            caption: cap,
                            ...channelInfo
                        },
                        { quoted: msg }
                    );

                    // Update session
                    session.stage = 'quality';
                    session.movie = movie;
                    session.downloads = downloads;
                }

                // ----- STAGE 2: QUALITY SELECTION -----
                else if (session.stage === 'quality') {
                    const selected = session.downloads[choice - 1];
                    if (!selected) {
                        await reply('❌ Invalid quality number.');
                        return;
                    }

                    // React
                    setTimeout(() => {
                        sock.sendMessage(chatId, { react: { text: '📥', key: msg.key } });
                    }, 300);

                    // Get final direct download link
                    const finalUrl = await getFinalLink(selected.dlPage);
                    if (!finalUrl) {
                        await reply('❌ Download link expired. Try another quality.');
                        return;
                    }

                    // Generate thumbnail for document
                    const thumb = await getThumbnailBuffer(session.movie.image);

                    // Send the video file
                    await sock.sendMessage(
                        chatId,
                        {
                            document: { url: finalUrl },
                            mimetype: 'video/mp4',
                            fileName: `${session.movie.title}.mp4`,
                            jpegThumbnail: thumb,
                            caption: `✅ *${session.movie.title}*\n${selected.quality}\n\n> REDXBOT302`
                        },
                        { quoted: msg }
                    );

                    // Clean up session
                    sessions.delete(senderId);
                }
            };

            // Attach listener and auto‑clean after 15 minutes
            sock.ev.on('messages.upsert', handler);
            setTimeout(() => {
                sessions.delete(senderId);
                sock.ev.off('messages.upsert', handler);
            }, 15 * 60 * 1000);

        } catch (error) {
            console.error('Movie command error:', error);
            reply(`❌ Failed: ${error.message}`);
        }
    }
};
