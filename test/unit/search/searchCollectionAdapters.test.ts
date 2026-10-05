import { describe, expect, it } from 'vitest';
import {
    createSearchAlbumCollection,
    createSearchArtistCollection,
} from '@/components/app/search/searchCollectionAdapters';
import type { UnifiedSong } from '@/types';

// Verifies all search sources produce GridView-native collection descriptors.

const baseTrack = (): UnifiedSong => ({
    id: 1,
    name: 'Track',
    artists: [{ id: 2, name: 'Artist' }],
    album: { id: 3, name: 'Album', coverUrl: 'https://example.com/cover.jpg' },
    durationMs: 1000,
    sourceRef: { kind: 'online', providerId: 'qq', mediaId: '1' },
});

describe('search collection adapters', () => {
    it('uses stable local entity ids and refuses unresolved local links', async () => {
        const track: UnifiedSong = {
            ...baseTrack(),
            isLocal: true,
            localRef: { songId: 'song-1' },
            sourceRef: { kind: 'local', mediaId: 'song-1' },
        };
        await expect(createSearchArtistCollection(track, 'Artist', 0, 'artist-1')).resolves.toEqual(expect.objectContaining({
            source: 'local',
            id: 'artist-1',
            entityId: 'artist-1',
            songIds: ['song-1'],
        }));
        await expect(createSearchAlbumCollection(track, 'Album')).resolves.toBeNull();
    });

    it('uses Navidrome source ids from the playback carrier', async () => {
        const track: UnifiedSong = {
            ...baseTrack(),
            isNavidrome: true,
            sourceRef: { kind: 'navidrome', mediaId: 'song-1' },
            navidromeData: {
                ...baseTrack(),
                id: 'song-1',
                isNavidrome: true,
                artistId: 'artist-1',
                albumId: 'album-1',
            } as any,
        };
        await expect(createSearchArtistCollection(track, 'Artist')).resolves.toEqual(expect.objectContaining({
            source: 'navidrome',
            id: 'artist-1',
        }));
        await expect(createSearchAlbumCollection(track, 'Album')).resolves.toEqual(expect.objectContaining({
            source: 'navidrome',
            id: 'album-1',
        }));
    });

    it('uses canonical online catalog references instead of display ids', async () => {
        const track: UnifiedSong = {
            ...baseTrack(),
            id: 'mid-1',
            artists: [{
                id: 'display-artist',
                name: 'Artist',
                catalogRef: { providerId: 'qq', kind: 'artist', id: 6539 },
            }],
            album: {
                id: 'display-album',
                name: 'Album',
                catalogRef: { providerId: 'qq', kind: 'album', id: 10729818 },
            },
            sourceRef: { kind: 'online', providerId: 'qq', mediaId: 'mid-1' },
        };

        await expect(createSearchArtistCollection(track, 'Artist', 'display-artist')).resolves.toMatchObject({
            providerId: 'qq', id: 6539, type: 'artist',
        });
        await expect(createSearchAlbumCollection(track, 'Album', 'display-album')).resolves.toMatchObject({
            providerId: 'qq', id: 10729818, type: 'album',
        });
    });
});
