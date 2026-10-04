import { createRequire } from 'module';
import os from 'os';
import path from 'path';
import fs from 'fs';
import { describe, expect, it, vi } from 'vitest';

// test/unit/electron/youtubeService.test.ts
// Exercises the YouTube import service against a real temp cache dir and a stubbed yt-dlp runner.

const require = createRequire(import.meta.url);
const { createYoutubeService } = require('../../../electron/youtube/service.cjs');
const { createProtocolResponse, parseYoutubeAudioUrl, buildYoutubeAudioUrl } = require('../../../electron/youtube/protocol.cjs');

const ID = 'jNQXAC9IVRw';
const URL_OK = `https://www.youtube.com/watch?v=${ID}&list=PL1`;

const setup = (run: (options: any) => Promise<any>, resolveBinary: () => string = () => '/bin/yt-dlp') => {
    const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'folia-yt-'));
    const cacheDir = path.join(userData, 'youtube-audio');
    const service = createYoutubeService({
        app: { getPath: () => userData, getAppPath: () => '/app' },
        protocol: { handle: vi.fn() },
        resolveBinary,
        run,
        log: () => undefined,
    });
    return { service, cacheDir };
};

const writeAudio = (cacheDir: string, name = `${ID}.m4a`) => {
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(path.join(cacheDir, name), Buffer.from('0123456789'));
    return path.join(cacheDir, name);
};

describe('youtube import service', () => {
    it('rejects non-YouTube input without running yt-dlp', async () => {
        const run = vi.fn();
        const { service } = setup(run);
        await expect(service.importTrack('https://example.com/watch?v=x')).resolves.toMatchObject({ ok: false, code: 'invalid-url' });
        expect(run).not.toHaveBeenCalled();
    });

    it('reports ytdlp-missing when the binary cannot be resolved', async () => {
        const { service } = setup(vi.fn(), () => {
            throw Object.assign(new Error('missing'), { code: 'ytdlp-missing', candidates: [] });
        });
        await expect(service.importTrack(URL_OK)).resolves.toMatchObject({ ok: false, code: 'ytdlp-missing' });
    });

    it('downloads, persists metadata and returns a folia-youtube url', async () => {
        let cacheDirRef = '';
        const run = vi.fn(async ({ args, env }) => {
            expect(args.at(-1)).toBe(`https://www.youtube.com/watch?v=${ID}`);
            expect(env.ELECTRON_RUN_AS_NODE).toBe('1');
            return { id: ID, filepath: writeAudio(cacheDirRef), title: 'Me at the zoo', uploader: 'jawed', duration: 19, thumbnail: 'https://i.ytimg.com/x.jpg' };
        });
        const { service, cacheDir } = setup(run);
        cacheDirRef = cacheDir;
        const result = await service.importTrack(URL_OK);
        expect(result).toMatchObject({
            ok: true,
            track: { videoId: ID, title: 'Me at the zoo', uploader: 'jawed', durationMs: 19000, audioUrl: `folia-youtube://audio/${ID}` },
        });
        expect(result.track.audioFile).toBeUndefined();
        expect(fs.existsSync(path.join(cacheDir, `${ID}.json`))).toBe(true);
    });

    it('skips yt-dlp on a cache hit', async () => {
        let cacheDirRef = '';
        const run = vi.fn(async () => ({ id: ID, filepath: writeAudio(cacheDirRef), title: 'T', duration: 5 }));
        const { service, cacheDir } = setup(run);
        cacheDirRef = cacheDir;
        await service.importTrack(URL_OK);
        const second = await service.importTrack(`https://youtu.be/${ID}`);
        expect(second.ok).toBe(true);
        expect(run).toHaveBeenCalledTimes(1);
    });

    it('re-downloads when the cached audio file has been removed', async () => {
        let cacheDirRef = '';
        const run = vi.fn(async () => ({ id: ID, filepath: writeAudio(cacheDirRef), title: 'T', duration: 5 }));
        const { service, cacheDir } = setup(run);
        cacheDirRef = cacheDir;
        await service.importTrack(URL_OK);
        fs.rmSync(path.join(cacheDir, `${ID}.m4a`));
        await service.importTrack(URL_OK);
        expect(run).toHaveBeenCalledTimes(2);
    });

    it('dedupes concurrent imports of the same video and fans out progress', async () => {
        let cacheDirRef = '';
        let release: () => void = () => undefined;
        const gate = new Promise<void>(resolve => { release = resolve; });
        const run = vi.fn(async ({ onProgress }) => {
            onProgress(12.7);
            await gate;
            return { id: ID, filepath: writeAudio(cacheDirRef), title: 'T', duration: 5 };
        });
        const { service, cacheDir } = setup(run);
        cacheDirRef = cacheDir;
        const progressA = vi.fn();
        const progressB = vi.fn();
        const first = service.importTrack(URL_OK, { onProgress: progressA });
        await new Promise(resolve => setImmediate(resolve));
        const second = service.importTrack(URL_OK, { onProgress: progressB });
        release();
        const [a, b] = await Promise.all([first, second]);
        expect(run).toHaveBeenCalledTimes(1);
        expect(a).toEqual(b);
        expect(progressA).toHaveBeenCalledWith({ videoId: ID, percent: 12 });
    });

    it('maps runner failures to stable codes and removes partial files', async () => {
        let cacheDirRef = '';
        const run = vi.fn(async () => {
            fs.mkdirSync(cacheDirRef, { recursive: true });
            fs.writeFileSync(path.join(cacheDirRef, `${ID}.m4a.part`), 'x');
            throw Object.assign(new Error('boom'), { code: 'timeout', stderrTail: 'tail' });
        });
        const { service, cacheDir } = setup(run);
        cacheDirRef = cacheDir;
        await expect(service.importTrack(URL_OK)).resolves.toMatchObject({ ok: false, code: 'timeout' });
        expect(fs.readdirSync(cacheDir)).toEqual([]);
    });

    it('refuses a runner-reported file that does not belong to the video id', async () => {
        let cacheDirRef = '';
        const run = vi.fn(async () => ({ id: ID, filepath: writeAudio(cacheDirRef, 'other.m4a'), title: 'T' }));
        const { service, cacheDir } = setup(run);
        cacheDirRef = cacheDir;
        await expect(service.importTrack(URL_OK)).resolves.toMatchObject({ ok: false, code: 'download-failed' });
    });
});

