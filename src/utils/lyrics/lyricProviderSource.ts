import type { LyricProviderSource } from '../../types';
import type { LocalSongMetadataSource } from '../../types/localLibrary';

// src/utils/lyrics/lyricProviderSource.ts
// The online lyric sources the app can match against: QQ Music (also a music provider) and LRCLIB (lyrics only).

// Order is the display order of the match-modal source tabs, and QQ stays first on purpose: it is the only
// source with word-by-word lyrics, so auto-match asks it before LRCLIB (see autoMatchBestLyric).
export const LYRIC_PROVIDER_SOURCES: readonly LyricProviderSource[] = ['qq', 'lrclib'];

// Records written by older builds can carry 'netease', 'kugou' or 'amll' as their lyric source.
// Those sources no longer exist, so anything that is not a known source reads as "unknown".
export const normalizeLyricProviderSource = (value: unknown): LyricProviderSource | undefined => (
    LYRIC_PROVIDER_SOURCES.find(source => source === value)
);

// Whether a lyric match from this source can also supply song metadata and a cover. LRCLIB returns lyrics
// only, so a match from it must never be turned into an online metadata candidate.
export const sourceProvidesSongMetadata = (
    source: LyricProviderSource | undefined,
): source is LocalSongMetadataSource => source === 'qq';
