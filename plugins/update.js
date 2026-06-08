const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');
const settings = require('../settings');

// ─── GitHub ZIP source ───────────────────────────────────────────────────────
// Points to your custom backend repo's main branch ZIP
const GITHUB_ZIP_URL =
  'https://github.com/AbdulRehman19721986/redxminibot_beckend/archive/refs/heads/main.zip';

function run(cmd) {
  return new Promise((resolve, reject) => {
    exec(cmd, { windowsHide: true }, (err, stdout, stderr) => {
      if (err) return reject(new Error((stderr || stdout || err.message || '').toString()));
      resolve((stdout || '').toString());
    });
  });
}

async function hasGitRepo() {
  const gitDir = path.join(process.cwd(), '.git');
  if (!fs.existsSync(gitDir)) return false;
  try {
    await run('git --version');
    return true;
  } catch {
    return false;
  }
}

async function updateViaGit() {
  const oldRev = (await run('git rev-parse HEAD').catch(() => 'unknown')).trim();
  await run('git fetch --all --prune');
  const newRev = (await run('git rev-parse origin/main')).trim();
  const alreadyUpToDate = oldRev === newRev;
  const commits = alreadyUpToDate
    ? ''
    : await run(`git log --pretty=format:"%h %s (%an)" ${oldRev}..${newRev}`).catch(() => '');
  const files = alreadyUpToDate
    ? ''
    : await run(`git diff --name-status ${oldRev} ${newRev}`).catch(() => '');
  await run(`git reset --hard ${newRev}`);
  await run('git clean -fd');
  return { oldRev, newRev, alreadyUpToDate, commits, files };
}

function downloadFile(url, dest, visited = new Set()) {
  return new Promise((resolve, reject) => {
    try {
      if (visited.has(url) || visited.size > 5) {
        return reject(new Error('Too many redirects'));
      }
      visited.add(url);

      const useHttps = url.startsWith('https://');
      const client = useHttps ? require('https') : require('http');
      const req = client.get(
        url,
        {
          headers: {
            'User-Agent': 'MegaBot-Updater/1.0',
            Accept: '*/*',
          },
        },
        res => {
          if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
            const location = res.headers.location;
            if (!location) return reject(new Error(`HTTP ${res.statusCode} without Location`));
            const nextUrl = new URL(location, url).toString();
            res.resume();
            return downloadFile(nextUrl, dest, visited).then(resolve).catch(reject);
          }

          if (res.statusCode !== 200) {
            return reject(new Error(`HTTP ${res.statusCode}`));
          }

          const file = fs.createWriteStream(dest);
          res.pipe(file);
          file.on('finish', () => file.close(resolve));
          file.on('error', err => {
            try { file.close(() => {}); } catch {}
            fs.unlink(dest, () => reject(err));
          });
        }
      );
      req.on('error', err => {
        fs.unlink(dest, () => reject(err));
      });
    } catch (e) {
      reject(e);
    }
  });
}

async function extractZip(zipPath, outDir) {
  if (process.platform === 'win32') {
    const cmd = `powershell -NoProfile -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${outDir.replace(/\\/g, '/')}' -Force"`;
    await run(cmd);
    return;
  }
  try {
    await run('command -v unzip');
    await run(`unzip -o '${zipPath}' -d '${outDir}'`);
    return;
  } catch {}
  try {
    await run('command -v 7z');
    await run(`7z x -y '${zipPath}' -o'${outDir}'`);
    return;
  } catch {}
  try {
    await run('busybox unzip -h');
    await run(`busybox unzip -o '${zipPath}' -d '${outDir}'`);
    return;
  } catch {}
  throw new Error(
    'No system unzip tool found (unzip/7z/busybox). Git mode is recommended on this panel.'
  );
}

function copyRecursive(src, dest, ignore = [], relative = '', outList = []) {
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src)) {
    if (ignore.includes(entry)) continue;
    const s = path.join(src, entry);
    const d = path.join(dest, entry);
    const stat = fs.lstatSync(s);
    if (stat.isDirectory()) {
      copyRecursive(s, d, ignore, path.join(relative, entry), outList);
    } else {
      fs.copyFileSync(s, d);
      if (outList) outList.push(path.join(relative, entry).replace(/\\/g, '/'));
    }
  }
}

