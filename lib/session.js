/**
 * lib/session.js — REDXBOT302 Universal Session Loader
 *
 * Supported SESSION_ID formats:
 *
 *  1.  REDXBOT302~<base64>         → pair-code session (pair.js output)
 *  2.  REDXBOT302~MEGA_<id#key>    → QR session       (qr.js output)
 *  3.  KIRA-MD~<base64>            → KIRA-MD bot format
 *  4.  <ANY_PREFIX>~<base64>       → any tilde-prefixed base64 session
 *  5.  <ANY_PREFIX>~MEGA_<id#key>  → any tilde-prefixed MEGA session
 *  6.  https://mega.nz/file/<id#key>  → raw MEGA full URL
 *  7.  https://mega.nz/#!<id>!<key>   → legacy MEGA URL style
 *  8.  <id#key>                    → bare MEGA file ID
 *  9.  https://pastebin.com/<id>   → pastebin URL (fetches raw content)
 * 10.  https://paste.pm/<id>       → paste.pm URL
 * 11.  <any paste URL>             → generic paste URL fetch
 * 12.  <base64 string>             → raw base64-encoded creds.json
 * 13.  { ... }                     → raw JSON creds.json string
 */

'use strict';

const path  = require('path');
const fs    = require('fs');
const https = require('https');
const http  = require('http');

/* ──────────────────────────────────────────────────────────────
   HELPER: BASE64
   ────────────────────────────────────────────────────────────── */

function padBase64(str) {
    const clean = str.replace(/\s/g, '');
    const pad   = clean.length % 4;
    if (pad === 1) return clean + '===';
    if (pad === 2) return clean + '==';
    if (pad === 3) return clean + '=';
    return clean;
}

/**
 * Try to decode str as base64 → UTF-8 JSON.
 * Returns the decoded JSON string on success, null on failure.
 */
function tryBase64(str) {
    try {
        const padded = padBase64(str.replace(/\s/g, ''));
        // Must contain only base64 chars
        if (!/^[A-Za-z0-9+/]+=*$/.test(padded)) return null;
        const text = Buffer.from(padded, 'base64').toString('utf8').trim();
        JSON.parse(text); // validate JSON
        return text;
    } catch {
        return null;
    }
}

/* ──────────────────────────────────────────────────────────────
   HELPER: VALIDATE CREDS
   ────────────────────────────────────────────────────────────── */

const REQUIRED_FIELDS = [
    'noiseKey', 'signedIdentityKey', 'signedPreKey',
    'registrationId', 'advSecretKey', 'me',
];

function validateCreds(jsonText) {
    const creds   = JSON.parse(jsonText);
    const missing = REQUIRED_FIELDS.filter(f => !creds[f]);
    if (missing.length > 0) {
        throw new Error(`Incomplete session — missing: ${missing.join(', ')}`);
    }
    if (creds.registered === false) {
        throw new Error('Session is not registered — re-pair the bot.');
    }
    return creds;
}

/* ──────────────────────────────────────────────────────────────
   HELPER: MEGA DOWNLOAD
   ────────────────────────────────────────────────────────────── */

/**
 * Build a proper mega.nz URL from any MEGA fragment:
 *   MEGA_<id#key>          → https://mega.nz/file/<id#key>
 *   <id#key>               → https://mega.nz/file/<id#key>
 *   https://mega.nz/...    → unchanged
 *   https://mega.nz/#!id!key → unchanged (legacy)
 */
function normalizeMegaUrl(raw) {
    let s = raw.trim();
    if (s.startsWith('MEGA_')) s = s.slice(5);       // strip helper prefix
    if (s.startsWith('https://mega.nz') ||
        s.startsWith('http://mega.nz'))  return s;   // already full URL
    return `https://mega.nz/file/${s}`;
}

async function downloadMega(megaUrl) {
    const { File } = require('megajs');
    return new Promise((resolve, reject) => {
        const file = File.fromURL(megaUrl);
        file.download((err, data) => {
            if (err) return reject(new Error(`MEGA download error: ${err.message}`));
            resolve(data);
        });
    });
}

