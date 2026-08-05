/*****************************************************************************
 *  lib/isAdmin.js — REDXBOT302 RC12 ULTRA REWRITE
 *  Owner: Abdul Rehman Rajpoot
 *
 *  Uses shared cleanJid / samePhone from senderResolver.
 *  Handles: @s.whatsapp.net, @lid, :device-suffix, phoneNumber field.
 *  LRU-style group metadata cache — avoids repeated groupMetadata() calls.
 *****************************************************************************/
'use strict';

const { cleanJid, samePhone } = require('./senderResolver');

// Simple in-process group metadata cache (5-minute TTL)
const _metaCache = new Map(); // chatId → { meta, ts }
const META_TTL   = 5 * 60 * 1000;

async function _fetchMeta(sock, chatId) {
    const cached = _metaCache.get(chatId);
    if (cached && Date.now() - cached.ts < META_TTL) return cached.meta;
    try {
        const meta = await sock.groupMetadata(chatId);
        _metaCache.set(chatId, { meta, ts: Date.now() });
        return meta;
    } catch {
        return null;
    }
}

/** Invalidate cache entry (call from group-participants.update handler). */
function invalidateMetaCache(chatId) {
    _metaCache.delete(chatId);
}

/**
 * Check whether a participant entry in the group metadata matches a given JID.
 * Tries: full JID, clean phone, lid, phoneNumber field.
 */
function _participantMatches(p, targetNum) {
    if (!p || !targetNum) return false;
    const checks = [
        cleanJid(p.id    || ''),
        cleanJid(p.lid   || ''),
        cleanJid(p.phoneNumber || ''),
    ];
    return checks.some(c => c && samePhone(c, targetNum));
}

/**
 * isAdmin(sock, chatId, senderId) → Promise<{ isSenderAdmin, isBotAdmin }>
 *
 * @param {object} sock      Baileys socket
 * @param {string} chatId    Group JID (@g.us)
 * @param {string} senderId  Resolved sender JID (from resolveSender)
 */
async function isAdmin(sock, chatId, senderId) {
    const DEFAULT = { isSenderAdmin: false, isBotAdmin: false };
    try {
        const meta = await _fetchMeta(sock, chatId);
        if (!meta) return DEFAULT;

        const participants = meta.participants || [];

        const botNum    = cleanJid(sock?.user?.id    || '');
        const botLid    = cleanJid(sock?.user?.lid   || '');
        const senderNum = cleanJid(senderId || '');

        let isBotAdmin    = false;
        let isSenderAdmin = false;

        for (const p of participants) {
            const isAdmin_ = p.admin === 'admin' || p.admin === 'superadmin';
            if (!isAdmin_) continue;

            const pNum = cleanJid(p.id  || '');
            const pLid = cleanJid(p.lid || '');
            const pPN  = cleanJid(p.phoneNumber || '');

            // Bot admin check
            if (!isBotAdmin) {
                isBotAdmin = !!(
                    (botNum && (samePhone(botNum, pNum) || samePhone(botNum, pLid) || samePhone(botNum, pPN))) ||
                    (botLid && (samePhone(botLid, pNum) || samePhone(botLid, pLid)))
                );
            }

            // Sender admin check
            if (!isSenderAdmin) {
                isSenderAdmin = !!(
                    senderNum &&
                    (samePhone(senderNum, pNum) || samePhone(senderNum, pLid) || samePhone(senderNum, pPN))
                );
            }

            if (isBotAdmin && isSenderAdmin) break; // early exit
        }

        return { isSenderAdmin, isBotAdmin };
    } catch (err) {
        console.error('[isAdmin] Error:', err.message);
        return DEFAULT;
    }
}

module.exports              = isAdmin;
module.exports.isAdmin      = isAdmin;
module.exports.invalidateMetaCache = invalidateMetaCache;
// Reused as Baileys socket's `cachedGroupMetadata` hook — stops Baileys from
// calling groupMetadata() fresh on every single group send (root cause of
// rate-overlimit storms that broke antilink/mute/reactions under load).
module.exports.getCachedGroupMetadata = _fetchMeta;
