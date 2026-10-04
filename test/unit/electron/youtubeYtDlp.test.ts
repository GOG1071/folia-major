import { EventEmitter } from 'events';
import { createRequire } from 'module';
import os from 'os';
import path from 'path';
import fs from 'fs';
import { PassThrough } from 'stream';
import { describe, expect, it, vi } from 'vitest';

// test/unit/electron/youtubeYtDlp.test.ts
// Covers yt-dlp binary resolution, argument building and output parsing without spawning a real process.

const require = createRequire(import.meta.url);
const { buildYtDlpCandidates, resolveYtDlpBinary } = require('../../../electron/youtube/ytDlpBinary.cjs');
const { buildYtDlpArgs, parseMetadataLines, parseProgressLine, runYtDlp } = require('../../../electron/youtube/ytDlpRunner.cjs');

const fakeChild = () => {
    const child = new EventEmitter() as EventEmitter & { stdout: PassThrough; stderr: PassThrough; kill: ReturnType<typeof vi.fn> };
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.kill = vi.fn();
    return child;
};

describe('yt-dlp binary resolution', () => {
    it('orders env override, dev slot, then packaged slot', () => {
        const candidates = buildYtDlpCandidates({
            env: { FOLIA_YTDLP_PATH: '/custom/yt-dlp' },
            platform: 'linux',
            arch: 'x64',
            appPath: '/app',
            resourcesPath: '/res',
        });
        expect(candidates).toEqual(['/custom/yt-dlp', path.join('/app', 'build', 'yt-dlp', 'linux-x64', 'yt-dlp'), path.join('/res', 'yt-dlp', 'yt-dlp')]);
    });

    it('uses yt-dlp.exe and the win slot on Windows', () => {
        const candidates = buildYtDlpCandidates({ env: {}, platform: 'win32', arch: 'x64', appPath: '/app', resourcesPath: '/res' });
        expect(candidates[0]).toContain(path.join('win-x64', 'yt-dlp.exe'));
        expect(candidates[1]).toContain('yt-dlp.exe');
    });

    it('throws a ytdlp-missing error when no candidate exists', () => {
        try {
            resolveYtDlpBinary({ env: { FOLIA_YTDLP_PATH: '/nonexistent/yt-dlp' }, appPath: '/nonexistent-app' });
            throw new Error('expected a throw');
        } catch (error) {
            expect((error as { code?: string }).code).toBe('ytdlp-missing');
        }
    });

    it('resolves an existing env override', () => {
        const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ytdlp-')), 'yt-dlp');
        fs.writeFileSync(file, '');
        expect(resolveYtDlpBinary({ env: { FOLIA_YTDLP_PATH: file } })).toBe(file);
    });
});

describe('yt-dlp arguments', () => {
    const args = buildYtDlpArgs({
        canonicalUrl: 'https://www.youtube.com/watch?v=jNQXAC9IVRw',
        outputDir: '/data/100%/youtube-audio',
        videoId: 'jNQXAC9IVRw',
        jsRuntimePath: '/opt/electron',
    });

    it('passes only the canonical url, last, as a discrete argument', () => {
        expect(args.at(-1)).toBe('https://www.youtube.com/watch?v=jNQXAC9IVRw');
        expect(args).toContain('--no-playlist');
        expect(args).toContain('--ignore-config');
    });

    it('escapes % in the output directory and enables the node runtime', () => {
        expect(args[args.indexOf('-o') + 1]).toBe('/data/100%%/youtube-audio/jNQXAC9IVRw.%(ext)s');
        expect(args[args.indexOf('--js-runtimes') + 1]).toBe('node:/opt/electron');
    });

    it('omits --js-runtimes when no runtime path is given', () => {
        const without = buildYtDlpArgs({ canonicalUrl: 'u', outputDir: '/d', videoId: 'jNQXAC9IVRw' });
        expect(without).not.toContain('--js-runtimes');
    });
});

describe('yt-dlp output parsing', () => {
    it('turns progress lines into percentages', () => {
        expect(parseProgressLine('FOLIA_PROGRESS 50 200 NA')).toBe(25);
        expect(parseProgressLine('FOLIA_PROGRESS 50 NA 100')).toBe(50);
        expect(parseProgressLine('FOLIA_PROGRESS 50 NA NA')).toBeNull();
        expect(parseProgressLine('{"id":"x"}')).toBeNull();
    });

    it('takes the last valid JSON line as metadata', () => {
        expect(parseMetadataLines(['{broken', '{"id":"a"}'])).toEqual({ id: 'a' });
        expect(parseMetadataLines([])).toBeNull();
    });
});

describe('runYtDlp', () => {
    it('resolves metadata and reports progress', async () => {
        const child = fakeChild();
        const onProgress = vi.fn();
        const promise = runYtDlp({ binaryPath: 'yt-dlp', args: [], env: {}, onProgress, spawnProcess: () => child });
        child.stdout.write('FOLIA_PROGRESS 10 100 NA\n{"id":"jNQXAC9IVRw","filepath":"/x/jNQXAC9IVRw.m4a"}\n');
        child.emit('close', 0);
        await expect(promise).resolves.toMatchObject({ id: 'jNQXAC9IVRw' });
        expect(onProgress).toHaveBeenCalledWith(10);
    });

    it('rejects with download-failed and a stderr tail on non-zero exit', async () => {
        const child = fakeChild();
        const promise = runYtDlp({ binaryPath: 'yt-dlp', args: [], env: {}, spawnProcess: () => child });
        child.stderr.write('ERROR: Video unavailable');
        await new Promise(resolve => setImmediate(resolve));
        child.emit('close', 1);
        await expect(promise).rejects.toMatchObject({ code: 'download-failed', stderrTail: 'ERROR: Video unavailable' });
    });

    it('kills the process and rejects with timeout', async () => {
        const child = fakeChild();
        const promise = runYtDlp({ binaryPath: 'yt-dlp', args: [], env: {}, timeoutMs: 10, spawnProcess: () => child });
        await expect(promise).rejects.toMatchObject({ code: 'timeout' });
        expect(child.kill).toHaveBeenCalled();
    });

    it('rejects when yt-dlp exits cleanly without printing metadata', async () => {
        const child = fakeChild();
        const promise = runYtDlp({ binaryPath: 'yt-dlp', args: [], env: {}, spawnProcess: () => child });
        child.emit('close', 0);
        await expect(promise).rejects.toMatchObject({ code: 'download-failed' });
    });
});
