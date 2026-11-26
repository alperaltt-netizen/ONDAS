import { initializeApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  User,
} from "firebase/auth";
import {
  collection,
  deleteDoc,
  doc,
  getDocFromServer,
  getFirestore,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import firebaseConfig from "../firebase-applet-config.json";
import { AudioTrack, Playlist, TranscriptionItem } from "./types";

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

export enum OperationType {
  CREATE = "create",
  UPDATE = "update",
  DELETE = "delete",
  LIST = "list",
  GET = "get",
  WRITE = "write",
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error("Firestore Error: ", JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Validate connection to Firestore on startup
async function testConnection() {
  try {
    await getDocFromServer(doc(db, "test", "connection"));
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("the client is offline")
    ) {
      console.error("Please check your Firebase configuration.");
    }
  }
}
void testConnection();

export async function signInWithGoogleAccount(): Promise<User> {
  const result = await signInWithPopup(auth, googleProvider);
  return result.user;
}

export async function signOutAccount(): Promise<void> {
  await signOut(auth);
}

function clampStr(value: string | undefined | null, maxLen: number): string {
  return (value ?? "").slice(0, maxLen);
}

function sanitizeId(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 128);
}

export async function upsertUserProfile(
  user: User,
  prefs: {
    theme: "dark" | "light";
    playbackRate: number;
    volume: number;
    lastTrackId: string | null;
  }
): Promise<void> {
  const userPath = `users/${user.uid}`;
  const ref = doc(db, "users", user.uid);
  try {
    const existing = await getDocFromServer(ref).catch(() => null);
    if (existing && existing.exists()) {
      await updateDoc(ref, {
        displayName: clampStr(user.displayName, 120),
        email: clampStr(user.email, 200),
        photoURL: clampStr(user.photoURL, 500),
        theme: prefs.theme,
        playbackRate: Math.max(0.5, Math.min(3, prefs.playbackRate)),
        volume: Math.max(0, Math.min(1, prefs.volume)),
        lastTrackId: clampStr(prefs.lastTrackId, 128),
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(ref, {
        uid: user.uid,
        displayName: clampStr(user.displayName, 120),
        email: clampStr(user.email, 200) || "user@example.com",
        photoURL: clampStr(user.photoURL, 500),
        theme: prefs.theme,
        playbackRate: Math.max(0.5, Math.min(3, prefs.playbackRate)),
        volume: Math.max(0, Math.min(1, prefs.volume)),
        lastTrackId: clampStr(prefs.lastTrackId, 128),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, userPath);
  }
}

export async function syncTrackToCloud(
  userId: string,
  track: AudioTrack
): Promise<void> {
  const safeId = sanitizeId(track.id);
  const path = `users/${userId}/tracks/${safeId}`;
  const ref = doc(db, "users", userId, "tracks", safeId);
  try {
    await setDoc(
      ref,
      {
        id: safeId,
        ownerId: userId,
        title: clampStr(track.title, 200) || "Audio",
        artist: clampStr(track.artist, 160),
        album: clampStr(track.album, 160),
        folderName: clampStr(track.folderName, 160),
        fileName: clampStr(track.fileName, 220) || "audio.mp3",
        duration: Math.max(0, Math.min(864000, track.duration || 0)),
        currentTime: Math.max(0, Math.min(864000, track.currentTime || 0)),
        completed: Boolean(track.completed),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: false }
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateTrackProgressInCloud(
  userId: string,
  track: AudioTrack,
  currentTime: number,
  duration: number,
  completed: boolean
): Promise<void> {
  const safeId = sanitizeId(track.id);
  const path = `users/${userId}/tracks/${safeId}`;
  const ref = doc(db, "users", userId, "tracks", safeId);
  try {
    await updateDoc(ref, {
      duration: Math.max(0, Math.min(864000, duration > 0 ? duration : track.duration || 0)),
      currentTime: Math.max(0, Math.min(864000, currentTime || 0)),
      completed: Boolean(completed),
      updatedAt: serverTimestamp(),
    });
  } catch {
    // If document didn't exist yet in cloud (e.g. added offline), create it cleanly
    try {
      await syncTrackToCloud(userId, {
        ...track,
        currentTime,
        duration: duration > 0 ? duration : track.duration,
        completed,
      });
    } catch (innerErr) {
      handleFirestoreError(innerErr, OperationType.UPDATE, path);
    }
  }
}

export async function deleteTrackFromCloud(
  userId: string,
  trackId: string
): Promise<void> {
  const safeId = sanitizeId(trackId);
  const path = `users/${userId}/tracks/${safeId}`;
  try {
    await deleteDoc(doc(db, "users", userId, "tracks", safeId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function syncPlaylistToCloud(
  userId: string,
  playlist: Playlist,
  isNew: boolean
): Promise<void> {
  const safeId = sanitizeId(playlist.id);
  const path = `users/${userId}/playlists/${safeId}`;
  const ref = doc(db, "users", userId, "playlists", safeId);
  const boundedTrackIds = playlist.trackIds
    .slice(0, 500)
    .map((id) => sanitizeId(id));

  try {
    if (isNew) {
      await setDoc(ref, {
        id: safeId,
        ownerId: userId,
        name: clampStr(playlist.name, 120) || "Lista",
        trackIds: boundedTrackIds,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(ref, {
        name: clampStr(playlist.name, 120) || "Lista",
        trackIds: boundedTrackIds,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    if (!isNew) {
      try {
        await setDoc(ref, {
          id: safeId,
          ownerId: userId,
          name: clampStr(playlist.name, 120) || "Lista",
          trackIds: boundedTrackIds,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        return;
      } catch (innerErr) {
        handleFirestoreError(innerErr, OperationType.WRITE, path);
      }
    }
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deletePlaylistFromCloud(
  userId: string,
  playlistId: string
): Promise<void> {
  const safeId = sanitizeId(playlistId);
  const path = `users/${userId}/playlists/${safeId}`;
  try {
    await deleteDoc(doc(db, "users", userId, "playlists", safeId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function saveTranscriptionToCloud(
  userId: string,
  item: TranscriptionItem
): Promise<void> {
  const safeId = sanitizeId(item.id);
  const path = `users/${userId}/transcriptions/${safeId}`;
  const ref = doc(db, "users", userId, "transcriptions", safeId);
  try {
    await setDoc(ref, {
      id: safeId,
      ownerId: userId,
      title: clampStr(item.title, 180) || "Nota de voz",
      text: clampStr(item.text, 20000) || " ",
      durationSec: Math.max(0, Math.min(3600, item.durationSec || 0)),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function deleteTranscriptionFromCloud(
  userId: string,
  transcriptionId: string
): Promise<void> {
  const safeId = sanitizeId(transcriptionId);
  const path = `users/${userId}/transcriptions/${safeId}`;
  try {
    await deleteDoc(doc(db, "users", userId, "transcriptions", safeId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export function subscribeUserTranscriptions(
  userId: string,
  onData: (items: TranscriptionItem[]) => void
): () => void {
  const path = `users/${userId}/transcriptions`;
  const q = query(
    collection(db, "users", userId, "transcriptions"),
    orderBy("createdAt", "desc")
  );
  return onSnapshot(
    q,
    (snap) => {
      const list: TranscriptionItem[] = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: String(data.id ?? d.id),
          title: String(data.title ?? "Nota de voz"),
          text: String(data.text ?? ""),
          durationSec: Number(data.durationSec ?? 0),
          createdAt:
            typeof data.createdAt?.toMillis === "function"
              ? data.createdAt.toMillis()
              : Date.now(),
        };
      });
      onData(list);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export function subscribeUserTracksProgress(
  userId: string,
  onData: (
    cloudTracks: Array<{
      id: string;
      fileName: string;
      currentTime: number;
      duration: number;
      completed: boolean;
    }>
  ) => void
): () => void {
  const path = `users/${userId}/tracks`;
  const q = query(collection(db, "users", userId, "tracks"));
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: String(data.id ?? d.id),
          fileName: String(data.fileName ?? ""),
          currentTime: Number(data.currentTime ?? 0),
          duration: Number(data.duration ?? 0),
          completed: Boolean(data.completed),
        };
      });
      onData(list);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export function subscribeUserPlaylists(
  userId: string,
  onData: (playlists: Playlist[]) => void
): () => void {
  const path = `users/${userId}/playlists`;
  const q = query(collection(db, "users", userId, "playlists"));
  return onSnapshot(
    q,
    (snap) => {
      const list: Playlist[] = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: String(data.id ?? d.id),
          name: String(data.name ?? "Lista"),
          trackIds: Array.isArray(data.trackIds)
            ? data.trackIds.map(String)
            : [],
          hasCoverBlob: false,
          createdAt:
            typeof data.createdAt?.toMillis === "function"
              ? data.createdAt.toMillis()
              : Date.now(),
          updatedAt:
            typeof data.updatedAt?.toMillis === "function"
              ? data.updatedAt.toMillis()
              : Date.now(),
        };
      });
      onData(list);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}
