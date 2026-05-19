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
const fs = require('fs');
const path = require('path');
const { fromBuffer } = require('file-type');

// RapidAPI configuration - users need to sign up at https://rapidapi.com/tribestick-tribestick-default/api/annas-archive-api
const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY || 'YOUR_RAPIDAPI_KEY_HERE';
const RAPIDAPI_HOST = 'annas-archive-api.p.rapidapi.com';

/**
 * Search for novels using Anna's Archive API
 * @param {string} query - Search term (title, author, ISBN)
 * @param {number} limit - Number of results (max 20)
 */
async function searchNovels(query, limit = 10) {
    try {
        const options = {
            method: 'GET',
            url: 'https://annas-archive-api.p.rapidapi.com/findBook',
            params: {
                q: query,
                limit: limit,
                ext: 'pdf', // Prioritize PDF results
                lang: 'en'   // English results
            },
            headers: {
                'x-rapidapi-key': RAPIDAPI_KEY,
                'x-rapidapi-host': RAPIDAPI_HOST
            }
        };

        const response = await axios.request(options);
        return response.data;
    } catch (error) {
        console.error('[NOVEL] Search error:', error.message);
        throw new Error('Failed to search novels. API might be unavailable.');
    }
}

/**
 * Get download links for a specific book by MD5 hash
 * @param {string} md5 - MD5 hash from search results
 */
async function getDownloadLinks(md5) {
    try {
        const options = {
            method: 'GET',
            url: 'https://annas-archive-api.p.rapidapi.com/downloadBook',
            params: { md5: md5 },
            headers: {
                'x-rapidapi-key': RAPIDAPI_KEY,
                'x-rapidapi-host': RAPIDAPI_HOST
            }
        };

        const response = await axios.request(options);
        return response.data;
    } catch (error) {
        console.error('[NOVEL] Download links error:', error.message);
        throw new Error('Failed to get download links.');
    }
}

/**
 * Format file size nicely
 */
