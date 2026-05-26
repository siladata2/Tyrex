# 🔧 REDXBOT FIXES — 2026-05-26

## Issues Fixed

### 1. ✅ Bot was NOT accessible in DMs / Groups for non-owners
**Root Cause:** Bot mode was being saved as `private` or `inbox` from a previous session.
On Heroku dyno restart, it loaded that saved mode, locking everyone out.

**Fix applied in `index.js`:**
- Mode loading logic now refuses to restore `private` or `self` from saved state.
- Bot always starts in `public` mode unless `BOT_MODE` env var says otherwise.
- Use `BOT_MODE=public` in Heroku Config Vars to make it permanent.

---

### 2. ✅ Antidelete commands NOT working (`.antidelete on/off`)
**Root Cause:** `index.js` tries to `require('./lib/antidelete')` but that file did NOT exist.
The actual implementation was in `plugins/antidelete.js`. The try-catch silently swallowed
the error and antidelete became a no-op.

**Fix applied:**
- Created `lib/antidelete.js` — a bridge file that re-exports `plugins/antidelete.js`.
- No changes to the actual antidelete logic needed.

---

### 3. ✅ Antidelete `handleMessageRevocation` not detecting deletions
**Root Cause:** The `messages.update` event fires `{ key, update }` objects, but the
handler was reading `revocationMessage.message?.protocolMessage?.key?.id` — the `message`
field is inside `update`, not at the top level.

**Fix applied in `plugins/antidelete.js`:**
- `handleMessageRevocation` now reads from both `revocationMessage.update` and
  `revocationMessage` directly so it works regardless of shape.

---

### 4. ✅ Default antidelete.json missing `delpath`
**Fix:** `data/antidelete.json` now includes `"delpath": "owner"` by default.

---

## How To Deploy

### Heroku Config Vars (required)
Set these in Heroku → Settings → Config Vars:
```
BOT_MODE=public
OWNER_NUMBER=92xxxxxxxxxx
BOT_NAME=REDXBOT302
PREFIX=.
```

### After Deploy
1. Send `.ping` — bot should reply to everyone (not just owner)
2. Send `.mode` — check current mode (should say PUBLIC)
3. Send `.antidelete on` — enable antidelete
4. Delete a message — bot should forward it to owner inbox

### Commands
- `.mode public`   — everyone in DMs and groups
- `.mode groups`   — only in groups
- `.mode inbox`    — only in DMs
- `.mode private`  — owner/sudo only
- `.antidelete on` — enable antidelete
- `.antidelete off` — disable
- `.antidelete delpath group` — report in group instead of owner inbox
