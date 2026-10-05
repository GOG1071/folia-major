// src/types/localLibrary.ts
// Defines stable local-library identities independently from file paths and online source ids.

export type LocalLibraryEntityKind = 'artist' | 'album';

export interface LocalLibraryEntity {
  id: string;
  kind: LocalLibraryEntityKind;
  displayName: string;
  aliases: string[];
  normalizedAliases: string[];
  mergedInto?: string;
  needsReview?: boolean;
  createdAt: number;
  updatedAt: number;
}

export type LocalLibraryAssignmentOrigin = 'import' | 'auto-match' | 'manual-match' | 'manual' | 'split';

export type LocalSongTitleOrigin = 'import' | 'auto-match' | 'manual-match';
// Records saved by older builds can carry 'netease' or 'kugou' here; those providers are gone, so such a record is
// kept as plain display metadata and never used as a lookup identity (see buildLocalSongLyricMatchContext).
export type LocalSongMetadataSource = 'qq';

export interface LocalSongImportedMetadata {
  title: string;
  titleSource: 'embedded' | 'filename';
  artistNames: string[];
  albumName?: string;
}

export interface LocalSongOnlineMetadata {
  source: LocalSongMetadataSource;
  songId?: number | string;
  albumId?: number | string;
  title?: string;
  artists: Array<{ id?: number | string; name: string }>;
  album?: { id?: number | string; name: string };
  coverUrl?: string;
  matchMode: 'auto' | 'manual' | 'legacy';
  matchedAt: number;
}

export interface LocalSongReference {
  songId: string;
}

export interface LocalLibraryAssignment {
  songId: string;
  artistEntityIds: string[];
  artistOrigin: LocalLibraryAssignmentOrigin;
  albumEntityId?: string;
  albumOrigin: LocalLibraryAssignmentOrigin;
  updatedAt: number;
}

export interface LocalLibrarySplitTarget {
  entityId?: string;
  displayName: string;
}

export type LocalLibraryArtistAssignmentMode = 'append' | 'replace';

