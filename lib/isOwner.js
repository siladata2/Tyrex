/*****************************************************************************
 *  lib/isOwner.js — REDXBOT302 RC13 + SESSION BOT EDITION
 *  Owner: Abdul Rehman Rajpoot
 *
 *  CHANGES (Session Bot Integration):
 *    ✅ fromMe + sessionId shortcut — any message sent from the bot's own
 *       device (fromMe=true) with a sessionId grants owner access instantly,
 *       exactly like redxminibot session bot logic. Works in DMs AND groups.
 *    ✅ Simple phone number fast-path — no LID resolution needed for owner;
 *       direct cleanJid comparison runs first, LID resolver is fallback only.
 *    ✅ All original RC13 LID cache logic kept as additional resolution paths.
 *
 *  PERMISSION TIERS (from redxminibot pattern):
 *   1. REAL OWNER    — ownerNumber in settings/env
 *   2. CO-OWNER      — CO_OWNER_NUM in env (if set)
 *   3. SESSION USER  — fromMe=true with any sessionId → owner-level access
 *   4. SUDO USER     — added via .sudo add command
 *   5. REGULAR USER  — everyone else
 *****************************************************************************/
'use strict';

const settings = require('../settings');
const {
    cleanJid,
    samePhone,
    lidToPhone,
    cacheLidMapping,
    resolveLidNum: _resolveLid,
    isLidJid,
} = require('./senderResolver');

/* ═══════════════════════════════════════════════════════════════════════════
   INTERNAL helpers
═══════════════════════════════════════════════════════════════════════════ */
function _ownerNum() {
    return (settings.ownerNumber || process.env.OWNER_NUMBER || '').replace(/\D/g, '');
}

function _coOwnerNum() {
    return (process.env.CO_OWNER_NUM || '').replace(/\D/g, '');
}

function _isOwnerPhone(jidOrNum) {
    const owner = _ownerNum();
    if (!owner) return false;
    const clean = cleanJid(jidOrNum);
    if (samePhone(clean, owner)) return true;
    // co-owner check
    const coOwner = _coOwnerNum();
    if (coOwner && samePhone(clean, coOwner)) return true;
    return false;
}

/* ═══════════════════════════════════════════════════════════════════════════
   SUDO CHECK
═══════════════════════════════════════════════════════════════════════════ */
async function _isSudoAny(jid) {
    try {
        const { isSudo } = require('./index');
        if (await isSudo(jid)) return true;
        const phoneNum = cleanJid(jid);
        if (phoneNum && await isSudo(`${phoneNum}@s.whatsapp.net`)) return true;
        const resolved = lidToPhone.get(phoneNum);
        if (resolved && resolved !== jid && await isSudo(resolved)) return true;
    } catch {}
    return false;
}

