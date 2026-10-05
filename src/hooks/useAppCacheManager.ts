import { useCallback, useState } from 'react';
import {
    clearCache,
    getCacheKeysByPrefix,
    getCacheUsage,
} from '../services/db';
import { getProviderCacheKey } from '../services/onlineMusic/providerStorage';
import { getProviderAccountSnapshotCacheKey } from '../services/onlineMusic/providerAccountCache';
import { omni } from '../services/onlineMusic/omni';
import { setStatusMessage as setStatusMsg } from '../stores/useStatusMessageStore';

// src/hooks/useAppCacheManager.ts
// Cache size readout and the "clear cache" action behind the settings panel. Account snapshots,
// the last playback state and the cached provider playlists survive a clear on purpose.

const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

export function useAppCacheManager({ t }: { t: (key: string) => string; }) {
    const [cacheSize, setCacheSize] = useState<string>('0 B');

    const updateCacheSize = useCallback(async () => {
        const size = await getCacheUsage();
        setCacheSize(formatBytes(size));
    }, []);

    const handleClearCache = useCallback(async () => {
        const providerIds = omni.getProviderSummaries().map(provider => provider.providerId);
        const preserveKeys = [
            ...providerIds.map(providerId => getProviderAccountSnapshotCacheKey(providerId)),
            'last_song',
            'last_queue',
            'last_theme',
        ];

        try {
            const playlistKeys = await getCacheKeysByPrefix(providerIds.flatMap(providerId => [
                getProviderCacheKey(providerId, 'playlist_tracks_'),
                getProviderCacheKey(providerId, 'playlist_detail_'),
            ]));

            await clearCache([...preserveKeys, ...playlistKeys]);
            void updateCacheSize();
            setStatusMsg({ type: 'success', text: t('status.cacheCleared') });
        } catch (error) {
            console.error('Failed to clear cache:', error);
            setStatusMsg({ type: 'error', text: t('status.cacheCleared') });
        }
    }, [t, updateCacheSize]);

    return { cacheSize, updateCacheSize, handleClearCache };
}
