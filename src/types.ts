export type PlaybackSpeed = 0.75 | 1 | 1.25 | 1.5 | 1.75 | 2;

export type RepeatMode = "off" | "all" | "one";

export interface AudioTrack {
  id: string;
  title: string;
  artist: string;
  album: string;
  folderName: string;
  fileName: string;
  mimeType: string;
  size: number;
  duration: number;
  currentTime: number;
  completed: boolean;
  hasCoverBlob: boolean;
  addedAt: number;
  lastPlayedAt: number | null;
}

export interface Playlist {
  id: string;
  name: string;
  trackIds: string[];
  hasCoverBlob: boolean;
  createdAt: number;
  updatedAt: number;
}

export type ActiveView =
  | { type: "library" }
  | { type: "in-progress" }
  | { type: "playlist"; playlistId: string };

export interface CoverSearchCandidate {
  url: string;
  title: string;
  source: string;
  sourceKey?: "google" | "amazon" | "deezer" | "apple" | "musicbrainz";
}

export interface CoverSearchTarget {
  kind: "track" | "playlist";
  id: string;
  initialQuery: string;
  initialAuthor?: string;
  title: string;
}

export interface SearchInfoTarget {
  title: string;
  artist?: string;
}

export interface TranscriptionItem {
  id: string;
  title: string;
  text: string;
  durationSec: number;
  createdAt: number;
}