describe('folia-youtube protocol', () => {
    it('accepts only folia-youtube://audio/<11-char id>', () => {
        expect(parseYoutubeAudioUrl(`folia-youtube://audio/${ID}`)).toBe(ID);
        expect(parseYoutubeAudioUrl(buildYoutubeAudioUrl(ID))).toBe(ID);
        expect(parseYoutubeAudioUrl('folia-youtube://audio/../../etc/passwd')).toBeNull();
        expect(parseYoutubeAudioUrl(`folia-youtube://audio/${ID}/extra`)).toBeNull();
        expect(parseYoutubeAudioUrl(`folia-youtube://other/${ID}`)).toBeNull();
        expect(parseYoutubeAudioUrl(`folia-transcode://audio/${ID}`)).toBeNull();
    });

    it('serves full and ranged responses with the right content type', async () => {
        const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'folia-yt-proto-'));
        const audioPath = writeAudio(cacheDir);
        const resolveEntry = async () => ({ audioPath, mimeType: 'audio/mp4' });
        const full = await createProtocolResponse(new Request(`folia-youtube://audio/${ID}`), resolveEntry);
        expect(full.status).toBe(200);
        expect(full.headers.get('content-type')).toBe('audio/mp4');
        expect(await full.text()).toBe('0123456789');
        const ranged = await createProtocolResponse(new Request(`folia-youtube://audio/${ID}`, { headers: { range: 'bytes=2-4' } }), resolveEntry);
        expect(ranged.status).toBe(206);
        expect(ranged.headers.get('content-range')).toBe('bytes 2-4/10');
        expect(await ranged.text()).toBe('234');
        const bad = await createProtocolResponse(new Request(`folia-youtube://audio/${ID}`, { headers: { range: 'bytes=50-60' } }), resolveEntry);
        expect(bad.status).toBe(416);
    });

    it('returns 404 for unknown ids and malformed urls', async () => {
        const missing = await createProtocolResponse(new Request(`folia-youtube://audio/${ID}`), async () => null);
        expect(missing.status).toBe(404);
        const bad = await createProtocolResponse(new Request('folia-youtube://audio/nope'), async () => ({ audioPath: '/x', mimeType: 'audio/mp4' }));
        expect(bad.status).toBe(404);
    });
});
