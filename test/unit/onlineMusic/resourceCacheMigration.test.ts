import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getFromCache, saveToCache } from '@/services/db';
import { getCachedAudioBlob, hasCachedAudio, saveAudioBlob } from '@/services/audioCache';
import { getCachedSongAudioBlob, getSongCacheWithLegacyMigration, hasCachedSongAudio } from '@/services/onlineMusic/resourceCache';
import type { SongResult } from '@/types';

// test/unit/onlineMusic/resourceCacheMigration.test.ts

vi.mock('@/services/db', () => ({
    getFromCache: vi.fn(),
    saveToCache: vi.fn(),
}));

vi.mock('@/services/audioCache', () => ({
    getCachedAudioBlob: vi.fn(),
    hasCachedAudio: vi.fn(),
    saveAudioBlob: vi.fn(),
}));

vi.mock('@/services/coverCache', () => ({
    getCachedCoverUrl: vi.fn(),
    saveCoverBlob: vi.fn(),
}));

const qqSong: SongResult = {
    id: 42,
    name: 'Legacy',
    artists: [],
    album: { id: 1, name: 'Album' },
    durationMs: 1000,
    sourceRef: { kind: 'online', providerId: 'qq', mediaId: '42' },
};

describe('provider-aware resource cache migration', () => {
    beforeEach(() => vi.clearAllMocks());

    it('reads and writes the provider-aware lyric key only', async () => {
        const lyric = { lines: [{ fullText: 'current' }] };
        vi.mocked(getFromCache).mockImplementation(async key => (
            key === 'lyric_online:qq:42' ? lyric : null
        ) as any);

        await expect(getSongCacheWithLegacyMigration('lyric', qqSong)).resolves.toEqual(lyric);
        expect(getFromCache).not.toHaveBeenCalledWith('lyric_42');
    });

    it('does not fall back to the removed NetEase-era unprefixed keys', async () => {
        const blob = new Blob(['audio'], { type: 'audio/mpeg' });
        vi.mocked(getFromCache).mockImplementation(async key => (
            key === 'lyric_42' ? { lines: [{ fullText: 'legacy' }] } : null
        ) as any);
        vi.mocked(getCachedAudioBlob).mockImplementation(async key => key === 'audio_42' ? blob : null);

        await expect(getSongCacheWithLegacyMigration('lyric', qqSong)).resolves.toBeNull();
        await expect(getCachedSongAudioBlob(qqSong)).resolves.toBeNull();
        expect(saveToCache).not.toHaveBeenCalled();
        expect(saveAudioBlob).not.toHaveBeenCalled();
    });

    it('checks current audio cache existence without reading the audio blob', async () => {
        vi.mocked(hasCachedAudio).mockImplementation(async key => key === 'audio_online:qq:42');

        await expect(hasCachedSongAudio(qqSong)).resolves.toBe(true);
        expect(hasCachedAudio).toHaveBeenCalledTimes(1);
        expect(getCachedAudioBlob).not.toHaveBeenCalled();
    });

    it('does not probe the removed unprefixed audio key', async () => {
        vi.mocked(hasCachedAudio).mockImplementation(async key => key === 'audio_42');

        await expect(hasCachedSongAudio(qqSong)).resolves.toBe(false);
        expect(hasCachedAudio).toHaveBeenCalledTimes(1);
        expect(hasCachedAudio).toHaveBeenCalledWith('audio_online:qq:42');
    });
});
