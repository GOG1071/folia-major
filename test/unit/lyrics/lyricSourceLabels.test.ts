import { describe, expect, it } from 'vitest';
import { getSongNativeLyricProviderSource } from '@/utils/lyrics/lyricSourceLabels';

// test/unit/lyrics/lyricSourceLabels.test.ts

describe('getSongNativeLyricProviderSource', () => {
    it('uses the online playback provider as the native lyric source', () => {
        expect(getSongNativeLyricProviderSource({
            sourceRef: { kind: 'online', providerId: 'qq', mediaId: 'mid-1' },
        })).toBe('qq');
    });

    it('treats a removed provider as having no native lyric source', () => {
        expect(getSongNativeLyricProviderSource({
            sourceRef: { kind: 'online', providerId: 'netease', mediaId: '1' },
        })).toBeUndefined();
        expect(getSongNativeLyricProviderSource({
            sourceRef: { kind: 'online', providerId: 'kugou', mediaId: 'HASH' },
        })).toBeUndefined();
    });

    it('does not invent a lyric source for unrelated playback providers', () => {
        expect(getSongNativeLyricProviderSource({
            sourceRef: { kind: 'online', providerId: 'future-provider', mediaId: '1' },
        })).toBeUndefined();
    });
});
