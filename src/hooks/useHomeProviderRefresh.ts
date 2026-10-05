import { useEffect, useRef } from 'react';
import type { OnlineProviderId } from '../types/onlineMusic';
import type { OnlineProviderPlatformState } from './useOnlineProviderPlatform';
import { useCollectionNavigationStore } from '../stores/useCollectionNavigationStore';
import { useAppViewStore } from '../stores/useAppViewStore';

// src/hooks/useHomeProviderRefresh.ts
//
// Refreshes the active online provider's playlists when the listener lands on the home surface.
//
// Not on an interval and not on mount: home is where those lists are read, so entering it is the
// moment they are worth fetching. The cooldown and the in-flight check keep bouncing between home
// and a collection from re-fetching each time.

/** Long enough that home ↔ player ↔ collection bouncing does not re-fetch, short enough to feel live. */
const HOME_PROVIDER_REFRESH_COOLDOWN_MS = 5_000;

type HomeProviderRefreshParams = {
    onlineProviderPlatform: OnlineProviderPlatformState;
    refreshActiveProviderPlaylists: () => Promise<unknown>;
};

export const useHomeProviderRefresh = ({
    onlineProviderPlatform,
    refreshActiveProviderPlaylists,
}: HomeProviderRefreshParams) => {
    const currentView = useAppViewStore(state => state.view);
    // A collection is open on top of home, so the lists behind it are not what is being looked at.
    const hasCollection = useCollectionNavigationStore(state => Boolean(state.snapshot?.stack.length));
    const lastHomeProviderRefreshRef = useRef<{ providerId: OnlineProviderId; at: number } | null>(null);

    useEffect(() => {
        if (currentView !== 'home' || hasCollection) return;

        const providerId = onlineProviderPlatform.activeProviderId;
        const startedAt = Date.now();
        const previous = lastHomeProviderRefreshRef.current;
        if (previous?.providerId === providerId && startedAt - previous.at <= HOME_PROVIDER_REFRESH_COOLDOWN_MS) return;
        if (onlineProviderPlatform.activeProvider?.freshness === 'refreshing') {
            lastHomeProviderRefreshRef.current = { providerId, at: startedAt };
            return;
        }

        lastHomeProviderRefreshRef.current = { providerId, at: startedAt };
        void refreshActiveProviderPlaylists().catch(error => {
            if (lastHomeProviderRefreshRef.current?.providerId === providerId
                && lastHomeProviderRefreshRef.current.at === startedAt) {
                lastHomeProviderRefreshRef.current = null;
            }
            console.warn('[Omni] Failed to refresh active provider playlists on home entry', {
                providerId,
                name: error instanceof Error ? error.name : 'Error',
            });
        });
    }, [
        currentView,
        hasCollection,
        onlineProviderPlatform.activeProvider?.freshness,
        onlineProviderPlatform.activeProviderId,
        refreshActiveProviderPlaylists,
    ]);
};
