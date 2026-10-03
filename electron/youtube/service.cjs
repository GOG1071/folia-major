'use strict';

const fs = require('fs');
const path = require('path');
const { parseYoutubeVideoId, buildCanonicalYoutubeUrl } = require('../../shared/youtubeVideoId.cjs');
const { resolveYtDlpBinary } = require('./ytDlpBinary.cjs');
const { buildYtDlpArgs, runYtDlp } = require('./ytDlpRunner.cjs');
const {
    getYoutubeCacheDirectory,
    isCachedAudioFileName,
    readCachedEntry,
    removePartialFiles,
    writeCachedMeta,
} = require('./cache.cjs');
const { buildYoutubeAudioUrl, registerYoutubeProtocol } = require('./protocol.cjs');

// electron/youtube/service.cjs
// Imports a YouTube video's audio through the bundled yt-dlp into a per-id cache and exposes it
// to the renderer as a folia-youtube:// URL. Concurrent imports of one id share a single download.

const nonEmptyString = value => (typeof value === 'string' && value.trim() ? value.trim() : undefined);
const httpUrl = value => {
    const text = nonEmptyString(value);
    return text && /^https?:\/\//i.test(text) ? text : undefined;
};

/** Reduces yt-dlp's printed info dict to the persisted/IPC metadata shape (no audioUrl yet). */
const normalizeTrackMeta = (videoId, raw, audioFile) => {
    const duration = Number(raw?.duration);
    return {
        videoId,
        audioFile,
        title: nonEmptyString(raw?.title) ?? videoId,
        track: nonEmptyString(raw?.track),
        artist: nonEmptyString(raw?.artist) ?? nonEmptyString(raw?.creator),
        uploader: nonEmptyString(raw?.uploader),
        channel: nonEmptyString(raw?.channel),
        album: nonEmptyString(raw?.album),
        durationMs: Number.isFinite(duration) && duration > 0 ? Math.round(duration * 1000) : 0,
        thumbnailUrl: httpUrl(raw?.thumbnail),
    };
};

/** Strips the on-disk file name from persisted metadata and attaches the public audio URL. */
const toPublicTrack = meta => {
    const { audioFile: _audioFile, ...rest } = meta;
    return { ...rest, audioUrl: buildYoutubeAudioUrl(meta.videoId) };
};

const createYoutubeService = ({
    app,
    protocol,
    resolveBinary = resolveYtDlpBinary,
    run = runYtDlp,
    spawnProcess,
    execPath = process.execPath,
    log = (event, details) => console.warn('[YouTube]', event, details),
} = {}) => {
    const cacheDir = getYoutubeCacheDirectory(app.getPath('userData'));
    const jobs = new Map();

    const resolveEntry = async videoId => {
        try {
            return await readCachedEntry(cacheDir, videoId);
        } catch {
            return null;
        }
    };

    const download = async (videoId, notify) => {
        let binaryPath;
        try {
            binaryPath = resolveBinary({ appPath: app.getAppPath(), resourcesPath: process.resourcesPath });
        } catch (error) {
            if (error.code === 'ytdlp-missing') {
                log('yt-dlp missing', { candidates: error.candidates });
                return { ok: false, code: 'ytdlp-missing', message: 'yt-dlp binary is missing' };
            }
            throw error;
        }

        await fs.promises.mkdir(cacheDir, { recursive: true });
        const args = buildYtDlpArgs({
            canonicalUrl: buildCanonicalYoutubeUrl(videoId),
            outputDir: cacheDir,
            videoId,
            // Electron's own binary doubles as the Node >= 22 runtime yt-dlp needs for YouTube.
            jsRuntimePath: execPath,
        });
        try {
            const raw = await run({
                binaryPath,
                args,
                env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
                onProgress: notify,
                spawnProcess,
            });
            const audioFile = path.basename(String(raw?.filepath ?? ''));
            if (!isCachedAudioFileName(videoId, audioFile)) {
                throw Object.assign(new Error('yt-dlp reported an unexpected output file'), { code: 'download-failed' });
            }
            const stat = await fs.promises.stat(path.join(cacheDir, audioFile));
            if (!stat.isFile() || stat.size === 0) {
                throw Object.assign(new Error('yt-dlp output file is empty'), { code: 'download-failed' });
            }
            const meta = normalizeTrackMeta(videoId, raw, audioFile);
            await writeCachedMeta(cacheDir, meta);
            return { ok: true, track: toPublicTrack(meta) };
        } catch (error) {
            await removePartialFiles(cacheDir, videoId);
            const code = error.code === 'timeout' ? 'timeout' : 'download-failed';
            log('import failed', { videoId, code, message: error.message, stderrTail: error.stderrTail });
            return { ok: false, code, message: code === 'timeout' ? 'YouTube download timed out' : 'YouTube download failed' };
        }
    };

    /** Imports (or reuses) the audio for a pasted URL. Always resolves; failures carry a stable `code`. */
    const importTrack = async (url, { onProgress } = {}) => {
        const videoId = parseYoutubeVideoId(url);
        if (!videoId) return { ok: false, code: 'invalid-url', message: 'Not a supported YouTube link' };

        const cached = await resolveEntry(videoId);
        if (cached) return { ok: true, track: toPublicTrack(cached.meta) };

        let job = jobs.get(videoId);
        if (!job) {
            const listeners = new Set();
            let lastPercent = -1;
            // yt-dlp reports per chunk; forward only whole-percent changes to keep IPC quiet.
            const notify = percent => {
                const whole = Math.floor(percent);
                if (whole === lastPercent) return;
                lastPercent = whole;
                listeners.forEach(listener => listener(whole));
            };
            const promise = download(videoId, notify)
                .catch(error => {
                    log('import crashed', { videoId, message: error?.message });
                    return { ok: false, code: 'download-failed', message: 'YouTube download failed' };
                })
                .finally(() => jobs.delete(videoId));
            job = { promise, listeners };
            jobs.set(videoId, job);
        }
        if (onProgress) job.listeners.add(percent => onProgress({ videoId, percent }));
        return job.promise;
    };

    const registerProtocol = () => registerYoutubeProtocol({ protocol, resolveEntry });

    return { importTrack, registerProtocol, resolveEntry };
};

module.exports = { createYoutubeService, normalizeTrackMeta, toPublicTrack };
