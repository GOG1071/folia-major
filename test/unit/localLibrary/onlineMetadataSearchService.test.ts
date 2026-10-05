import { beforeEach, describe, expect, it, vi } from 'vitest';
import { searchQQLyrics } from '@/utils/lyrics/providers/qqLyricProvider';
import {
    findAutomaticOnlineMetadataCandidate,
    searchOnlineMetadata,
} from '@/services/onlineMetadataSearchService';

// test/unit/localLibrary/onlineMetadataSearchService.test.ts
// Verifies QQ-only metadata matching and exact manual query forwarding.

vi.mock('@/utils/lyrics/providers/qqLyricProvider', () => ({ searchQQLyrics: vi.fn() }));

const song = {
    id: 'local-song',
    fileName: 'Target Song.flac',
    filePath: 'Library/Target Song.flac',
    title: 'Target Song',
    titleOrigin: 'import' as const,
    importedMetadata: { title: 'Target Song', titleSource: 'filename' as const, artistNames: ['Target Artist'], albumName: 'Target Album' },
    duration: 200000,
    fileSize: 1,
    mimeType: 'audio/flac',
    addedAt: 1,
};

describe('onlineMetadataSearchService', () => {
    beforeEach(() => vi.resetAllMocks());

    it('keeps a title-compatible QQ candidate', async () => {
        vi.mocked(searchQQLyrics).mockResolvedValue([
            {
                id: 9,
                qqMid: 'qq-mid',
                name: 'Target Song',
                durationMs: 200000,
                artists: [{ id: 7, name: 'Target Artist' }],
                album: { id: 8, name: 'Target Album', coverUrl: 'https://example.test/qq-cover.jpg' },
            },
        ]);
        const candidate = await findAutomaticOnlineMetadataCandidate(song);
        expect(candidate).toMatchObject({
            source: 'qq',
            songId: 'qq-mid',
            titleMatched: true,
            durationMatched: true,
            coverUrl: 'https://example.test/qq-cover.jpg',
        });
    });

    it('returns null when QQ has no title-compatible candidate', async () => {
        vi.mocked(searchQQLyrics).mockResolvedValue([
            { id: 1, qqMid: 'unrelated', name: 'Completely Unrelated Melody', durationMs: 200000, artists: [{ id: 2, name: 'Someone Else' }], album: { id: 3, name: '' } },
        ]);
        await expect(findAutomaticOnlineMetadataCandidate(song)).resolves.toBeNull();
    });

    it('returns null instead of throwing when the QQ search fails', async () => {
        vi.mocked(searchQQLyrics).mockRejectedValue(new Error('network'));
        await expect(findAutomaticOnlineMetadataCandidate(song)).resolves.toBeNull();
    });

    it('forwards a manual query to QQ unchanged', async () => {
        vi.mocked(searchQQLyrics).mockResolvedValue([]);
        await searchOnlineMetadata('qq', 'custom user text', {
            title: 'Target Song', artist: '', durationMs: 0,
        });
        expect(searchQQLyrics).toHaveBeenCalledWith('custom user text', 1, 10);
    });

    it('stops waiting for a provider request when cancelled', async () => {
        let resolveRequest!: (value: never[]) => void;
        vi.mocked(searchQQLyrics).mockReturnValue(new Promise(resolve => {
            resolveRequest = resolve;
        }));
        const controller = new AbortController();
        const pending = searchOnlineMetadata('qq', 'Target Song', {
            title: 'Target Song', artist: '', durationMs: 0,
        }, { signal: controller.signal });
        controller.abort();
        await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
        resolveRequest([]);
    });
});
