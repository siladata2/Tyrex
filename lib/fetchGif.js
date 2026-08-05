const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { tmpdir } = require('os');
const Crypto = require('crypto');
const ffmpeg = require('fluent-ffmpeg');
const { execSync } = require('child_process');

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
    return 'ffmpeg';
}

ffmpeg.setFfmpegPath(resolveFfmpegPath());

/**
 * Fetch a GIF from a given API URL.
 * @param {string} url - The API endpoint to fetch the GIF.
 * @returns {Promise<Buffer>} - The GIF buffer.
 */
async function fetchGif(url) {
    try {
        const response = await axios.get(url, { responseType: 'arraybuffer' });
        return response.data;
    } catch (error) {
        console.error("❌ Error fetching GIF:", error);
        throw new Error("Could not fetch GIF.");
    }
}

/**
 * Converts a GIF buffer to a video buffer.
 * @param {Buffer} gifBuffer - The GIF buffer.
 * @returns {Promise<Buffer>} - The MP4 video buffer.
 */
async function gifToVideo(gifBuffer) {
    const filename = Crypto.randomBytes(6).toString('hex');
    const gifPath = path.join(tmpdir(), `${filename}.gif`);
    const mp4Path = path.join(tmpdir(), `${filename}.mp4`);

    fs.writeFileSync(gifPath, gifBuffer);

    await new Promise((resolve, reject) => {
        ffmpeg(gifPath)
            .outputOptions([
                "-movflags faststart",
                "-pix_fmt yuv420p",
                "-vf scale=trunc(iw/2)*2:trunc(ih/2)*2"
            ])
            .on("error", (err) => {
                console.error("❌ ffmpeg conversion error:", err);
                reject(new Error("Could not process GIF to video."));
            })
            .on("end", resolve)
            .save(mp4Path);
    });

    const videoBuffer = fs.readFileSync(mp4Path);
    fs.unlinkSync(gifPath);
    fs.unlinkSync(mp4Path);

    return videoBuffer;
}

module.exports = { fetchGif, gifToVideo };
  