function formatFileSize(bytes) {
    if (!bytes) return 'Unknown';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

/**
 * Check if a novel has an audiobook/YouTube version (simulated - you can expand this)
 * This could integrate with YouTube search or a dedicated audiobook API
 */
async function findAudiobook(novelTitle, author) {
    // You can implement actual YouTube search here using your existing ytdown infrastructure
    // For now, return null (no audio) - you can expand this later
    return null;
    
    /* Example implementation using your play command's search:
    const yts = require('yt-search');
    const query = `${novelTitle} ${author} audiobook`;
    const results = await yts(query);
    if (results.videos.length > 0) {
        return {
            title: results.videos[0].title,
            url: results.videos[0].url,
            duration: results.videos[0].timestamp
        };
    }
    return null;
    */
}

module.exports = {
    command: 'novel',
    aliases: ['book', 'noveldl', 'ebook'],
    category: 'media',
    description: 'Search and download novels as PDF, with optional audiobook links',
    usage: '.novel <search term>',

    async handler(sock, message, args, context) {
        const { chatId, channelInfo } = context;
        const query = args.join(' ').trim();

        if (!query) {
            return await sock.sendMessage(chatId, {
                text: `📚 *NOVEL DOWNLOADER*\n\n` +
                      `*Usage:* \`.novel <book title or author>\`\n\n` +
                      `*Example:*\n` +
                      `• \`.novel Harry Potter\`\n` +
                      `• \`.novel The Hobbit\`\n` +
                      `• \`.novel Stephen King\`\n\n` +
                      `_Searches Anna's Archive and provides PDF downloads_`,
                ...channelInfo
            }, { quoted: message });
        }

        // Initial reaction
        await sock.sendMessage(chatId, { react: { text: '📚', key: message.key } });

        try {
            // 1. Search for novels
            await sock.sendMessage(chatId, {
                text: `🔍 Searching for "*${query}*"...`,
                ...channelInfo
            }, { quoted: message });

            const searchResults = await searchNovels(query, 8);

            if (!searchResults || !searchResults.data || searchResults.data.length === 0) {
                await sock.sendMessage(chatId, {
                    text: '❌ No novels found. Try a different search term.',
                    ...channelInfo
                }, { quoted: message });
                return;
            }

            // 2. Store results temporarily for selection
            const novels = searchResults.data.slice(0, 8); // Show max 8 results
            const sessionId = Date.now().toString();
            
            // Build selection message with cover images
            let selectionText = `📚 *Found ${novels.length} novels for "${query}"*\n\n`;
            
            for (let i = 0; i < novels.length; i++) {
                const book = novels[i];
                const title = book.title || 'Unknown Title';
                const author = book.author || 'Unknown Author';
                const year = book.year || 'N/A';
                const pages = book.pages || 'N/A';
                const size = formatFileSize(book.filesize);
                
                selectionText += `*${i + 1}.* ${title}\n`;
                selectionText += `   👤 *Author:* ${author}\n`;
                selectionText += `   📅 *Year:* ${year} | 📄 *Pages:* ${pages} | 💾 *Size:* ${size}\n\n`;
            }
            
            selectionText += `_Reply with the number (1-${novels.length}) to download the PDF._\n`;
            selectionText += `_Or type \`cancel\` to abort._`;

            // Store novels in memory temporarily (you could use a global variable or store)
            if (!global.novelSessions) global.novelSessions = {};
            global.novelSessions[chatId] = {
                novels: novels,
                timestamp: Date.now()
            };

            // Send first book's cover as preview (optional)
            if (novels[0].coverUrl) {
                await sock.sendMessage(chatId, {
                    image: { url: novels[0].coverUrl },
                    caption: selectionText,
                    ...channelInfo
                }, { quoted: message });
            } else {
                await sock.sendMessage(chatId, {
                    text: selectionText,
                    ...channelInfo
                }, { quoted: message });
            }

            // 3. Wait for user selection (handled in message handler)
            // This would need integration with your main message handler
            // For now, we'll implement a simple listener in the next section

        } catch (error) {
            console.error('[NOVEL] Error:', error);
            await sock.sendMessage(chatId, {
                text: `❌ Error: ${error.message}`,
                ...channelInfo
            }, { quoted: message });
        }
    },

    // Handle selection replies - this should be called from your main message handler
    async handleSelection(sock, message, context) {
        const { chatId, channelInfo } = context;
        const text = context.messageText || '';
        
        // Check if this is a number reply (1-8)
        const num = parseInt(text);
        if (isNaN(num) || num < 1 || num > 8) return false;

        // Check if there's an active session
        if (!global.novelSessions || !global.novelSessions[chatId]) return false;
        
        const session = global.novelSessions[chatId];
        const novels = session.novels;
        
        if (num > novels.length) return false;

        const selected = novels[num - 1];
        
        // React to indicate processing
        await sock.sendMessage(chatId, { react: { text: '⬇️', key: message.key } });

        try {
            // Get download links
            await sock.sendMessage(chatId, {
                text: `📥 Getting download links for "${selected.title}"...`,
                ...channelInfo
            }, { quoted: message });

            const downloadData = await getDownloadLinks(selected.md5);
            
            if (!downloadData || !downloadData.downloads || downloadData.downloads.length === 0) {
                throw new Error('No download links available');
            }

            // Get first PDF download link
            const downloadLink = downloadData.downloads[0].url;
            
            // Download the PDF
            await sock.sendMessage(chatId, {
                text: `⬇️ Downloading PDF (${formatFileSize(selected.filesize)})...`,
                ...channelInfo
            }, { quoted: message });

            const pdfResponse = await axios.get(downloadLink, { 
                responseType: 'arraybuffer',
                timeout: 120000 // 2 minute timeout for large files
            });
            
            const pdfBuffer = Buffer.from(pdfResponse.data);

            // Send as document
            await sock.sendMessage(chatId, {
                document: pdfBuffer,
                mimetype: 'application/pdf',
                fileName: `${selected.title.replace(/[^\w\s]/gi, '')}.pdf`,
                caption: `✅ *${selected.title}*\n👤 *Author:* ${selected.author || 'Unknown'}`,
                ...channelInfo
            }, { quoted: message });

            // Check for audiobook (optional)
            const audioBook = await findAudiobook(selected.title, selected.author);
            if (audioBook) {
                await sock.sendMessage(chatId, {
                    text: `🎧 *Audiobook Available:*\n${audioBook.title}\n${audioBook.url}\nDuration: ${audioBook.duration}`,
                    ...channelInfo
                }, { quoted: message });
            }

            // Clean up session
            delete global.novelSessions[chatId];

        } catch (error) {
            console.error('[NOVEL] Download error:', error);
            await sock.sendMessage(chatId, {
                text: `❌ Download failed: ${error.message}`,
                ...channelInfo
            }, { quoted: message });
        }

        return true;
    }
};
