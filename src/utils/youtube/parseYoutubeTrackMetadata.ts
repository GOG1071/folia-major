// src/utils/youtube/parseYoutubeTrackMetadata.ts
// Turns a YouTube video's title/channel into the { title, artist } pair used for lyric matching.

export interface YoutubeTrackMetaInput {
    title: string;
    /** yt-dlp `track` / `artist`: only present for YouTube Music auto-generated videos. */
    track?: string;
    artist?: string;
    uploader?: string;
    channel?: string;
}

export interface ParsedYoutubeTrackMetadata {
    title: string;
    artist: string;
}

// Words that only ever describe the upload, never the song. A bracket group made of nothing else
// is dropped; "Live" / "Acoustic" / "feat." stay because they change which recording it is.
const NOISE_TOKENS = [
    'official', 'officiel', 'music', 'video', 'videos', 'mv', 'm\\/v', 'audio', 'lyric', 'lyrics',
    'visuali[sz]er', 'hd', 'hq', '4k', '8k', '1080p', '720p', 'remaster', 'remastered', 'full', 'clip',
    '官方', '完整版', '正式版', '歌词', '歌詞', '動態歌詞', '动态歌词', '中字', '字幕', '高音质', '高音質',
    '无损', '無損', '超清', '高清', '首播', '音源', '公式',
];
// Longest first, so "remastered" is consumed whole instead of leaving "ed" behind "remaster".
const NOISE_TOKEN_PATTERN = new RegExp([...NOISE_TOKENS].sort((a, b) => b.length - a.length).join('|'), 'giu');
// What may remain around noise tokens ("Official Music Video (HD)", "Remastered 2011") and still count as noise.
const NOISE_RESIDUE_PATTERN = /[\s\-_/·.,:;!&+|]+|\b\d{4}\b/gu;
const BRACKET_GROUP_PATTERN = /[(\[（［【「『《]([^)\]）］】」』》]*)[)\]）］】」』》]/gu;
// Bare trailing phrases ("... Official Video"). Deliberately narrower than NOISE_TOKENS: a lone
// "Music" or "Full" can end a real title ("The Sound of Music").
const TRAILING_NOISE_PATTERN = /\s+(?:official\s+(?:(?:music|lyric|audio|hd|4k)\s+)*(?:video|mv|m\/v|audio|lyrics?|visuali[sz]er)|(?:music|lyric)\s+video|lyrics?|mv|m\/v|官方\S*|完整版|歌词|歌詞)\s*$/iu;
const DASH_SEPARATOR_PATTERN = /\s+[-–—]\s+/u;
const PIPE_SEPARATOR_PATTERN = /\s*[｜|]\s*/u;
// "歌手【歌名】…" / "歌手「歌名」…": the title lives inside the bracket instead of after a dash.
const CJK_BRACKET_TITLE_PATTERN = /^(.+?)\s*[【「『《]([^】」』》]+)[】」』》]/u;
const WRAPPING_QUOTES_PATTERN = /^[「『"“'‘《【](.+)[」』"”'’》】]$/u;
const CHANNEL_SUFFIX_PATTERNS = [/\s+-\s+topic$/iu, /vevo$/iu, /\s+official$/iu, /官方(?:频道|頻道)?$/u, /\s+channel$/iu];

const collapseSpaces = (value: string): string => value.replace(/\s+/gu, ' ').trim();

const isNoiseOnly = (content: string): boolean => {
    const stripped = content.replace(NOISE_TOKEN_PATTERN, '').replace(NOISE_RESIDUE_PATTERN, '');
    return content.trim().length > 0 && stripped.length === 0;
};

// Removes bracket groups such as (Official Video), [HD] or 【MV】 whose content is only upload noise.
const stripNoiseBrackets = (text: string): string => collapseSpaces(
    text.replace(BRACKET_GROUP_PATTERN, (group, content: string) => (isNoiseOnly(content) ? ' ' : group)),
);

const stripTrailingNoise = (text: string): string => collapseSpaces(
    text.replace(TRAILING_NOISE_PATTERN, '').replace(/(?:\s+#\S+)+\s*$/u, ''),
);

const unwrapQuotes = (text: string): string => WRAPPING_QUOTES_PATTERN.exec(text)?.[1].trim() ?? text;

/** Drops " - Topic", "VEVO", "Official" style channel decoration from an artist name. */
export const cleanYoutubeArtistName = (name: string | undefined | null): string => {
    let cleaned = collapseSpaces(name ?? '');
    for (const pattern of CHANNEL_SUFFIX_PATTERNS) cleaned = cleaned.replace(pattern, '').trim();
    return cleaned;
};

// "Song | Official Video": drops noise-only pipe segments and keeps the rest joined.
const dropNoisePipeSegments = (text: string): string => collapseSpaces(
    text.split(PIPE_SEPARATOR_PATTERN).filter(segment => segment && !isNoiseOnly(segment)).join(' | '),
);

const splitArtistTitle = (text: string): { artist: string; title: string } | null => {
    const dash = DASH_SEPARATOR_PATTERN.exec(text);
    if (dash) {
        return { artist: text.slice(0, dash.index), title: text.slice(dash.index + dash[0].length) };
    }
    const pipe = text.split(PIPE_SEPARATOR_PATTERN).filter(Boolean);
    if (pipe.length >= 2) return { artist: pipe[0], title: pipe.slice(1).join(' | ') };
    const bracket = CJK_BRACKET_TITLE_PATTERN.exec(text);
    if (bracket) return { artist: bracket[1], title: bracket[2] };
    return null;
};

/** Picks the best { title, artist } for lyric search from yt-dlp metadata. */
export const parseYoutubeTrackMetadata = (input: YoutubeTrackMetaInput): ParsedYoutubeTrackMetadata => {
    const musicTrack = collapseSpaces(input.track ?? '');
    const musicArtist = cleanYoutubeArtistName(input.artist);
    // YouTube Music auto-generated videos carry clean fields; nothing to guess.
    if (musicTrack && musicArtist) return { title: musicTrack, artist: musicArtist };

    const fallbackArtist = cleanYoutubeArtistName(input.channel || input.uploader);
    const cleaned = dropNoisePipeSegments(stripTrailingNoise(stripNoiseBrackets(input.title ?? '')));
    // Cleaning can eat a title that is nothing but noise words; keep the raw text rather than emit ''.
    const text = cleaned || collapseSpaces(input.title ?? '');

    const split = splitArtistTitle(text);
    if (split) {
        const title = unwrapQuotes(stripTrailingNoise(split.title.trim()));
        const artist = cleanYoutubeArtistName(split.artist);
        if (title) return { title, artist: artist || musicArtist || fallbackArtist };
    }
    return { title: unwrapQuotes(text), artist: musicArtist || fallbackArtist };
};