async function updateViaZip(zipOverride) {
  // Use provided URL, then fall back to the hardcoded GitHub ZIP
  const zipUrl = (zipOverride || settings.updateZipUrl || process.env.UPDATE_ZIP_URL || GITHUB_ZIP_URL).trim();

  const tmpDir = path.join(process.cwd(), 'tmp');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  const zipPath = path.join(tmpDir, 'update.zip');

  await downloadFile(zipUrl, zipPath);

  const extractTo = path.join(tmpDir, 'update_extract');
  if (fs.existsSync(extractTo)) fs.rmSync(extractTo, { recursive: true, force: true });
  await extractZip(zipPath, extractTo);

  // GitHub ZIPs extract into a single root folder — unwrap it
  const entries = fs.readdirSync(extractTo).map(n => path.join(extractTo, n));
  const root = entries[0];
  const srcRoot =
    root && fs.existsSync(root) && fs.lstatSync(root).isDirectory() ? root : extractTo;

  const ignore = ['node_modules', '.git', 'session', 'tmp', 'temp', 'data', 'baileys_store.json'];

  // Preserve owner settings across update
  let preservedOwner = null;
  let preservedBotOwner = null;
  try {
    const currentSettings = require('../settings');
    preservedOwner = currentSettings?.ownerNumber ? String(currentSettings.ownerNumber) : null;
    preservedBotOwner = currentSettings?.botOwner ? String(currentSettings.botOwner) : null;
  } catch {}

  const copied = [];
  copyRecursive(srcRoot, process.cwd(), ignore, '', copied);

  // Re-inject owner credentials into settings.js after overwrite
  if (preservedOwner) {
    try {
      const settingsPath = path.join(process.cwd(), 'settings.js');
      if (fs.existsSync(settingsPath)) {
        let text = fs.readFileSync(settingsPath, 'utf8');
        text = text.replace(/ownerNumber:\s*'[^']*'/, `ownerNumber: '${preservedOwner}'`);
        if (preservedBotOwner) {
          text = text.replace(/botOwner:\s*'[^']*'/, `botOwner: '${preservedBotOwner}'`);
        }
        fs.writeFileSync(settingsPath, text);
      }
    } catch {}
  }

  try { fs.rmSync(extractTo, { recursive: true, force: true }); } catch {}
  try { fs.rmSync(zipPath, { force: true }); } catch {}

  return { copiedFiles: copied };
}

async function restartProcess() {
  try {
    await run('npm install --no-audit --no-fund');
  } catch {}
  try {
    await run('pm2 restart all');
    return;
  } catch {}
  setTimeout(() => process.exit(0), 300);
}

// ─── Helper: send a private message ONLY to the bot owner ────────────────────
async function notifyOwner(sock, message, text, channelInfo) {
  try {
    const ownerJid =
      (settings.ownerNumber || '').replace(/[^0-9]/g, '') + '@s.whatsapp.net';
    await sock.sendMessage(ownerJid, { text, ...channelInfo });
  } catch {
    // If owner notify fails, silently ignore — never surface to regular chats
  }
}

// ─────────────────────────────────────────────────────────────────────────────
module.exports = {
  command: 'update',
  aliases: ['upgrade', 'restart'],
  category: 'owner',
  description: 'Silently update bot from GitHub repo without alerting users',
  usage: '.update [zip_url]',
  ownerOnly: true,

  async handler(sock, message, args, context) {
    const { chatId, channelInfo } = context;

    // ── SILENT: do NOT send any message to the current chat if it's not a
    //    private owner DM. This prevents group members / other users from
    //    seeing the update process at all.
    const ownerNumber = (settings.ownerNumber || '').replace(/[^0-9]/g, '');
    const senderJid = message?.key?.participant || message?.key?.remoteJid || '';
    const senderNumber = senderJid.replace(/[^0-9]/g, '');
    const isOwnerChat = senderNumber === ownerNumber;

    // Only show live feedback if the owner is messaging the bot in their own DM
    const liveReply = isOwnerChat
      ? async (text) => sock.sendMessage(chatId, { text, ...channelInfo }, { quoted: message })
      : async () => {}; // no-op for everyone else

    try {
      await liveReply('⚙️ Starting silent update...');

      const useGit = await hasGitRepo();
      let summary = '';

      if (useGit) {
        await liveReply('📦 Pulling from Git...');
        const { oldRev, newRev, alreadyUpToDate, commits, files } = await updateViaGit();

        if (alreadyUpToDate) {
          summary = `✅ Already up to date\n🔖 Commit: ${newRev.substring(0, 7)}`;
        } else {
          summary = `✅ Git update done!\n📌 ${oldRev.substring(0, 7)} → ${newRev.substring(0, 7)}`;
          if (commits) {
            const lines = commits.split('\n').slice(0, 5);
            summary += `\n\n📝 Commits:\n${lines.map(c => `• ${c}`).join('\n')}`;
          }
          const fileCount = files ? files.split('\n').length : 0;
          summary += `\n📁 Files changed: ${fileCount}`;
        }

        await run('npm install --no-audit --no-fund');
      } else {
        await liveReply('📦 Downloading ZIP from GitHub...');
        const zipOverride = args[0] || null;
        const { copiedFiles } = await updateViaZip(zipOverride);
        summary = `✅ ZIP update done!\n📁 Files updated: ${copiedFiles.length}`;
      }

      // Append version if available
      try {
        delete require.cache[require.resolve('../settings')];
        const newSettings = require('../settings');
        const v = newSettings.version || 'unknown';
        summary += `\n🔖 Version: ${v}`;
      } catch {}

      summary += '\n\n♻️ Restarting...';

      // ── Notify ONLY the owner (in their private DM), regardless of where
      //    the command was triggered from.
      if (!isOwnerChat) {
        await notifyOwner(sock, message, `🤖 Silent update complete:\n${summary}`, channelInfo);
      } else {
        await liveReply(summary);
      }

      await restartProcess();
    } catch (err) {
      console.error('Update failed:', err);
      const errMsg = `❌ Update failed:\n${String(err.message || err)}`;

      if (!isOwnerChat) {
        // Send failure only to owner's private DM, not to the triggering chat
        await notifyOwner(sock, message, errMsg, channelInfo);
      } else {
        await sock.sendMessage(chatId, { text: errMsg, ...channelInfo }, { quoted: message });
      }
    }
  },
};
