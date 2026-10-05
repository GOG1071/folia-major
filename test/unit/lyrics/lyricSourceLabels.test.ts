import { describe, expect, it } from 'vitest';
import { getLyricProviderLabel, getSongNativeLyricProviderSource } from '@/utils/lyrics/lyricSourceLabels';

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

describe('getLyricProviderLabel', () => {
    it('labels LRCLIB with its own name in every language', () => {
        expect(getLyricProviderLabel('lrclib')).toBe('LRCLIB');
    });

    it('labels QQ Music and a removed source differently from LRCLIB', () => {
        expect(getLyricProviderLabel('qq')).not.toBe('LRCLIB');
        expect(getLyricProviderLabel('netease' as never)).not.toBe(getLyricProviderLabel('qq'));
        expect(getLyricProviderLabel('netease' as never)).not.toBe('LRCLIB');
        expect(getLyricProviderLabel(undefined)).toBe(getLyricProviderLabel('netease' as never));
    });
});