/* ──────────────────────────────────────────────────────────────
   HELPER: HTTP FETCH (pastebin / generic paste URL)
   ────────────────────────────────────────────────────────────── */

function toRawPasteUrl(url) {
    // pastebin.com/XXXX → pastebin.com/raw/XXXX
    if (/pastebin\.com\/(?!raw\/)([A-Za-z0-9]+)$/.test(url)) {
        return url.replace(/pastebin\.com\/([A-Za-z0-9]+)$/, 'pastebin.com/raw/$1');
    }
    // paste.pm/XXXX → paste.pm/raw/XXXX
    if (/paste\.pm\/(?!raw\/)([A-Za-z0-9]+)$/.test(url)) {
        return url.replace(/paste\.pm\/([A-Za-z0-9]+)$/, 'paste.pm/raw/$1');
    }
    // hastebin / ghostbin / similar
    if (/hastebin\.com\/(?!raw\/)([A-Za-z0-9.]+)$/.test(url)) {
        return url.replace(/hastebin\.com\/([A-Za-z0-9.]+)$/, 'hastebin.com/raw/$1');
    }
    return url; // assume already raw
}

function httpGet(url) {
    return new Promise((resolve, reject) => {
        const mod = url.startsWith('https') ? https : http;
        mod.get(url, { headers: { 'User-Agent': 'REDXBOT302-SessionLoader/1.0' } }, res => {
            // Follow redirects (up to 5)
            if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
                return httpGet(res.headers.location).then(resolve).catch(reject);
            }
            if (res.statusCode !== 200) {
                return reject(new Error(`HTTP ${res.statusCode} from ${url}`));
            }
            let body = '';
            res.on('data', c => body += c);
            res.on('end', () => resolve(body));
        }).on('error', reject);
    });
}

/* ──────────────────────────────────────────────────────────────
   WRITE CREDS TO DISK
   ────────────────────────────────────────────────────────────── */

function writeCreds(credsText, authDir) {
    if (!fs.existsSync(authDir)) fs.mkdirSync(authDir, { recursive: true });
    const credsPath = path.join(authDir, 'creds.json');
    fs.writeFileSync(credsPath, credsText, 'utf8');
    return credsPath;
}

/* ──────────────────────────────────────────────────────────────
   MAIN EXPORT: SaveCreds(sessionInput, [authDir])
   ────────────────────────────────────────────────────────────── */

