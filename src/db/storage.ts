import { AudioTrack, PlaybackSpeed, Playlist, RepeatMode } from "../types";

const DB_NAME = "ondas_audio_library_v1";
const DB_VERSION = 1;

const STORE_TRACKS = "tracks";
const STORE_AUDIO = "audioFiles";
const STORE_COVERS = "covers";
const STORE_PLAYLISTS = "playlists";

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_TRACKS)) {
        db.createObjectStore(STORE_TRACKS, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORE_AUDIO)) {
        db.createObjectStore(STORE_AUDIO);
      }
      if (!db.objectStoreNames.contains(STORE_COVERS)) {
        db.createObjectStore(STORE_COVERS);
      }
      if (!db.objectStoreNames.contains(STORE_PLAYLISTS)) {
        db.createObjectStore(STORE_PLAYLISTS, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function runTx<T>(
  storeName: string,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  return openDatabase().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, mode);
        const store = tx.objectStore(storeName);
        const req = fn(store);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      })
  );
}

export async function getAllTracks(): Promise<AudioTrack[]> {
  const list = await runTx<AudioTrack[]>(STORE_TRACKS, "readonly", (s) =>
    s.getAll()
  );
  return list.sort((a, b) => a.addedAt - b.addedAt);
}

export async function saveTrack(track: AudioTrack): Promise<void> {
  await runTx(STORE_TRACKS, "readwrite", (s) => s.put(track));
}

export async function saveTrackWithMedia(
  track: AudioTrack,
  audioBlob: Blob,
  coverBlob?: Blob | null
): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(
      [STORE_TRACKS, STORE_AUDIO, STORE_COVERS],
      "readwrite"
    );
    tx.objectStore(STORE_TRACKS).put(track);
    tx.objectStore(STORE_AUDIO).put(audioBlob, track.id);
    if (coverBlob) {
      tx.objectStore(STORE_COVERS).put(coverBlob, track.id);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function updateTrackProgress(
  trackId: string,
  currentTime: number,
  duration: number,
  completed: boolean
): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_TRACKS, "readwrite");
    const store = tx.objectStore(STORE_TRACKS);
    const getReq = store.get(trackId);
    getReq.onsuccess = () => {
      const existing = getReq.result as AudioTrack | undefined;
      if (!existing) {
        resolve();
        return;
      }
      const updated: AudioTrack = {
        ...existing,
        currentTime,
        duration: duration > 0 ? duration : existing.duration,
        completed,
        lastPlayedAt: Date.now(),
      };
      store.put(updated);
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function deleteTrackRecord(trackId: string): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(
      [STORE_TRACKS, STORE_AUDIO, STORE_COVERS],
      "readwrite"
    );
    tx.objectStore(STORE_TRACKS).delete(trackId);
    tx.objectStore(STORE_AUDIO).delete(trackId);
    tx.objectStore(STORE_COVERS).delete(trackId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getAudioBlob(trackId: string): Promise<Blob | null> {
  const result = await runTx<Blob | undefined>(
    STORE_AUDIO,
    "readonly",
    (s) => s.get(trackId)
  );
  return result ?? null;
}

export async function getCoverBlob(key: string): Promise<Blob | null> {
  const result = await runTx<Blob | undefined>(
    STORE_COVERS,
    "readonly",
    (s) => s.get(key)
  );
  return result ?? null;
}

export async function saveCoverBlob(key: string, blob: Blob): Promise<void> {
  await runTx(STORE_COVERS, "readwrite", (s) => s.put(blob, key));
}

export async function getAllPlaylists(): Promise<Playlist[]> {
  const list = await runTx<Playlist[]>(STORE_PLAYLISTS, "readonly", (s) =>
    s.getAll()
  );
  return list.sort((a, b) => a.createdAt - b.createdAt);
}

export async function savePlaylist(playlist: Playlist): Promise<void> {
  await runTx(STORE_PLAYLISTS, "readwrite", (s) => s.put(playlist));
}

export async function deletePlaylistRecord(playlistId: string): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_PLAYLISTS, STORE_COVERS], "readwrite");
    tx.objectStore(STORE_PLAYLISTS).delete(playlistId);
    tx.objectStore(STORE_COVERS).delete(`playlist:${playlistId}`);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// Lightweight localStorage preferences
const PREF_KEY = "ondas_player_prefs_v1";

export interface PlayerPreferences {
  theme: "dark" | "light";
  lastTrackId: string | null;
  volume: number;
  muted: boolean;
  playbackRate: PlaybackSpeed;
  shuffle: boolean;
  repeatMode: RepeatMode;
}

const DEFAULT_PREFS: PlayerPreferences = {
  theme: "dark",
  lastTrackId: null,
  volume: 0.9,
  muted: false,
  playbackRate: 1,
  shuffle: false,
  repeatMode: "off",
};

export function loadPreferences(): PlayerPreferences {
  try {
    const raw = localStorage.getItem(PREF_KEY);
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw) as Partial<PlayerPreferences>;
    return {
      theme: parsed.theme === "light" ? "light" : "dark",
      lastTrackId:
        typeof parsed.lastTrackId === "string" ? parsed.lastTrackId : null,
      volume:
        typeof parsed.volume === "number"
          ? Math.max(0, Math.min(1, parsed.volume))
          : 0.9,
      muted: Boolean(parsed.muted),
      playbackRate:
        parsed.playbackRate &&
        [0.75, 1, 1.25, 1.5, 1.75, 2].includes(parsed.playbackRate)
          ? parsed.playbackRate
          : 1,
      shuffle: Boolean(parsed.shuffle),
      repeatMode:
        parsed.repeatMode === "all" || parsed.repeatMode === "one"
          ? parsed.repeatMode
          : "off",
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

export function savePreferences(partial: Partial<PlayerPreferences>): void {
  const current = loadPreferences();
  localStorage.setItem(PREF_KEY, JSON.stringify({ ...current, ...partial }));
}
