'use strict';

const fs = require('fs');
const { Readable } = require('stream');
const { parseRangeHeader } = require('../transcode/protocol.cjs');
const { VIDEO_ID_PATTERN } = require('../../shared/youtubeVideoId.cjs');

// electron/youtube/protocol.cjs
// Serves imported YouTube audio as folia-youtube://audio/<id> with Range support, so the
// CORS-sensitive <audio crossOrigin="anonymous"> decks can feed the WebAudio graph.

const YOUTUBE_PROTOCOL_SCHEME = 'folia-youtube';

/** Returns the video id for `folia-youtube://audio/<id>`, or null for any other shape. */
const parseYoutubeAudioUrl = value => {
    try {
        const url = new URL(value);
        if (url.protocol !== `${YOUTUBE_PROTOCOL_SCHEME}:` || url.hostname !== 'audio') return null;
        const parts = url.pathname.split('/').filter(Boolean);
        if (parts.length !== 1 || !VIDEO_ID_PATTERN.test(parts[0])) return null;
        return parts[0];
    } catch {
        return null;
    }
};

/** Builds the renderer-facing audio URL for an imported video id. */
const buildYoutubeAudioUrl = videoId => `${YOUTUBE_PROTOCOL_SCHEME}://audio/${videoId}`;

const createProtocolResponse = async (request, resolveEntry) => {
    const videoId = parseYoutubeAudioUrl(request.url);
    if (!videoId) return new Response('Not found', { status: 404 });
    const entry = await resolveEntry(videoId);
    if (!entry) return new Response('Not found', { status: 404 });
    let stat;
    try {
        stat = await fs.promises.stat(entry.audioPath);
    } catch {
        return new Response('Not found', { status: 404 });
    }
    const range = parseRangeHeader(request.headers.get('range'), stat.size);
    if (range?.invalid) {
        return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${stat.size}` } });
    }

    const headers = {
        'Accept-Ranges': 'bytes',
        'Content-Type': entry.mimeType,
        'Content-Length': String(range ? range.end - range.start + 1 : stat.size),
    };
    if (range) headers['Content-Range'] = `bytes ${range.start}-${range.end}/${stat.size}`;
    if (request.method === 'HEAD') return new Response(null, { status: range ? 206 : 200, headers });

    try {
        const nodeStream = fs.createReadStream(entry.audioPath, range ? { start: range.start, end: range.end } : undefined);
        return new Response(Readable.toWeb(nodeStream), { status: range ? 206 : 200, headers });
    } catch {
        return new Response('Not found', { status: 404 });
    }
};

const registerYoutubeProtocol = ({ protocol, resolveEntry }) => {
    protocol.handle(YOUTUBE_PROTOCOL_SCHEME, request => createProtocolResponse(request, resolveEntry));
};

module.exports = {
    YOUTUBE_PROTOCOL_SCHEME,
    buildYoutubeAudioUrl,
    createProtocolResponse,
    parseYoutubeAudioUrl,
    registerYoutubeProtocol,
};
