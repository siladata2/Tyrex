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

module.exports = {
    command: 'guide',
    aliases: ['help', 'commands', 'cmds'],
    category: 'main',
    description: 'Show how to use bot commands and tools',
    usage: '.guide [category]',

    async handler(sock, message, args, context) {
        const { chatId, channelInfo } = context;
        const category = args[0] ? args[0].toLowerCase() : null;

        const fullGuide = `╭────────────────────────────╮
│    📚 *REDXBOT302 USER GUIDE*    │
╰────────────────────────────╯

*🔹 Getting Started*
• Use \`.guide\` to see this menu.
• Type any command with prefix \`.\` (dot).
• Example: \`.menu\` to see all commands.

*🔹 Main Categories*
• \`.guide ai\`       – AI tools (chat, image, video)
• \`.guide fun\`      – Fun & games (gaali, shayari, tictactoe)
• \`.guide media\`    – Download music, video, docs
• \`.guide group\`    – Group management (welcome, admin tools)
• \`.guide owner\`    – Bot owner commands (restart, broadcast)
• \`.guide auto\`     – Auto‑forward setup

*🔹 Need Help?*
Contact: @AbdulRehmanRajpoot
Channel: https://whatsapp.com/channel/0029VbCPnYf96H4SNehkev10

_Powered by Abdul Rehman Rajpoot_`;

        const aiGuide = `*🤖 AI Commands*
\`.gpt <question>\`      – Ask GPT‑4
\`.gemini <question>\`   – Google Gemini AI
\`.llama <question>\`    – Llama 3
\`.imagine <prompt>\`    – Generate image
\`.sora <prompt>\`       – Generate video (text‑to‑video)`;

        const funGuide = `*🎉 Fun Commands*
\`.gaali\`               – Get random funny abuse
\`.shayari\`             – Romantic / sad poetry
\`.joke\`                – Random joke
\`.fact\`                – Random fact
\`.dirty\`               – Dirty lines (18+)
\`.tictactoe @user\`     – Start a TicTacToe game
\`.connect4 @user\`      – Start Connect4 game`;

        const mediaGuide = `*🎵 Media Download*
\`.play <song>\`         – Download audio from YouTube
\`.video <query>\`       – Download video
\`.ig <url>\`            – Instagram reels / post
\`.fb <url>\`            – Facebook video
\`.tt <url>\`            – TikTok video
\`.yt <query>\`          – YouTube search`;

        const groupGuide = `*👥 Group Commands*
\`.welcome on/off\`      – Toggle welcome message
\`.goodbye on/off\`      – Toggle goodbye message
\`.antilink on/off\`     – Block links
\`.antibadword on/off\`  – Block bad words
\`.tagall <text>\`       – Mention everyone
\`.hidetag <text>\`      – Mention everyone silently
\`.kick @user\`          – Remove member
\`.promote @user\`       – Make admin
\`.demote @user\`        – Remove admin`;

        const ownerGuide = `*👑 Owner Commands*
\`.broadcast <text>\`    – Send message to all chats
\`.restart\`             – Restart bot
\`.shutdown\`            – Stop bot
\`.eval <code>\`         – Execute JS code
\`.autoforward\`         – Configure auto‑forward
\`.addsudo <number>\`    – Add sudo user`;

        const autoGuide = `*🔄 Auto‑forward Setup*
\`.autoforward source <jid>\`   – Set source group/chat
\`.autoforward target <jid>\`   – Set destination
\`.autoforward mode <option>\`  – all | owner | others | admin
\`.autoforward on\`              – Enable forwarding
\`.autoforward off\`             – Disable
\`.autoforward\`                  – Show current config

*Mode explanation:*
• \`all\`    – forward every message
• \`owner\`  – forward only bot owner's messages
• \`others\` – forward messages from everyone except bot owner
• \`admin\`  – forward only group admins' messages`;

        let responseText;
        if (!category) {
            responseText = fullGuide;
        } else if (category === 'ai') {
            responseText = aiGuide;
        } else if (category === 'fun') {
            responseText = funGuide;
        } else if (category === 'media') {
            responseText = mediaGuide;
        } else if (category === 'group') {
            responseText = groupGuide;
        } else if (category === 'owner') {
            responseText = ownerGuide;
        } else if (category === 'auto') {
            responseText = autoGuide;
        } else {
            responseText = `❌ Unknown category. Available: ai, fun, media, group, owner, auto`;
        }

        await sock.sendMessage(chatId, {
            text: responseText,
            ...channelInfo
        }, { quoted: message });
    }
};
