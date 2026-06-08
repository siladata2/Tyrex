/*****************************************************************************
 *  🔥 REDXBOT302 — lib/isOwner.js  ★ ULTRA FIXED v3.0 ★
 *
 *  ╔══════════════════════════════════════════════════════════╗
 *  ║   ROOT CAUSE OF OWNER DETECTION BUG — EXPLAINED:       ║
 *  ║                                                         ║
 *  ║  WhatsApp linked devices (phone + PC/tablet) send       ║
 *  ║  messages with an internal @lid JID:                    ║
 *  ║    79268218458117@lid  ← NOT your real phone number     ║
 *  ║                                                         ║
 *  ║  Old code compared  79268218458117 vs 923001234567      ║
 *  ║  → ALWAYS FAILED → Owner treated as stranger!           ║
 *  ║                                                         ║
 *  ║  NEW FIX (4-layer strategy):                            ║
 *  ║   1. fromMe === true   → always owner (linked device)   ║
 *  ║   2. Digit match       → real number comparison         ║
 *  ║   3. @lid resolution   → group metadata + cache         ║
 *  ║   4. Bot JID match     → sock.user.id covers session    ║
 *  ╚══════════════════════════════════════════════════════════╝
 *
 *  © 2026 Abdul Rehman Rajpoot — All rights reserved
 *****************************************************************************/

'use strict';

const settings = require('../settings');

let _isSudoFn = null;
function getSudoFn() {
    if (!_isSudoFn) {
        try { _isSudoFn = require('./index').isSudo; } catch { _isSudoFn = async () => false; }
    }
    return _isSudoFn;
}

// ── LID resolution cache (lid → phone number) ─────────────────────────────
const lidCache = new Map();

/**
 * cleanJid — strip device suffix + domain from any JID format.
 * "923001234567:12@s.whatsapp.net" → "923001234567"
 * "79268218458117@lid"             → "79268218458117"
 * "+923001234567"                  → "923001234567"
 */
function cleanJid(jid) {
    if (!jid) return '';
    return String(jid).split(':')[0].split('@')[0].replace(/^\+/, '').trim();
}

/**
 * isLidJid — true when WhatsApp sends an internal linked-device ID
 */
function isLidJid(jid) {
    return typeof jid === 'string' && jid.endsWith('@lid');
}

/**
 * resolveOwnerNumber — reads from settings with fallback
 */
function resolveOwnerNumber() {
    try {
        const raw = settings.ownerNumber || process.env.OWNER_NUMBER || '';
        return cleanJid(raw);
    } catch { return ''; }
}

/**
 * tryResolveLidFromGroup — look up the real phone behind a @lid
 * using group metadata (which includes .phoneNumber or .id fields)
 */
async function tryResolveLidFromGroup(sock, chatId, lidJid) {
    const lidNum = cleanJid(lidJid);
    if (lidCache.has(lidNum)) return lidCache.get(lidNum);

    if (!sock || !chatId || !chatId.endsWith('@g.us')) return null;
    try {
        const meta = await sock.groupMetadata(chatId);
        for (const p of (meta.participants || [])) {
            // Match on .lid or .id fields
            const pLid = cleanJid(p.lid || '');
            const pId  = cleanJid(p.id  || '');
            if (pLid === lidNum || pId === lidNum) {
                const phone = cleanJid(p.phoneNumber || p.id || '');
                if (phone) { lidCache.set(lidNum, phone); return phone; }
            }
        }
    } catch { /* group metadata not available */ }
    return null;
}

/**
 * isOwnerOrSudo — THE MAIN PERMISSION GATE
 *
 * Pass as many args as you have; all are optional except senderId.
 *
 * @param {string}  senderId  — JID of the sender
 * @param {object}  sock      — Baileys socket (for user.id + groupMetadata)
 * @param {string}  chatId    — remoteJid of the chat (for group @lid lookup)
 * @param {object}  message   — raw Baileys message (for fromMe check)
 * @param {object}  context   — commandHandler context (pre-computed flags)
 */
