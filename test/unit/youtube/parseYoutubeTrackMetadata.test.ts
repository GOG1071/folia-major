import { describe, expect, it } from 'vitest';
import { cleanYoutubeArtistName, parseYoutubeTrackMetadata } from '../../../src/utils/youtube/parseYoutubeTrackMetadata';

// test/unit/youtube/parseYoutubeTrackMetadata.test.ts
// Realistic YouTube titles (English, Chinese, Japanese, YouTube Music topic channels).

describe('parseYoutubeTrackMetadata', () => {
    it('prefers the clean track/artist pair of YouTube Music auto-generated videos', () => {
        expect(parseYoutubeTrackMetadata({
            title: 'Blinding Lights (Official Audio)',
            track: 'Blinding Lights',
            artist: 'The Weeknd',
            channel: 'The Weeknd - Topic',
        })).toEqual({ title: 'Blinding Lights', artist: 'The Weeknd' });
    });

    it.each([
        ['Taylor Swift - Shake It Off (Official Video)', 'Shake It Off', 'Taylor Swift'],
        ['Ed Sheeran - Shape of You [Official Lyric Video]', 'Shape of You', 'Ed Sheeran'],
        ['周杰倫 Jay Chou【告白氣球 Love Confession】Official MV', '告白氣球 Love Confession', '周杰倫 Jay Chou'],
        ['邓紫棋 G.E.M.【光年之外 Light Years Away】Official Music Video', '光年之外 Light Years Away', '邓紫棋 G.E.M.'],
        ['YOASOBI「アイドル」 Official Music Video', 'アイドル', 'YOASOBI'],
        ['【MV】米津玄師 - Lemon', 'Lemon', '米津玄師'],
        ['林俊傑 JJ Lin - 修煉愛情 Cultivating Love (官方完整版MV)', '修煉愛情 Cultivating Love', '林俊傑 JJ Lin'],
        ['Imagine Dragons - Believer | Official Music Video', 'Believer', 'Imagine Dragons'],
        ['King Gnu - 白日 ｜ Official Music Video', '白日', 'King Gnu'],
        ['Adele – Easy On Me (Official Video) [4K Remastered 2021]', 'Easy On Me', 'Adele'],
        ['Queen - Bohemian Rhapsody (Live)', 'Bohemian Rhapsody (Live)', 'Queen'],
        ['Artist - Song Title Official Video', 'Song Title', 'Artist'],
    ])('splits %j', (title, expectedTitle, expectedArtist) => {
        expect(parseYoutubeTrackMetadata({ title })).toEqual({ title: expectedTitle, artist: expectedArtist });
    });

    it('keeps a title that has no artist and falls back to the channel name', () => {
        expect(parseYoutubeTrackMetadata({ title: 'Never Gonna Give You Up', channel: 'Rick Astley - Topic' }))
            .toEqual({ title: 'Never Gonna Give You Up', artist: 'Rick Astley' });
        expect(parseYoutubeTrackMetadata({ title: 'Me at the zoo', uploader: 'jawed' }))
            .toEqual({ title: 'Me at the zoo', artist: 'jawed' });
    });

    it('does not strip words that merely look like noise from a real title', () => {
        expect(parseYoutubeTrackMetadata({ title: 'Julie Andrews - The Sound of Music', channel: 'x' }))
            .toEqual({ title: 'The Sound of Music', artist: 'Julie Andrews' });
    });

    it('keeps the raw title when it is nothing but noise', () => {
        expect(parseYoutubeTrackMetadata({ title: '(Official Video)', channel: 'Chan' }).title).toBe('(Official Video)');
    });

    it('cleans channel decoration from artist names', () => {
        expect(cleanYoutubeArtistName('Taylor Swift - Topic')).toBe('Taylor Swift');
        expect(cleanYoutubeArtistName('TaylorSwiftVEVO')).toBe('TaylorSwift');
        expect(cleanYoutubeArtistName('周杰伦官方频道')).toBe('周杰伦');
        expect(cleanYoutubeArtistName('Adele Official')).toBe('Adele');
        expect(cleanYoutubeArtistName(undefined)).toBe('');
    });
});
