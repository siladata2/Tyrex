const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { tmpdir } = require('os');
const ffmpeg = require('fluent-ffmpeg');

// Resolve ffmpeg binary — works on both Docker (system) and native (installer pkg)
function resolveFfmpegPath() {
    if (process.env.FFMPEG_PATH && fs.existsSync(process.env.FFMPEG_PATH)) {
        return process.env.FFMPEG_PATH;
    }
    try {
        const inst = require('@ffmpeg-installer/ffmpeg');
        if (inst && inst.path && fs.existsSync(inst.path)) return inst.path;
    } catch {}
    try {
        const p = execSync('which ffmpeg 2>/dev/null').toString().trim();
        if (p && fs.existsSync(p)) return p;
    } catch {}
    for (const p of ['/usr/bin/ffmpeg', '/usr/local/bin/ffmpeg']) {
        if (fs.existsSync(p)) return p;
    }
    return 'ffmpeg'; // let OS resolve
}

// Set ffmpeg path
ffmpeg.setFfmpegPath(resolveFfmpegPath());

class StickerConverter {
    constructor() {
        // Use OS /tmp — avoids broken cwd on Render native runtime
        this.tempDir = path.join(tmpdir(), 'redxbot-tmp');
        this.ensureTempDir();
    }

    ensureTempDir() {
        if (!fs.existsSync(this.tempDir)) {
            fs.mkdirSync(this.tempDir, { recursive: true });
        }
    }

    async convertStickerToImage(stickerBuffer) {
        const tempPath = path.join(this.tempDir, `sticker_${Date.now()}.webp`);
        const outputPath = path.join(this.tempDir, `image_${Date.now()}.png`);

        try {
            // Save sticker to temp file
            await fs.promises.writeFile(tempPath, stickerBuffer);

            // Convert using fluent-ffmpeg (same as your video sticker converter)
            await new Promise((resolve, reject) => {
                ffmpeg(tempPath)
                    .on('error', reject)
                    .on('end', resolve)
                    .output(outputPath)
                    .run();
            });

            // Read and return converted image
            return await fs.promises.readFile(outputPath);
        } catch (error) {
            console.error('Conversion error:', error);
            throw new Error('Failed to convert sticker to image');
        } finally {
            // Cleanup temp files
            await Promise.all([
                fs.promises.unlink(tempPath).catch(() => {}),
                fs.promises.unlink(outputPath).catch(() => {})
            ]);
        }
    }
}

module.exports = new StickerConverter();
