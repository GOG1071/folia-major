'use strict';

const fs = require('fs');
const path = require('path');
const { VIDEO_ID_PATTERN } = require('../../shared/youtubeVideoId.cjs');

// electron/youtube/cache.cjs
// On-disk layout of imported YouTube audio: <userData>/youtube-audio/<id>.<ext> plus <id>.json metadata.

const CACHE_DIR_NAME = 'youtube-audio';
const AUDIO_MIME_TYPES = {
    '.m4a': 'audio/mp4',
    '.mp4': 'audio/mp4',
    '.webm': 'audio/webm',
    '.opus': 'audio/ogg',
    '.ogg': 'audio/ogg',
    '.mp3': 'audio/mpeg',
    '.aac': 'audio/aac',
};

const getYoutubeCacheDirectory = userDataPath => path.join(userDataPath, CACHE_DIR_NAME);

/** Rejects anything that is not a plain 11-char id, so ids can never carry path separators. */
const assertVideoId = videoId => {
    if (typeof videoId !== 'string' || !VIDEO_ID_PATTERN.test(videoId)) throw new Error('Invalid YouTube video id');
    return videoId;
};

const getMimeTypeForFile = fileName => AUDIO_MIME_TYPES[path.extname(fileName).toLowerCase()] ?? null;

/** True only for `<id>.<known audio ext>`, the sole file names the cache ever serves. */
const isCachedAudioFileName = (videoId, fileName) => {
    if (typeof fileName !== 'string' || path.basename(fileName) !== fileName) return false;
    return fileName.startsWith(`${videoId}.`) && getMimeTypeForFile(fileName) !== null;
};

/**
 * Reads `<id>.json` and verifies the audio file it names still exists.
 * Returns `{ meta, audioPath, mimeType }` or null for a miss/corrupt entry.
 */
const readCachedEntry = async (cacheDir, videoId) => {
    assertVideoId(videoId);
    try {
        const meta = JSON.parse(await fs.promises.readFile(path.join(cacheDir, `${videoId}.json`), 'utf8'));
        if (!meta || meta.videoId !== videoId || !isCachedAudioFileName(videoId, meta.audioFile)) return null;
        const audioPath = path.join(cacheDir, meta.audioFile);
        const stat = await fs.promises.stat(audioPath);
        if (!stat.isFile() || stat.size === 0) return null;
        return { meta, audioPath, mimeType: getMimeTypeForFile(meta.audioFile) };
    } catch {
        return null;
    }
};

/** Writes the metadata file last so a half-finished download is never mistaken for a cache hit. */
const writeCachedMeta = async (cacheDir, meta) => {
    assertVideoId(meta.videoId);
    const target = path.join(cacheDir, `${meta.videoId}.json`);
    const temporary = `${target}.tmp`;
    await fs.promises.writeFile(temporary, JSON.stringify(meta), 'utf8');
    await fs.promises.rename(temporary, target);
};

/** Removes leftovers (.part, orphaned audio) of a failed download; never touches other ids. */
const removePartialFiles = async (cacheDir, videoId) => {
    assertVideoId(videoId);
    let names = [];
    try {
        names = await fs.promises.readdir(cacheDir);
    } catch {
        return;
    }
    await Promise.all(names
        .filter(name => name.startsWith(`${videoId}.`) && !name.endsWith('.json'))
        .map(name => fs.promises.rm(path.join(cacheDir, name), { force: true }).catch(() => undefined)));
};

module.exports = {
    assertVideoId,
    getMimeTypeForFile,
    getYoutubeCacheDirectory,
    isCachedAudioFileName,
    readCachedEntry,
    removePartialFiles,
    writeCachedMeta,
};
