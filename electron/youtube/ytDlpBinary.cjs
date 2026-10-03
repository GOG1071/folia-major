'use strict';

const fs = require('fs');
const path = require('path');

// electron/youtube/ytDlpBinary.cjs
// Resolves the bundled yt-dlp executable: env override, then the in-repo dev slot, then the packaged slot.

const YTDLP_ENV_VAR = 'FOLIA_YTDLP_PATH';
const PLATFORM_NAMES = { darwin: 'mac', linux: 'linux', win32: 'win' };

class YtDlpMissingError extends Error {
    constructor(candidates) {
        super('yt-dlp binary was not found');
        this.name = 'YtDlpMissingError';
        this.code = 'ytdlp-missing';
        this.candidates = candidates;
    }
}

const isFile = candidate => {
    try {
        return fs.statSync(candidate).isFile();
    } catch {
        return false;
    }
};

/** Lists candidate paths in priority order; pure so it can be unit-tested per platform. */
const buildYtDlpCandidates = ({ env = process.env, platform = process.platform, arch = process.arch, appPath, resourcesPath } = {}) => {
    const binaryName = platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp';
    const osName = PLATFORM_NAMES[platform] ?? platform;
    const candidates = [];
    const fromEnv = env[YTDLP_ENV_VAR];
    if (typeof fromEnv === 'string' && fromEnv.trim()) candidates.push(fromEnv.trim());
    if (appPath) candidates.push(path.join(appPath, 'build', 'yt-dlp', `${osName}-${arch}`, binaryName));
    if (resourcesPath) candidates.push(path.join(resourcesPath, 'yt-dlp', binaryName));
    return candidates;
};

/** Returns the first existing candidate or throws a `ytdlp-missing` error. */
const resolveYtDlpBinary = options => {
    const candidates = buildYtDlpCandidates(options);
    const found = candidates.find(isFile);
    if (!found) throw new YtDlpMissingError(candidates);
    return found;
};

module.exports = { YTDLP_ENV_VAR, YtDlpMissingError, buildYtDlpCandidates, resolveYtDlpBinary };
