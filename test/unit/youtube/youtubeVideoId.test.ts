import { createRequire } from 'module';
import { describe, expect, it } from 'vitest';
import { parseYoutubeVideoId as parseRenderer } from '../../../src/utils/youtube/youtubeVideoId';

// test/unit/youtube/youtubeVideoId.test.ts
// Runs one case table against the renderer parser and the Electron main-process copy so they cannot drift.

const require = createRequire(import.meta.url);
const main = require('../../../shared/youtubeVideoId.cjs') as {
    parseYoutubeVideoId: (input: unknown) => string | null;
    buildCanonicalYoutubeUrl: (id: string) => string;
};

const ID = 'jNQXAC9IVRw';
const CASES: Array<[string, string | null]> = [
    [`https://www.youtube.com/watch?v=${ID}`, ID],
    [`https://youtube.com/watch?v=${ID}&list=PL123&t=42s`, ID],
    [`https://www.youtube.com/watch?list=PL123&v=${ID}&si=abc`, ID],
    [`https://m.youtube.com/watch?v=${ID}`, ID],
    [`https://music.youtube.com/watch?v=${ID}&si=xyz`, ID],
    [`https://youtu.be/${ID}`, ID],
    [`https://youtu.be/${ID}?t=10&si=abc`, ID],
    [`https://www.youtube.com/shorts/${ID}`, ID],
    [`https://www.youtube.com/embed/${ID}?start=3`, ID],
    [`https://www.youtube.com/live/${ID}?feature=share`, ID],
    [`https://www.youtube-nocookie.com/embed/${ID}`, ID],
    [`  https://www.youtube.com/watch?v=${ID}  `, ID],
    [`youtu.be/${ID}`, ID],
    [`www.youtube.com/watch?v=${ID}`, ID],
    [`http://www.youtube.com/watch?v=${ID}`, ID],
    ['https://www.youtube.com/watch?v=short', null],
    [`https://www.youtube.com/watch?v=${ID}extra`, null],
    ['https://www.youtube.com/playlist?list=PL123', null],
    ['https://www.youtube.com/@someChannel', null],
    [`https://evil.com/watch?v=${ID}`, null],
    [`https://youtube.com.evil.com/watch?v=${ID}`, null],
    [`https://notyoutu.be/${ID}`, null],
    [`javascript:alert(1)//youtu.be/${ID}`, null],
    [`ftp://www.youtube.com/watch?v=${ID}`, null],
    [`https://www.youtube.com/watch?v=${ID}; rm -rf /`, null],
    [ID, null],
    ['', null],
    ['周杰伦 告白气球', null],
];

describe.each([
    ['renderer parser', parseRenderer],
    ['main-process parser', main.parseYoutubeVideoId],
])('%s', (_name, parse) => {
    it.each(CASES)('parses %j -> %j', (input, expected) => {
        expect(parse(input)).toBe(expected);
    });

    it('rejects non-string input', () => {
        expect(parse(undefined)).toBeNull();
        expect(parse(42)).toBeNull();
    });
});

describe('buildCanonicalYoutubeUrl', () => {
    it('builds the only URL form yt-dlp receives', () => {
        expect(main.buildCanonicalYoutubeUrl(ID)).toBe(`https://www.youtube.com/watch?v=${ID}`);
    });

    it('refuses ids that are not exactly 11 safe chars', () => {
        expect(() => main.buildCanonicalYoutubeUrl('../../etc/passwd')).toThrow();
        expect(() => main.buildCanonicalYoutubeUrl(`${ID}&x=1`)).toThrow();
    });
});