async function SaveCreds(sessionInput, authDir) {
    // Resolve session dir — default is <bot-root>/session
    const SESSION_DIR = authDir ||
        path.join(path.dirname(require.main ? require.main.filename : __filename), 'session');

    if (!sessionInput || typeof sessionInput !== 'string') {
        throw new Error('SESSION_ID is empty or not a string.');
    }

    const session = sessionInput.trim();
    console.log('⬇️  Universal session loader — detecting format...');

    /* ── STRATEGY 1: Tilde-prefixed  PREFIX~PAYLOAD ──────────────────────── */
    const tildeIdx = session.indexOf('~');
    if (tildeIdx > 0) {
        const prefix  = session.slice(0, tildeIdx);  // e.g. REDXBOT302, KIRA-MD
        const payload = session.slice(tildeIdx + 1); // everything after ~

        console.log(`🔑 Prefix detected: ${prefix}~`);

        // 1a. MEGA payload inside tilde  e.g. REDXBOT302~MEGA_abc123#xyz
        if (payload.startsWith('MEGA_') ||
            (payload.includes('#') && !payload.startsWith('ey') && !payload.startsWith('{'))) {
            console.log('📦 MEGA payload in tilde format');
            try {
                const megaUrl = normalizeMegaUrl(payload);
                const buf     = await downloadMega(megaUrl);
                const text    = buf.toString('utf8').trim();
                validateCreds(text);
                writeCreds(text, SESSION_DIR);
                console.log(`✅ ${prefix}~MEGA session restored`);
                return JSON.parse(text);
            } catch (err) {
                throw new Error(`${prefix}~MEGA decode failed: ${err.message}`);
            }
        }

        // 1b. Base64 payload  e.g. REDXBOT302~eyJ... or KIRA-MD~eyJ...
        const decoded = tryBase64(payload);
        if (decoded) {
            validateCreds(decoded);
            writeCreds(decoded, SESSION_DIR);
            console.log(`✅ ${prefix}~ base64 session restored`);
            return JSON.parse(decoded);
        }

        throw new Error(
            `${prefix}~ payload is neither valid base64 nor MEGA. ` +
            'Check your SESSION_ID from the pair site.'
        );
    }

    /* ── STRATEGY 2: Full MEGA URL ───────────────────────────────────────── */
    if (session.startsWith('https://mega.nz') || session.startsWith('http://mega.nz')) {
        console.log('🔗 MEGA URL detected');
        const buf  = await downloadMega(session);
        const text = buf.toString('utf8').trim();
        validateCreds(text);
        writeCreds(text, SESSION_DIR);
        console.log('✅ MEGA session restored');
        return JSON.parse(text);
    }

    /* ── STRATEGY 3: Paste / generic HTTPS URL ───────────────────────────── */
    if (session.startsWith('https://') || session.startsWith('http://')) {
        console.log('📋 URL detected — fetching paste content...');
        const rawUrl  = toRawPasteUrl(session);
        const content = (await httpGet(rawUrl)).trim();

        // Content could itself be a session ID (recursive) — handle one level
        if (content.includes('~') || content.startsWith('https://')) {
            console.log('🔁 Paste contains another session ID — resolving...');
            return SaveCreds(content, SESSION_DIR);
        }

        // Try base64
        const dec = tryBase64(content);
        if (dec) {
            validateCreds(dec);
            writeCreds(dec, SESSION_DIR);
            console.log('✅ Paste base64 session restored');
            return JSON.parse(dec);
        }

        // Try raw JSON
        try {
            validateCreds(content);
            writeCreds(content, SESSION_DIR);
            console.log('✅ Paste raw-JSON session restored');
            return JSON.parse(content);
        } catch {
            throw new Error('Paste content is neither valid base64 nor valid creds JSON.');
        }
    }

    /* ── STRATEGY 4: Bare MEGA file ID  e.g. ABcD1234#keypart ──────────── */
    if (session.includes('#') && !session.startsWith('{')) {
        console.log('📦 Bare MEGA file ID detected');
        const megaUrl = normalizeMegaUrl(session);
        const buf     = await downloadMega(megaUrl);
        const text    = buf.toString('utf8').trim();
        validateCreds(text);
        writeCreds(text, SESSION_DIR);
        console.log('✅ MEGA file-ID session restored');
        return JSON.parse(text);
    }

    /* ── STRATEGY 5: Raw base64 (any length, including "64-char" compact) ── */
    const dec = tryBase64(session);
    if (dec) {
        validateCreds(dec);
        writeCreds(dec, SESSION_DIR);
        console.log('✅ Raw base64 session restored');
        return JSON.parse(dec);
    }

    /* ── STRATEGY 6: Raw JSON creds string ───────────────────────────────── */
    if (session.startsWith('{')) {
        try {
            validateCreds(session);
            writeCreds(session, SESSION_DIR);
            console.log('✅ Raw JSON session restored');
            return JSON.parse(session);
        } catch (err) {
            throw new Error(`Raw JSON session invalid: ${err.message}`);
        }
    }

    /* ── All strategies exhausted ────────────────────────────────────────── */
    throw new Error(
        '❌ Unrecognized SESSION_ID format.\n' +
        'Supported: PREFIX~base64 | PREFIX~MEGA_id#key | mega.nz URL | ' +
        'id#key | pastebin URL | raw base64 | raw JSON'
    );
}

module.exports = SaveCreds;
