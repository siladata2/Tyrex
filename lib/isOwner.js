const settings = require('../settings');
const { isSudo } = require('./index');

/**
 * Extract the numeric part from any JID
 * "923001234567:12@s.whatsapp.net" → "923001234567"
 */
function cleanJid(jid) {
    if (!jid) return '';
    return jid.split(':')[0].split('@')[0];
}

/**
 * Check if user is owner or sudo.
 * FIXED: Only OWNER_NUMBER and CO_OWNER_NUM get owner-level access.
 *        Paired users (session numbers that aren't in owner/sudo) are blocked.
 */
async function isOwnerOrSudo(senderId, sock = null, chatId = null) {
    const senderIdClean = cleanJid(senderId);

    // Check OWNER_NUMBER from settings
    const ownerNumberClean = cleanJid(settings.ownerNumber || '');
    if (ownerNumberClean && senderIdClean === ownerNumberClean) return true;

    // Check CO_OWNER from env (in case set)
    const coOwnerClean = cleanJid(process.env.CO_OWNER_NUM || '');
    if (coOwnerClean && senderIdClean === coOwnerClean) return true;

    // Check sudo list
    const isSudoUser = await isSudo(senderId);
    if (isSudoUser) return true;

    // Check linked device variant (with :N suffix stripped)
    if (senderId.includes(':')) {
        const baseJid = senderId.split(':')[0] + '@s.whatsapp.net';
        if (await isSudo(baseJid)) return true;
    }

    // Handle @lid participants in groups
    if (sock && chatId && chatId.endsWith('@g.us') && senderId.includes('@lid')) {
        try {
            const metadata = await sock.groupMetadata(chatId);
            const participants = metadata.participants || [];
            const participant = participants.find(p => p.lid === senderId || p.id === senderId);
            if (participant) {
                const pRealIdClean = cleanJid(participant.id);
                if (pRealIdClean === ownerNumberClean) return true;
                if (coOwnerClean && pRealIdClean === coOwnerClean) return true;
                if (await isSudo(participant.id)) return true;
            }
        } catch (_) {}
    }

    return false;
}

/**
 * Check if user is ONLY the real owner (not sudo)
 */
function isOwnerOnly(senderId) {
    const ownerNumberClean = cleanJid(settings.ownerNumber || '');
    const senderIdClean = cleanJid(senderId);
    if (ownerNumberClean && senderIdClean === ownerNumberClean) return true;
    const coOwnerClean = cleanJid(process.env.CO_OWNER_NUM || '');
    if (coOwnerClean && senderIdClean === coOwnerClean) return true;
    return false;
}

/**
 * Helper for commands to get clean display number
 */
async function getCleanName(jid, sock) {
    if (!jid) return 'Unknown';
    const cleanNumber = cleanJid(jid);
    try {
        if (sock) {
            const contact = await sock.onWhatsApp(jid);
            if (contact && contact[0] && contact[0].exists) return cleanNumber;
        }
    } catch (_) {}
    return cleanNumber;
}

module.exports = isOwnerOrSudo;
module.exports.isOwnerOnly = isOwnerOnly;
module.exports.cleanJid = cleanJid;
module.exports.getCleanName = getCleanName;
