import type { LyricProviderSource } from '../../types';

// src/utils/lyrics/lyricProviderSource.ts
// The online lyric sources the app can still match against. QQ Music is the only one.

export const LYRIC_PROVIDER_SOURCES: readonly LyricProviderSource[] = ['qq'];

// Records written by older builds can carry 'netease', 'kugou' or 'amll' as their lyric source.
// Those sources no longer exist, so anything that is not a known source reads as "unknown".
export const normalizeLyricProviderSource = (value: unknown): LyricProviderSource | undefined => (
    LYRIC_PROVIDER_SOURCES.find(source => source === value)
);