/* ═══════════════════════════════════════════════════════════════════════════
   isOwnerOrSudo(senderId, sock?, chatId?, fromMe?, sessionId?) → Promise<bool>
   Primary export — used by messageHandler.js

   NEW PARAMS (session bot integration):
     fromMe    — message.key.fromMe  (true = sent from bot's own device)
     sessionId — phone number the bot session is running as

   Session bot rule:
     if (fromMe && sessionId) return true;
     Rationale: only the account that paired this session can send fromMe=true.
     They ARE the bot user — grant owner access for all commands.
═══════════════════════════════════════════════════════════════════════════ */
async function isOwnerOrSudo(
    senderId,
    sock       = null,
    chatId     = null,
    fromMe     = false,
    sessionId  = null
) {
    if (!senderId) return false;

    // ── 0. SESSION BOT FAST PATH ──────────────────────────────────────────
    //    fromMe=true means the message came from the bot's own WhatsApp account.
    //    No impersonation possible — grant owner access immediately.
    //    (Copied from redxminibot isOwner.js pattern)
    if (fromMe && sessionId) {
        return true;
    }

    // ── 1. fromMe alone (fallback for when sessionId is not passed yet) ──
    if (fromMe) {
        // If bot's number equals owner number, definitely owner
        const ownerNum = _ownerNum();
        const sNum = cleanJid(senderId);
        if (!ownerNum || samePhone(sNum, ownerNum)) return true;
        // Even if owner numbers don't match, fromMe means it's the paired account
        // (same session bot pattern — paired user gets owner-level access)
        return true;
    }

    const senderNum = cleanJid(senderId);
    const ownerNum  = _ownerNum();

    // ── 2. Direct phone match (owner or co-owner) ──────────────────────────
    if (samePhone(senderNum, ownerNum)) return true;
    const coOwner = _coOwnerNum();
    if (coOwner && samePhone(senderNum, coOwner)) return true;

    // ── 3. sock.user.id DOUBLE-GATE ─────────────────────────────────────
    if (sock?.user?.id) {
        const botNum = cleanJid(sock.user.id);
        if (botNum && samePhone(senderNum, botNum) && samePhone(botNum, ownerNum)) {
            return true;
        }
    }

    // ── 4. LID cache hit ──────────────────────────────────────────────────
    const cachedJid = lidToPhone.get(senderNum);
    if (cachedJid) {
        if (_isOwnerPhone(cachedJid)) return true;
        if (await _isSudoAny(cachedJid)) return true;
        return false;  // resolved to known non-owner
    }

    // ── 5. Direct sudo check ──────────────────────────────────────────────
    if (await _isSudoAny(senderId)) return true;

    // ── 6. LID resolution (only for LID JIDs) ────────────────────────────
    if (!isLidJid(senderId) || !sock) return false;

    const resolvedJid = await _resolveLid(senderNum, sock, chatId);
    if (!resolvedJid) return false;

    if (_isOwnerPhone(resolvedJid)) return true;
    if (await _isSudoAny(resolvedJid)) return true;

    return false;
}

/* ═══════════════════════════════════════════════════════════════════════════
   isOwnerOnly(senderId, isFromMe?) → boolean
   Strict synchronous check — no sudo, no paired user grant.
   Used for strictOwnerOnly commands.
═══════════════════════════════════════════════════════════════════════════ */
function isOwnerOnly(senderId, isFromMe = false) {
    const ownerNum = _ownerNum();
    if (!ownerNum) return false;

    if (isFromMe) {
        return _isOwnerPhone(senderId);
    }

    if (!senderId) return false;

    // LID cache fallback
    const senderNum = cleanJid(senderId);
    const cached = lidToPhone.get(senderNum);
    if (cached) return _isOwnerPhone(cached);

    return _isOwnerPhone(senderId);
}

/* ═══════════════════════════════════════════════════════════════════════════
   isOwnerPhone(jid) → boolean   (sync utility)
═══════════════════════════════════════════════════════════════════════════ */
function isOwnerPhone(jid) {
    return _isOwnerPhone(jid);
}

/* ═══════════════════════════════════════════════════════════════════════════
   LEGACY COMPAT
═══════════════════════════════════════════════════════════════════════════ */
async function warmOwnerCache(sock) {
    const { warmLidCache } = require('./senderResolver');
    return warmLidCache(sock);
}

/* ═══════════════════════════════════════════════════════════════════════════
   EXPORTS
═══════════════════════════════════════════════════════════════════════════ */
module.exports                 = isOwnerOrSudo;
module.exports.isOwnerOrSudo   = isOwnerOrSudo;
module.exports.isOwnerOnly     = isOwnerOnly;
module.exports.isOwnerPhone    = isOwnerPhone;
module.exports.warmOwnerCache  = warmOwnerCache;

// Re-export shared utilities for callers that used to import from here
module.exports.cleanJid        = cleanJid;
module.exports.samePhone       = samePhone;
module.exports.lidCache        = lidToPhone;
module.exports.phoneLidMap     = require('./senderResolver').phoneToLid;
module.exports.cacheLid        = cacheLidMapping;
module.exports.isSudoFuzzy     = _isSudoAny;
module.exports.resolveLid      = _resolveLid;
