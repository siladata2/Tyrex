/*****************************************************************************
 *  PRESENCE MANAGER — REDXBOT302 v8.0 STEALTH                              *
 *  • Per-connection (supports multiple paired numbers)                      *
 *  • Bot shows OFFLINE (single tick) when user is offline                  *
 *  • Bot only appears online briefly when owner sends a message            *
 *  • Automatically re-applies offline every 5 min                         *
 *                                                                           *
 *  Exports: initPresenceManager(sock, number)                              *
 *           onOwnerActivity(sock, number)                                  *
 *           destroyPresenceManager(number)                                 *
 *                                                                           *
 *  © 2026 Abdul Rehman Rajpoot. All rights reserved.                       *
 *****************************************************************************/

'use strict';

const OWNER_ONLINE_MS   = 8_000;
const REAPPLY_OFFLINE_MS = 30 * 1000; // 30 seconds (was 5 minutes) — prevents Baileys from re-showing online

const _timers    = new Map();
const _intervals = new Map();

async function goOffline(sock) {
  try { await sock.sendPresenceUpdate('unavailable'); } catch {}
}

async function _pulse(sock, number) {
  try {
    const prev = _timers.get(number);
    if (prev) { clearTimeout(prev); _timers.delete(number); }
    await sock.sendPresenceUpdate('available');
    const t = setTimeout(() => {
      goOffline(sock).catch(() => {});
      _timers.delete(number);
    }, OWNER_ONLINE_MS);
    _timers.set(number, t);
  } catch {}
}

function initPresenceManager(sock, number) {
  destroyPresenceManager(number);
  // Go offline 3 seconds after connect
  setTimeout(() => goOffline(sock).catch(() => {}), 3_000);
  // Re-apply offline every 30 seconds to override any Baileys auto-presence
  const iv = setInterval(() => goOffline(sock).catch(() => {}), REAPPLY_OFFLINE_MS);
  _intervals.set(number, iv);
  console.log(`[PRESENCE:${number}] 🕵️ Stealth mode — bot appears offline`);
}

function onOwnerActivity(sock, number) {
  _pulse(sock, number).catch(() => {});
}

function destroyPresenceManager(number) {
  const iv = _intervals.get(number);
  if (iv) { clearInterval(iv); _intervals.delete(number); }
  const t  = _timers.get(number);
  if (t)  { clearTimeout(t);  _timers.delete(number); }
}

module.exports = { initPresenceManager, onOwnerActivity, destroyPresenceManager, goOffline };