async function isOwnerOrSudo(senderId, sock = null, chatId = null, message = null, context = {}) {
    const ownerNum     = resolveOwnerNumber();
    const senderClean  = cleanJid(senderId);

    // ── LAYER 1: fromMe = always owner's own device ─────────────────────────
    //    Any message flagged fromMe came from the bot's paired phone or PC.
    if (message?.key?.fromMe === true) return true;

    // ── LAYER 2: Pre-computed flags (messageHandler fast path) ──────────────
    if (context?.isOwner === true)             return true;
    if (context?.isOwnerOrSudoCheck === true)  return true;
    if (context?.senderIsOwnerOrSudo === true) return true;
    if (context?.fromMe === true)              return true;

    // ── LAYER 3: Direct digit comparison ────────────────────────────────────
    if (ownerNum && senderClean && senderClean === ownerNum) return true;

    // ── LAYER 4: Bot's own session JID ─────────────────────────────────────
    //    Covers: bot itself sending commands, linked devices with real JID
    if (sock?.user?.id) {
        const botNum = cleanJid(sock.user.id);
        if (botNum && senderClean === botNum) return true;
    }

    // ── LAYER 5: @lid linked-device resolution ──────────────────────────────
    if (isLidJid(senderId)) {
        // 5a. Bot is running as owner → any DM @lid is owner's device
        if (sock?.user?.id) {
            const botNum = cleanJid(sock.user.id);
            if (botNum && botNum === ownerNum) return true;
        }

        // 5b. Resolve via group metadata
        const resolvedPhone = await tryResolveLidFromGroup(sock, chatId, senderId);
        if (resolvedPhone) {
            if (resolvedPhone === ownerNum) return true;
            // Also check sudo
            const isSudo = getSudoFn();
            if (await isSudo(resolvedPhone + '@s.whatsapp.net')) return true;
        }
    }

    // ── LAYER 6: Sudo check ─────────────────────────────────────────────────
    try {
        const isSudo = getSudoFn();
        if (await isSudo(senderId)) return true;
        // Also try with cleaned JID
        if (senderClean && await isSudo(senderClean + '@s.whatsapp.net')) return true;
    } catch { /* ignore */ }

    return false;
}

/**
 * isOwnerOnly — strict, no sudo, faster (synchronous-friendly)
 */
function isOwnerOnly(senderId, sock = null, message = null) {
    if (message?.key?.fromMe === true) return true;
    const ownerNum    = resolveOwnerNumber();
    const senderClean = cleanJid(senderId);
    if (ownerNum && senderClean === ownerNum) return true;
    if (sock?.user?.id) {
        const botNum = cleanJid(sock.user.id);
        if (botNum && senderClean === botNum) return true;
    }
    if (isLidJid(senderId) && sock?.user?.id) {
        const botNum = cleanJid(sock.user.id);
        if (botNum && botNum === ownerNum) return true;
    }
    return false;
}

/**
 * isOwnerOrSudoFromMessage — convenience wrapper that pulls args from
 * a Baileys message + context object (used inside plugin handlers).
 */
async function isOwnerOrSudoFromMessage(sock, message, context = {}) {
    const senderId = context.sender
        || message?.key?.participant
        || message?.key?.remoteJid
        || '';
    const chatId = context.chatId || message?.key?.remoteJid || null;
    return isOwnerOrSudo(senderId, sock, chatId, message, context);
}

/**
 * lidToPhone — resolve @lid → real phone from LID cache or group metadata
 */
async function lidToPhone(sock, chatId, lidJid) {
    return tryResolveLidFromGroup(sock, chatId, lidJid);
}

module.exports                          = isOwnerOrSudo;
module.exports.isOwnerOrSudo            = isOwnerOrSudo;
module.exports.isOwnerOnly              = isOwnerOnly;
module.exports.isOwnerOrSudoFromMessage = isOwnerOrSudoFromMessage;
module.exports.cleanJid                 = cleanJid;
module.exports.isLidJid                 = isLidJid;
module.exports.lidToPhone               = lidToPhone;
module.exports.resolveOwnerNumber       = resolveOwnerNumber;
module.exports.lidCache                 = lidCache;
