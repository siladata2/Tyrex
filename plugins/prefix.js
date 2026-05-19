/*****************************************************************************
 *                                                                           *
 *                     Developed By Abdul Rehman Rajpoot                     *
 *                     & Muzamil Khan                                        *
 *                                                                           *
 *****************************************************************************/

const store = require('../lib/lightweight_store');

module.exports = {
    command: 'prefix',
    aliases: ['setprefix'],
    category: 'owner',
    description: 'Change bot prefix (owner only)',
    usage: '.prefix <new prefix>',
    ownerOnly: true,

    async handler(sock, message, args, context) {
        const chatId = context.chatId || message.key.remoteJid;
        const channelInfo = context.channelInfo || {};

        if (args.length === 0) {
            const current = await store.getSetting('global', 'prefix') || '.';
            return await sock.sendMessage(chatId, {
                text: `🔧 *Current Prefix:* \`${current}\`\n\nUse \`.prefix <new>\` to change.`,
                ...channelInfo
            }, { quoted: message });
        }

        const newPrefix = args[0].trim();
        if (newPrefix.length > 2) {
            return await sock.sendMessage(chatId, {
                text: '❌ Prefix must be 1-2 characters.',
                ...channelInfo
            }, { quoted: message });
        }

        await store.saveSetting('global', 'prefix', newPrefix);
        // Update settings.prefixes to only this prefix
        const settings = require('../settings');
        settings.prefixes = [newPrefix];

        await sock.sendMessage(chatId, {
            text: `✅ Prefix changed to \`${newPrefix}\``,
            ...channelInfo
        }, { quoted: message });
    }
};
