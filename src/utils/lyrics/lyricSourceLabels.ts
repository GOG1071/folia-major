import i18n from '../../i18n/config';
import type { LyricProviderSource, SongResult } from '../../types';
import { normalizeLyricProviderSource } from './lyricProviderSource';

// src/utils/lyrics/lyricSourceLabels.ts

// A stored source from an older build (a removed provider) has no label of its own; it reads as a generic online source.
export const getLyricProviderLabel = (source: LyricProviderSource | undefined): string => (
    normalizeLyricProviderSource(source) === 'qq' ? i18n.t('lyricProvider.qq') : i18n.t('lyricProvider.online')
);

export const getSongNativeLyricProviderSource = (
    song?: Pick<SongResult, 'sourceRef'> | null,
): LyricProviderSource | undefined => {
    const providerId = song?.sourceRef?.kind === 'online' ? song.sourceRef.providerId : undefined;
    return normalizeLyricProviderSource(providerId);
};
