import { describe, expect, it } from 'vitest';
import { toSafePlaybackUrl, toSafeRemoteUrl } from '@/utils/appPlaybackHelpers';

// test/unit/onlineMusic/audioUrlNormalization.test.ts

describe('online audio URL normalization', () => {
    it('keeps valid HTTPS URLs unchanged', () => {
        expect(toSafeRemoteUrl('https://audio.example.test/song.mp3'))
            .toBe('https://audio.example.test/song.mp3');
    });

    it('keeps one candidate of a cached comma-joined URL', () => {
        expect(toSafeRemoteUrl('https://a.example.test/primary.mp3,https://a.example.test/backup.mp3'))
            .toBe('https://a.example.test/primary.mp3');
        expect(toSafePlaybackUrl('https://a.example.test/primary.mp3,https://a.example.test/backup.mp3'))
            .toBe('https://a.example.test/primary.mp3');
    });

    it('still upgrades legacy HTTP music CDN URLs persisted by older builds', () => {
        expect(toSafeRemoteUrl('http://m10.music.126.net/song.mp3'))
            .toBe('https://m10.music.126.net/song.mp3');
        expect(toSafePlaybackUrl('http://m10.music.126.net/song.mp3'))
            .toBe('https://m10.music.126.net/song.mp3');
    });

    it('passes empty values through untouched', () => {
        expect(toSafePlaybackUrl(null)).toBeNull();
        expect(toSafePlaybackUrl(undefined)).toBeUndefined();
    });
});
