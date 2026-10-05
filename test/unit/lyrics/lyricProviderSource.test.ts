import { describe, expect, it } from 'vitest';
import {
    LYRIC_PROVIDER_SOURCES,
    normalizeLyricProviderSource,
    sourceProvidesSongMetadata,
} from '@/utils/lyrics/lyricProviderSource';

// test/unit/lyrics/lyricProviderSource.test.ts

describe('lyricProviderSource', () => {
    it('lists QQ Music first and LRCLIB second', () => {
        expect(LYRIC_PROVIDER_SOURCES).toEqual(['qq', 'lrclib']);
    });

    it('keeps both live sources when a persisted record is read back', () => {
        expect(normalizeLyricProviderSource('qq')).toBe('qq');
        expect(normalizeLyricProviderSource('lrclib')).toBe('lrclib');
    });

    it('still reads a removed provider or junk as unknown', () => {
        for (const legacy of ['netease', 'kugou', 'amll', 'LRCLIB', '', null, undefined, 3]) {
            expect(normalizeLyricProviderSource(legacy)).toBeUndefined();
        }
    });

    it('lets only QQ Music supply song metadata and covers', () => {
        expect(sourceProvidesSongMetadata('qq')).toBe(true);
        expect(sourceProvidesSongMetadata('lrclib')).toBe(false);
        expect(sourceProvidesSongMetadata(undefined)).toBe(false);
    });
});
