const express = require('express');
const { createServer } = require('http');
const packageInfo = require('../package.json');

const app = express();
const server = createServer(app);
const PORT = process.env.PORT || 10000;

app.get('/', (req, res) => {
    const uptimeSeconds = Math.floor(process.uptime());
    const hours = Math.floor(uptimeSeconds / 3600);
    const minutes = Math.floor((uptimeSeconds % 3600) / 60);
    const seconds = uptimeSeconds % 60;
    const uptimeString = `${hours}h ${minutes}m ${seconds}s`;

    res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${packageInfo.name.toUpperCase()} Status</title>
        <style>
            :root { --primary: #25d366; --bg: #0f172a; --card-bg: rgba(30, 41, 59, 0.7); }
            body { 
                margin: 0; padding: 0; background: var(--bg); color: white; 
                font-family: 'Inter', system-ui, sans-serif;
                display: flex; justify-content: center; align-items: center; min-height: 100vh;
            }
            .container {
                background: var(--card-bg); backdrop-filter: blur(12px);
                border: 1px solid rgba(255,255,255,0.1); padding: 30px;
                border-radius: 24px; width: 90%; max-width: 400px; text-align: center;
                box-shadow: 0 20px 50px rgba(0,0,0,0.5);
            }
            .status-badge {
                display: inline-flex; align-items: center; background: rgba(37, 211, 102, 0.1);
                color: var(--primary); padding: 5px 15px; border-radius: 50px;
                font-size: 0.8rem; font-weight: bold; margin-bottom: 20px;
            }
            .dot { height: 8px; width: 8px; background: var(--primary); border-radius: 50%; margin-right: 8px; box-shadow: 0 0 10px var(--primary); }
            h1 { margin: 0; font-size: 1.8rem; letter-spacing: 1px; }
            .desc { color: #94a3b8; margin: 10px 0 25px 0; font-size: 0.9rem; }
            .grid { display: grid; gap: 12px; }
            .item { 
                background: rgba(0,0,0,0.2); padding: 12px 18px; border-radius: 12px;
                display: flex; justify-content: space-between; align-items: center;
            }
            .label { color: #64748b; font-size: 0.75rem; text-transform: uppercase; font-weight: 800; }
            .val { font-weight: 600; font-family: monospace; color: #f1f5f9; }
            footer { margin-top: 25px; font-size: 0.7rem; color: #475569; letter-spacing: 1px; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="status-badge"><span class="dot"></span> SYSTEM ONLINE</div>
            <h1>${packageInfo.name.toUpperCase()}</h1>
            <p class="desc">${packageInfo.description}</p>
            
            <div class="grid">
                <div class="item"><span class="label">Version</span><span class="val">${packageInfo.version}</span></div>
                <div class="item"><span class="label">Author</span><span class="val">Abdul Rehman Rajpoot</span></div>
                <div class="item"><span class="label">Uptime</span><span class="val">${uptimeString}</span></div>
            </div>

            <footer>POWERED BY REDX BOT DEPLOYER</footer>
        </div>
    </body>
    </html>
    `);
});

app.get('/health', (req,res)=>res.json({status:'ok',uptime:process.uptime()}));
app.get('/ping', (req, res) => res.json({ status: 'ok', uptime: process.uptime() }));

app.get('/process', (req, res) => {
    const { send } = req.query;
    if (!send) return res.status(400).json({ error: 'Missing send query' });
    res.json({ status: 'Received', data: send });
});

app.get('/chat', (req, res) => {
    const { message, to } = req.query;
    if (!message || !to) return res.status(400).json({ error: 'Missing message or to query' });
    res.json({ status: 200, info: 'Message received (integration not implemented)' });
});

// ─── Self-ping keepalive ─────────────────────────────────────────────────────
// Render free tier sleeps after 15min of no HTTP requests.
// Self-ping every 10 minutes keeps service awake 24/7.
// To activate: set RENDER_EXTERNAL_URL in Render dashboard env vars.
// e.g. https://redxbot302.onrender.com
const https = require('https');
const http  = require('http');

const SELF_URL      = process.env.RENDER_EXTERNAL_URL || process.env.SELF_URL || null;
const PING_INTERVAL = 10 * 60 * 1000; // 10 min — well under 15min sleep threshold
let   _pingFails    = 0;

function doPing() {
    if (!SELF_URL) return;
    try {
        const url     = new URL('/health', SELF_URL);
        const lib     = url.protocol === 'https:' ? https : http;
        const req     = lib.get(url.href, (res) => {
            _pingFails = 0;
            res.resume();
            console.log(`[KEEPALIVE] ✅ Ping OK (${res.statusCode}) — service alive`);
        });
        req.on('error', (e) => {
            _pingFails++;
            console.log(`[KEEPALIVE] ⚠️ Ping fail #${_pingFails}: ${e.message}`);
            // If 3 consecutive fails, ping faster to wake up
            if (_pingFails >= 3) setTimeout(doPing, 30000);
        });
        req.setTimeout(15000, () => { req.destroy(); });
    } catch (e) {
        console.error('[KEEPALIVE] Ping error:', e.message);
    }
}

if (SELF_URL) {
    // First ping after 30s (let server fully start)
    setTimeout(doPing, 30000);
    setInterval(doPing, PING_INTERVAL);
    console.log(`[KEEPALIVE] 🟢 Self-ping active → ${SELF_URL} every 10min`);
} else {
    console.log('[KEEPALIVE] ⚠️  RENDER_EXTERNAL_URL not set — self-ping disabled');
    console.log('[KEEPALIVE]    Set it in Render env vars to keep service alive 24/7');
}

module.exports = { app, server, PORT };
