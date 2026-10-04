'use strict';

const { spawn } = require('child_process');

// electron/youtube/ytDlpRunner.cjs
// Builds the yt-dlp argument list for one audio download, spawns it without a shell and parses its output.

const DOWNLOAD_TIMEOUT_MS = 3 * 60 * 1000;
const STDERR_TAIL_BYTES = 4096;
const MAX_STDOUT_LINE_BYTES = 8 * 1024 * 1024;
const PROGRESS_PREFIX = 'FOLIA_PROGRESS ';
const AUDIO_FORMAT = 'bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio';
// Only the fields the importer needs: the full info dict (all formats) can be several MB.
const PRINT_TEMPLATE = 'after_move:%(.{id,filepath,title,track,artist,creator,uploader,channel,album,duration,thumbnail})j';
const PROGRESS_TEMPLATE = `download:${PROGRESS_PREFIX}%(progress.downloaded_bytes)s %(progress.total_bytes)s %(progress.total_bytes_estimate)s`;

class YtDlpRunError extends Error {
    constructor(code, message, stderrTail = '') {
        super(message);
        this.name = 'YtDlpRunError';
        this.code = code;
        this.stderrTail = stderrTail;
    }
}

/** Builds argv for one download. The URL must already be canonical; nothing here goes through a shell. */
const buildYtDlpArgs = ({ canonicalUrl, outputDir, videoId, jsRuntimePath }) => {
    const args = [
        '--ignore-config',
        '--no-playlist',
        '--no-warnings',
        '--no-mtime',
        '--newline',
        '--progress',
        '--progress-template', PROGRESS_TEMPLATE,
        '-f', AUDIO_FORMAT,
        // yt-dlp expands %(...)s in -o, so a literal % in the user-data path must be doubled.
        '-o', `${outputDir.replace(/%/g, '%%')}/${videoId}.%(ext)s`,
        '--no-simulate',
        '--print', PRINT_TEMPLATE,
    ];
    if (jsRuntimePath) args.push('--js-runtimes', `node:${jsRuntimePath}`);
    args.push(canonicalUrl);
    return args;
};

/** Parses one stdout line of the progress template into a 0-100 percent, or null when unknown. */
const parseProgressLine = line => {
    if (!line.startsWith(PROGRESS_PREFIX)) return null;
    const [downloaded, total, estimate] = line.slice(PROGRESS_PREFIX.length).trim().split(/\s+/).map(Number);
    const size = Number.isFinite(total) && total > 0 ? total : estimate;
    if (!Number.isFinite(downloaded) || !Number.isFinite(size) || size <= 0) return null;
    return Math.max(0, Math.min(100, (downloaded / size) * 100));
};

/** Picks the printed metadata object (the one JSON line) out of the collected stdout lines. */
const parseMetadataLines = lines => {
    for (let index = lines.length - 1; index >= 0; index -= 1) {
        if (!lines[index].startsWith('{')) continue;
        try {
            const parsed = JSON.parse(lines[index]);
            if (parsed && typeof parsed === 'object') return parsed;
        } catch {
            // Keep scanning: a stray brace line must not hide the real metadata.
        }
    }
    return null;
};

/**
 * Runs yt-dlp to completion. `spawnProcess` is injectable for tests.
 * Resolves to the printed metadata object; rejects with YtDlpRunError (`timeout` | `download-failed`).
 */
const runYtDlp = ({ binaryPath, args, env, onProgress, timeoutMs = DOWNLOAD_TIMEOUT_MS, spawnProcess = spawn }) => new Promise((resolve, reject) => {
    let child;
    try {
        child = spawnProcess(binaryPath, args, { env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (error) {
        reject(new YtDlpRunError('download-failed', `Unable to start yt-dlp: ${error.message}`));
        return;
    }

    let stderrTail = '';
    let pending = '';
    let settled = false;
    const lines = [];
    const settle = (fn, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        fn(value);
    };
    const timer = setTimeout(() => {
        child.kill('SIGKILL');
        settle(reject, new YtDlpRunError('timeout', `yt-dlp exceeded ${timeoutMs}ms`, stderrTail));
    }, timeoutMs);

    const handleLine = line => {
        const percent = parseProgressLine(line);
        if (percent !== null) onProgress?.(percent);
        else if (line.startsWith('{')) lines.push(line);
    };
    child.stdout.on('data', chunk => {
        pending += chunk.toString('utf8');
        if (pending.length > MAX_STDOUT_LINE_BYTES) {
            child.kill('SIGKILL');
            settle(reject, new YtDlpRunError('download-failed', 'yt-dlp produced an oversized output line', stderrTail));
            return;
        }
        const split = pending.split(/\r?\n/);
        pending = split.pop() ?? '';
        split.forEach(handleLine);
    });
    child.stderr.on('data', chunk => {
        stderrTail = (stderrTail + chunk.toString('utf8')).slice(-STDERR_TAIL_BYTES);
    });
    child.on('error', error => {
        settle(reject, new YtDlpRunError('download-failed', `yt-dlp failed to run: ${error.message}`, stderrTail));
    });
    child.on('close', code => {
        if (pending) handleLine(pending.trim());
        if (code !== 0) {
            settle(reject, new YtDlpRunError('download-failed', `yt-dlp exited with code ${code}`, stderrTail));
            return;
        }
        const metadata = parseMetadataLines(lines);
        if (!metadata) {
            settle(reject, new YtDlpRunError('download-failed', 'yt-dlp printed no metadata', stderrTail));
            return;
        }
        settle(resolve, metadata);
    });
});

module.exports = {
    DOWNLOAD_TIMEOUT_MS,
    YtDlpRunError,
    buildYtDlpArgs,
    parseMetadataLines,
    parseProgressLine,
    runYtDlp,
};
