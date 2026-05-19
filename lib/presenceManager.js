/*****************************************************************************
 *  PRESENCE MANAGER — REDXBOT302 v7.0 ULTRA                               *
 *  Bot never shows 24/7 online (stealth mode).                            *
 *  When owner is offline → bot shows "last seen".                         *
 *  When owner sends a message → bot briefly appears online, then hides.   *
 *                                                                           *
 *  Exports: initPresenceManager(sock), onOwnerActivity(sock), goOffline   *
 *                                                                           *
 *  🌐  GitHub   : https://github.com/AbdulRehman19721986/redxbot302         *
 *  © 2026 Abdul Rehman Rajpoot. All rights reserved.                       *
 *****************************************************************************/

'use strict';

const OWNER_ONLINE_MS   = 8000;       // How long bot appears online after owner acts
const REAPPLY_OFFLINE_S = 5 * 60 * 1000; // Re-apply offline every 5 min

let _presenceTimer   = null;
let _offlineInterval = null;

/* ── Go offline ──────────────────────────────────────────────────────────── */
async function goOffline(sock) {
    try {
        await sock.sendPresenceUpdate('unavailable');
    } catch {}
}

/* ── Briefly go online then back offline ─────────────────────────────────── */
async function ownerPulse(sock) {
    try {
        if (_presenceTimer) {
            clearTimeout(_presenceTimer);
            _presenceTimer = null;
        }
        await sock.sendPresenceUpdate('available');
        _presenceTimer = setTimeout(() => goOffline(sock), OWNER_ONLINE_MS);
    } catch {}
}

/* ── Init on connect ─────────────────────────────────────────────────────── */
function initPresenceManager(sock) {
    // Clear any previous interval (reconnect safety)
    if (_offlineInterval) {
        clearInterval(_offlineInterval);
        _offlineInterval = null;
    }

    // Go offline 3 seconds after connect
    setTimeout(() => goOffline(sock), 3000);

    // Re-apply offline every 5 minutes (override baileys auto-presence)
    _offlineInterval = setInterval(() => goOffline(sock), REAPPLY_OFFLINE_S);

    // Cleanup on process exit
    process.once('exit', () => {
        if (_offlineInterval) clearInterval(_offlineInterval);
        if (_presenceTimer)   clearTimeout(_presenceTimer);
    });

    console.log('[PRESENCE] 🕵️ Stealth mode active — bot will NOT show 24/7 online');
}

/* ── Call when owner sends a message ─────────────────────────────────────── */
function onOwnerActivity(sock) {
    ownerPulse(sock).catch(() => {});
}

module.exports = { initPresenceManager, onOwnerActivity, goOffline };
