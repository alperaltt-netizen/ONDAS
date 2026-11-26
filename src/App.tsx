import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence } from "motion/react";
import { FolderPlus } from "lucide-react";
import { onAuthStateChanged, User } from "firebase/auth";
import {
  deletePlaylistRecord,
  deleteTrackRecord,
  getAllPlaylists,
  getAllTracks,
  getAudioBlob,
  getCoverBlob,
  loadPreferences,
  saveCoverBlob,
  savePlaylist,
  savePreferences,
  saveTrack,
  saveTrackWithMedia,
  updateTrackProgress,
} from "./db/storage";
import {
  auth,
  deletePlaylistFromCloud,
  deleteTrackFromCloud,
  deleteTranscriptionFromCloud,
  saveTranscriptionToCloud,
  signInWithGoogleAccount,
  signOutAccount,
  subscribeUserPlaylists,
  subscribeUserTracksProgress,
  subscribeUserTranscriptions,
  syncPlaylistToCloud,
  syncTrackToCloud,
  updateTrackProgressInCloud,
  upsertUserProfile,
} from "./firebase";
import {
  ActiveView,
  AudioTrack,
  CoverSearchTarget,
  PlaybackSpeed,
  Playlist,
  RepeatMode,
  SearchInfoTarget,
  TranscriptionItem,
} from "./types";
import {
  AUDIO_ACCEPT_STRING,
  buildDemoEpisodes,
  convertAiffToWavIfNeeded,
  extractFilesFromDataTransfer,
  formatTime,
  ImportedFileEntry,
  isAudioFile,
  parseAudioMetadata,
  probeAudioDuration,
  transcodeViaWebAudioToWav,
} from "./utils/audioTags";
import { Sidebar } from "./components/Sidebar";
import { TopBar } from "./components/TopBar";
import { TrackList } from "./components/TrackList";
import { PlayerBar, SPEEDS } from "./components/PlayerBar";
import { MiniPlayer } from "./components/MiniPlayer";
import { ImmersivePlayer } from "./components/ImmersivePlayer";
import { QueueDrawer } from "./components/QueueDrawer";
import { CoverSearchModal } from "./components/CoverSearchModal";
import { SearchInfoModal } from "./components/SearchInfoModal";
import { TranscribeModal } from "./components/TranscribeModal";

interface DocumentPiPApi {
  requestWindow: (opts?: { width?: number; height?: number }) => Promise<Window>;
}

const LOCAL_TRANSCRIPTIONS_KEY = "ondas_local_transcriptions_v1";

function loadLocalTranscriptions(): TranscriptionItem[] {
  try {
    const raw = localStorage.getItem(LOCAL_TRANSCRIPTIONS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as TranscriptionItem[]) : [];
  } catch {
    return [];
  }
}

export default function App() {
  const initialPrefs = useMemo(() => loadPreferences(), []);
  const [theme, setTheme] = useState<"dark" | "light">(initialPrefs.theme);
  const [tracks, setTracks] = useState<AudioTrack[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [coverUrls, setCoverUrls] = useState<Record<string, string>>({});
  const [activeView, setActiveView] = useState<ActiveView>({ type: "library" });
  const [searchQuery, setSearchQuery] = useState("");
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Firebase Auth & Cloud Sync state
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [transcriptions, setTranscriptions] = useState<TranscriptionItem[]>(() =>
    loadLocalTranscriptions()
  );

  // Playback state
  const [currentTrackId, setCurrentTrackId] = useState<string | null>(
    initialPrefs.lastTrackId
  );
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(initialPrefs.volume);
  const [muted, setMuted] = useState(initialPrefs.muted);
  const [playbackRate, setPlaybackRate] = useState<PlaybackSpeed>(
    initialPrefs.playbackRate
  );
  const [shuffle, setShuffle] = useState(initialPrefs.shuffle);
  const [repeatMode, setRepeatMode] = useState<RepeatMode>(
    initialPrefs.repeatMode
  );
  const [audioError, setAudioError] = useState<string | null>(null);

  // Fluid workspace panels & modals
  const [isQueueOpen, setIsQueueOpen] = useState(false);
  const [isMiniPlayer, setIsMiniPlayer] = useState(false);
  const [isImmersive, setIsImmersive] = useState(false);
  const [isTranscribeOpen, setIsTranscribeOpen] = useState(false);
  const [searchInfoTarget, setSearchInfoTarget] =
    useState<SearchInfoTarget | null>(null);

  // Import & cover modal
  const [isHydrated, setIsHydrated] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const [coverTarget, setCoverTarget] = useState<CoverSearchTarget | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const activeAudioObjectUrlRef = useRef<string | null>(null);
  const activeAudioBlobRef = useRef<Blob | null>(null);
  const fallbackAttemptedRef = useRef<boolean>(false);
  const coverObjectUrlsRef = useRef<Record<string, string>>({});
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const filesInputRef = useRef<HTMLInputElement | null>(null);
  const lastSavedTickRef = useRef<number>(0);
  const lastCloudSyncTickRef = useRef<number>(0);
  const pendingResumeTimeRef = useRef<number | null>(null);
  const shouldAutoPlayOnLoadRef = useRef<boolean>(false);
  const pipWindowRef = useRef<Window | null>(null);

  const canPopoutPip = useMemo(
    () =>
      typeof window !== "undefined" &&
      "documentPictureInPicture" in window &&
      window.self === window.top,
    []
  );

  // Sync Tailwind .dark class on <html>
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
    savePreferences({ theme });
  }, [theme]);

  // Listen to Firebase Auth state
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

  // Upsert profile and subscribe to user's Firestore data when authenticated
  useEffect(() => {
    if (!authReady || !user) return;

    let cancelled = false;
    let unsubTranscriptions: (() => void) | undefined;
    let unsubPlaylists: (() => void) | undefined;
    let unsubTracks: (() => void) | undefined;

    async function initCloudSync() {
      await upsertUserProfile(user!, {
        theme,
        playbackRate,
        volume,
        lastTrackId: currentTrackId,
      });
      if (cancelled) return;

      unsubTranscriptions = subscribeUserTranscriptions(user!.uid, (items) => {
        setTranscriptions(items);
      });

      unsubPlaylists = subscribeUserPlaylists(user!.uid, (cloudPlaylists) => {
        if (cloudPlaylists.length === 0) return;
        setPlaylists((prev) => {
          const merged = new Map<string, Playlist>();
          for (const p of prev) merged.set(p.id, p);
          for (const cp of cloudPlaylists) {
            const local = merged.get(cp.id);
            merged.set(cp.id, {
              ...cp,
              hasCoverBlob: local?.hasCoverBlob ?? false,
            });
            void savePlaylist({
              ...cp,
              hasCoverBlob: local?.hasCoverBlob ?? false,
            });
          }
          return Array.from(merged.values()).sort(
            (a, b) => a.createdAt - b.createdAt
          );
        });
      });

      unsubTracks = subscribeUserTracksProgress(user!.uid, (cloudTracks) => {
        if (cloudTracks.length === 0) return;
        setTracks((prev) =>
          prev.map((localTrack) => {
            const match =
              cloudTracks.find((c) => c.id === localTrack.id) ??
              cloudTracks.find((c) => c.fileName === localTrack.fileName);
            if (!match) return localTrack;
            if (
              match.currentTime > localTrack.currentTime ||
              (match.completed && !localTrack.completed)
            ) {
              void updateTrackProgress(
                localTrack.id,
                match.currentTime,
                match.duration || localTrack.duration,
                match.completed
              );
              return {
                ...localTrack,
                currentTime: match.currentTime,
                duration: match.duration || localTrack.duration,
                completed: match.completed,
              };
            }
            return localTrack;
          })
        );
      });
    }

    void initCloudSync();

    return () => {
      cancelled = true;
      unsubTranscriptions?.();
      unsubPlaylists?.();
      unsubTracks?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authReady, user]);

  // Hydrate library, playlists, and cover blobs from IndexedDB on mount
  useEffect(() => {
    let cancelled = false;
    async function hydrate() {
      const [loadedTracks, loadedPlaylists] = await Promise.all([
        getAllTracks(),
        getAllPlaylists(),
      ]);
      if (cancelled) return;

      setTracks(loadedTracks);
      setPlaylists(loadedPlaylists);

      const urlMap: Record<string, string> = {};
      for (const t of loadedTracks) {
        if (t.hasCoverBlob) {
          const blob = await getCoverBlob(t.id);
          if (blob) {
            urlMap[t.id] = URL.createObjectURL(blob);
          }
        }
      }
      for (const pl of loadedPlaylists) {
        if (pl.hasCoverBlob) {
          const blob = await getCoverBlob(`playlist:${pl.id}`);
          if (blob) {
            urlMap[`playlist:${pl.id}`] = URL.createObjectURL(blob);
          }
        }
      }
      if (!cancelled) {
        coverObjectUrlsRef.current = urlMap;
        setCoverUrls(urlMap);
      } else {
        Object.values(urlMap).forEach((u) => URL.revokeObjectURL(u));
      }

      if (initialPrefs.lastTrackId) {
        const found = loadedTracks.find(
          (t) => t.id === initialPrefs.lastTrackId
        );
        if (found) {
          setCurrentTime(found.currentTime);
          setDuration(found.duration);
        } else {
          setCurrentTrackId(null);
        }
      }
      if (!cancelled) {
        setIsHydrated(true);
      }
    }

    void hydrate();

    return () => {
      cancelled = true;
      Object.values(coverObjectUrlsRef.current).forEach((u) =>
        URL.revokeObjectURL(u)
      );
      if (activeAudioObjectUrlRef.current) {
        URL.revokeObjectURL(activeAudioObjectUrlRef.current);
      }
      pipWindowRef.current?.close();
    };
  }, [initialPrefs.lastTrackId]);

  const activePlaylist = useMemo(() => {
    if (activeView.type !== "playlist") return null;
    return playlists.find((p) => p.id === activeView.playlistId) ?? null;
  }, [activeView, playlists]);

  const visibleTracks = useMemo(() => {
    let base: AudioTrack[];
    if (activeView.type === "in-progress") {
      base = tracks.filter((t) => t.currentTime > 1 && !t.completed);
    } else if (activeView.type === "playlist" && activePlaylist) {
      const byId = new Map(tracks.map((t) => [t.id, t]));
      base = activePlaylist.trackIds
        .map((id) => byId.get(id))
        .filter((t): t is AudioTrack => Boolean(t));
    } else {
      base = tracks;
    }

    const q = searchQuery.trim().toLowerCase();
    if (!q) return base;
    return base.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.artist.toLowerCase().includes(q) ||
        t.folderName.toLowerCase().includes(q) ||
        t.album.toLowerCase().includes(q)
    );
  }, [activeView, activePlaylist, tracks, searchQuery]);

  const currentTrack = useMemo(
    () => tracks.find((t) => t.id === currentTrackId) ?? null,
    [tracks, currentTrackId]
  );

  const inProgressCount = useMemo(
    () => tracks.filter((t) => t.currentTime > 1 && !t.completed).length,
    [tracks]
  );

  const persistProgress = useCallback(
    (
      trackId: string,
      time: number,
      dur: number,
      completed: boolean,
      forceCloud = false
    ) => {
      let targetTrack: AudioTrack | undefined;
      setTracks((prev) =>
        prev.map((t) => {
          if (t.id !== trackId) return t;
          targetTrack = t;
          return {
            ...t,
            currentTime: time,
            duration: dur > 0 ? dur : t.duration,
            completed,
            lastPlayedAt: Date.now(),
          };
        })
      );
      void updateTrackProgress(trackId, time, dur, completed);

      const now = Date.now();
      if (
        user &&
        targetTrack &&
        (forceCloud || now - lastCloudSyncTickRef.current >= 8000)
      ) {
        lastCloudSyncTickRef.current = now;
        void updateTrackProgressInCloud(
          user.uid,
          targetTrack,
          time,
          dur,
          completed
        );
      }
    },
    [user]
  );

  // Load selected track audio blob into <audio> element (with AIFF conversion)
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !currentTrackId || !isHydrated) return;

    let cancelled = false;
    async function loadAudioSource() {
      const track = tracks.find((t) => t.id === currentTrackId);
      const rawBlob = await getAudioBlob(currentTrackId!);
      if (cancelled || !rawBlob || !audioRef.current) return;

      setAudioError(null);
      fallbackAttemptedRef.current = false;

      const playableBlob = track
        ? await convertAiffToWavIfNeeded(rawBlob, track.fileName)
        : rawBlob;
      if (cancelled || !audioRef.current) return;

      activeAudioBlobRef.current = playableBlob;

      if (activeAudioObjectUrlRef.current) {
        URL.revokeObjectURL(activeAudioObjectUrlRef.current);
      }
      const objectUrl = URL.createObjectURL(playableBlob);
      activeAudioObjectUrlRef.current = objectUrl;

      const resumePos =
        track && !track.completed && track.currentTime > 0
          ? track.currentTime
          : 0;
      pendingResumeTimeRef.current = resumePos;
      setCurrentTime(resumePos);
      setDuration(track?.duration ?? 0);

      audioRef.current.src = objectUrl;
      audioRef.current.playbackRate = playbackRate;
      audioRef.current.volume = muted ? 0 : volume;
      audioRef.current.load();
    }

    savePreferences({ lastTrackId: currentTrackId });
    void loadAudioSource();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTrackId, isHydrated]);

  useEffect(() => {
    if (!audioRef.current) return;
    audioRef.current.volume = muted ? 0 : volume;
    savePreferences({ volume, muted });
  }, [volume, muted]);

  useEffect(() => {
    if (!audioRef.current) return;
    audioRef.current.playbackRate = playbackRate;
    savePreferences({ playbackRate });
  }, [playbackRate]);

  useEffect(() => {
    savePreferences({ shuffle });
  }, [shuffle]);

  useEffect(() => {
    savePreferences({ repeatMode });
  }, [repeatMode]);

  useEffect(() => {
    const handleBeforeUnload = () => {
      const audio = audioRef.current;
      if (audio && currentTrackId) {
        const dur = Number.isFinite(audio.duration) ? audio.duration : duration;
        const completed = dur > 0 && audio.currentTime >= dur - 1.5;
        void updateTrackProgress(
          currentTrackId,
          completed ? 0 : audio.currentTime,
          dur,
          completed
        );
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [currentTrackId, duration]);

  const playTrackById = useCallback(
    (trackId: string) => {
      const audio = audioRef.current;
      if (currentTrackId && audio && currentTrackId !== trackId) {
        const dur = Number.isFinite(audio.duration) ? audio.duration : duration;
        persistProgress(currentTrackId, audio.currentTime, dur, false, true);
      }

      if (currentTrackId === trackId && audio) {
        if (audio.paused) {
          void audio.play();
          setIsPlaying(true);
        } else {
          audio.pause();
          setIsPlaying(false);
          persistProgress(
            trackId,
            audio.currentTime,
            Number.isFinite(audio.duration) ? audio.duration : duration,
            false,
            true
          );
        }
        return;
      }

      shouldAutoPlayOnLoadRef.current = true;
      setCurrentTrackId(trackId);
    },
    [currentTrackId, duration, persistProgress]
  );

  const handleTogglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !currentTrackId) return;
    if (audio.paused) {
      void audio.play();
      setIsPlaying(true);
    } else {
      audio.pause();
      setIsPlaying(false);
      persistProgress(
        currentTrackId,
        audio.currentTime,
        Number.isFinite(audio.duration) ? audio.duration : duration,
        false,
        true
      );
    }
  }, [currentTrackId, duration, persistProgress]);

  const handleSeek = useCallback(
    (time: number) => {
      const audio = audioRef.current;
      if (!audio || !currentTrackId) return;
      const clamped = Math.max(0, Math.min(time, duration || time));
      audio.currentTime = clamped;
      setCurrentTime(clamped);
      persistProgress(currentTrackId, clamped, duration, false, true);
    },
    [currentTrackId, duration, persistProgress]
  );

  const handleSkipRelative = useCallback(
    (delta: number) => {
      const audio = audioRef.current;
      if (!audio || !currentTrackId) return;
      const maxDur = Number.isFinite(audio.duration) ? audio.duration : duration;
      const next = Math.max(0, Math.min(audio.currentTime + delta, maxDur || 0));
      audio.currentTime = next;
      setCurrentTime(next);
      persistProgress(currentTrackId, next, maxDur, false, true);
    },
    [currentTrackId, duration, persistProgress]
  );

  const activeQueue = visibleTracks.length > 0 ? visibleTracks : tracks;
  const currentQueueIndex = activeQueue.findIndex(
    (t) => t.id === currentTrackId
  );

  const hasPrevious =
    activeQueue.length > 0 &&
    (currentQueueIndex > 0 || repeatMode === "all" || currentTime > 3);
  const hasNext =
    activeQueue.length > 0 &&
    (shuffle ||
      repeatMode === "all" ||
      (currentQueueIndex >= 0 && currentQueueIndex < activeQueue.length - 1));

  const handlePrevious = useCallback(() => {
    if (activeQueue.length === 0) return;
    if (currentTime > 3) {
      handleSeek(0);
      return;
    }
    if (currentQueueIndex > 0) {
      playTrackById(activeQueue[currentQueueIndex - 1].id);
    } else if (repeatMode === "all") {
      playTrackById(activeQueue[activeQueue.length - 1].id);
    }
  }, [activeQueue, currentQueueIndex, currentTime, handleSeek, playTrackById, repeatMode]);

  const handleNext = useCallback(() => {
    if (activeQueue.length === 0) return;
    if (shuffle && activeQueue.length > 1) {
      const candidates = activeQueue.filter((t) => t.id !== currentTrackId);
      const randomTrack =
        candidates[Math.floor(Math.random() * candidates.length)];
      if (randomTrack) {
        playTrackById(randomTrack.id);
        return;
      }
    }
    if (
      currentQueueIndex >= 0 &&
      currentQueueIndex < activeQueue.length - 1
    ) {
      playTrackById(activeQueue[currentQueueIndex + 1].id);
    } else if (repeatMode === "all") {
      playTrackById(activeQueue[0].id);
    }
  }, [activeQueue, currentQueueIndex, currentTrackId, playTrackById, repeatMode, shuffle]);

  useEffect(() => {
    if (!("mediaSession" in navigator) || !currentTrack) return;
    const cover = coverUrls[currentTrack.id];
    navigator.mediaSession.metadata = new MediaMetadata({
      title: currentTrack.title,
      artist: currentTrack.artist,
      album: currentTrack.album || currentTrack.folderName,
      artwork: cover ? [{ src: cover, sizes: "512x512" }] : [],
    });
    navigator.mediaSession.playbackState = isPlaying ? "playing" : "paused";

    navigator.mediaSession.setActionHandler("play", handleTogglePlay);
    navigator.mediaSession.setActionHandler("pause", handleTogglePlay);
    navigator.mediaSession.setActionHandler("previoustrack", handlePrevious);
    navigator.mediaSession.setActionHandler("nexttrack", handleNext);
    navigator.mediaSession.setActionHandler("seekbackward", () =>
      handleSkipRelative(-15)
    );
    navigator.mediaSession.setActionHandler("seekforward", () =>
      handleSkipRelative(30)
    );
  }, [
    coverUrls,
    currentTrack,
    handleNext,
    handlePrevious,
    handleSkipRelative,
    handleTogglePlay,
    isPlaying,
  ]);

  useEffect(() => {
    const pipWin = pipWindowRef.current;
    if (!pipWin || pipWin.closed || !currentTrack) return;
    const doc = pipWin.document;
    const titleEl = doc.getElementById("pip-title");
    const artistEl = doc.getElementById("pip-artist");
    const timeEl = doc.getElementById("pip-time");
    const playBtn = doc.getElementById("pip-play");
    const coverEl = doc.getElementById("pip-cover") as HTMLImageElement | null;
    if (titleEl) titleEl.textContent = currentTrack.title;
    if (artistEl) artistEl.textContent = currentTrack.artist;
    if (timeEl) {
      timeEl.textContent = `${formatTime(currentTime)} / ${formatTime(
        duration || currentTrack.duration
      )}`;
    }
    if (playBtn) playBtn.textContent = isPlaying ? "Pausar" : "Reproducir";
    if (coverEl) {
      const src = coverUrls[currentTrack.id];
      if (src) {
        coverEl.src = src;
        coverEl.style.display = "block";
      } else {
        coverEl.style.display = "none";
      }
    }
  }, [coverUrls, currentTime, currentTrack, duration, isPlaying]);

  const handleOpenPipWindow = async () => {
    const pipApi = (
      window as unknown as { documentPictureInPicture?: DocumentPiPApi }
    ).documentPictureInPicture;
    if (!pipApi) return;
    try {
      const pipWin = await pipApi.requestWindow({ width: 380, height: 185 });
      pipWindowRef.current = pipWin;
      const doc = pipWin.document;
      doc.body.style.cssText =
        "margin:0;padding:16px;background:#0d1016;color:#f4f4f5;font-family:system-ui,sans-serif;display:flex;flex-direction:column;justify-content:space-between;height:100vh;box-sizing:border-box;";
      doc.body.innerHTML = `
        <div style="display:flex;align-items:center;gap:12px;">
          <img id="pip-cover" style="width:52px;height:52px;border-radius:8px;object-fit:cover;background:#27272a;display:none;" />
          <div style="min-width:0;flex:1;">
            <div id="pip-title" style="font-weight:600;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;"></div>
            <div id="pip-artist" style="font-size:12px;color:#a1a1aa;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px;"></div>
            <div id="pip-time" style="font-size:11px;color:#f59e0b;font-family:monospace;margin-top:4px;"></div>
          </div>
        </div>
        <div style="display:flex;align-items:center;justify-content:center;gap:10px;padding-top:10px;">
          <button id="pip-prev" style="padding:6px 10px;border-radius:8px;border:1px solid #27272a;background:#18181b;color:#f4f4f5;cursor:pointer;font-size:12px;">Anterior</button>
          <button id="pip-back" style="padding:6px 10px;border-radius:8px;border:1px solid #27272a;background:#18181b;color:#f4f4f5;cursor:pointer;font-size:12px;">-15s</button>
          <button id="pip-play" style="padding:8px 16px;border-radius:999px;border:none;background:#f59e0b;color:#09090b;font-weight:600;cursor:pointer;font-size:12px;"></button>
          <button id="pip-fwd" style="padding:6px 10px;border-radius:8px;border:1px solid #27272a;background:#18181b;color:#f4f4f5;cursor:pointer;font-size:12px;">+30s</button>
          <button id="pip-next" style="padding:6px 10px;border-radius:8px;border:1px solid #27272a;background:#18181b;color:#f4f4f5;cursor:pointer;font-size:12px;">Siguiente</button>
        </div>
      `;
      doc.getElementById("pip-play")?.addEventListener("click", handleTogglePlay);
      doc.getElementById("pip-prev")?.addEventListener("click", handlePrevious);
      doc.getElementById("pip-next")?.addEventListener("click", handleNext);
      doc
        .getElementById("pip-back")
        ?.addEventListener("click", () => handleSkipRelative(-15));
      doc
        .getElementById("pip-fwd")
        ?.addEventListener("click", () => handleSkipRelative(30));

      if (currentTrack) {
        const titleEl = doc.getElementById("pip-title");
        const artistEl = doc.getElementById("pip-artist");
        const timeEl = doc.getElementById("pip-time");
        const playBtn = doc.getElementById("pip-play");
        const coverEl = doc.getElementById("pip-cover") as HTMLImageElement | null;
        if (titleEl) titleEl.textContent = currentTrack.title;
        if (artistEl) artistEl.textContent = currentTrack.artist;
        if (timeEl) {
          timeEl.textContent = `${formatTime(currentTime)} / ${formatTime(
            duration || currentTrack.duration
          )}`;
        }
        if (playBtn) playBtn.textContent = isPlaying ? "Pausar" : "Reproducir";
        if (coverEl && coverUrls[currentTrack.id]) {
          coverEl.src = coverUrls[currentTrack.id];
          coverEl.style.display = "block";
        }
      }
    } catch {
      // Gracefully stay in the in-app MiniPlayer when iframe blocks popout PiP
    }
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        coverTarget ||
        searchInfoTarget ||
        isTranscribeOpen
      ) {
        return;
      }
      if (e.code === "Escape" && isImmersive) {
        e.preventDefault();
        setIsImmersive(false);
      } else if (e.code === "KeyF" && currentTrackId && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setIsImmersive((v) => !v);
        setIsMiniPlayer(false);
      } else if (e.code === "Space" && currentTrackId) {
        e.preventDefault();
        handleTogglePlay();
      } else if (e.code === "ArrowLeft" && currentTrackId) {
        e.preventDefault();
        handleSkipRelative(-15);
      } else if (e.code === "ArrowRight" && currentTrackId) {
        e.preventDefault();
        handleSkipRelative(30);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    coverTarget,
    currentTrackId,
    handleSkipRelative,
    handleTogglePlay,
    isImmersive,
    isTranscribeOpen,
    searchInfoTarget,
  ]);

  const importAudioEntries = useCallback(
    async (entries: ImportedFileEntry[]) => {
      if (entries.length === 0) return;
      setIsImporting(true);
      try {
        const sorted = [...entries].sort((a, b) =>
          a.file.name.localeCompare(b.file.name, undefined, { numeric: true })
        );
        const addedTracks: AudioTrack[] = [];
        const newCoverMap: Record<string, string> = {};

        for (const { file, folderName } of sorted) {
          const playableForProbe = await convertAiffToWavIfNeeded(
            file,
            file.name
          );
          const [meta, probedDuration] = await Promise.all([
            parseAudioMetadata(file, folderName),
            probeAudioDuration(playableForProbe),
          ]);
          const id = crypto.randomUUID();
          const hasCoverBlob = Boolean(meta.coverBlob);

          const track: AudioTrack = {
            id,
            title: meta.title,
            artist: meta.artist,
            album: meta.album,
            folderName: folderName || "Archivos locales",
            fileName: file.name,
            mimeType: file.type || "audio/mpeg",
            size: file.size,
            duration: probedDuration,
            currentTime: 0,
            completed: false,
            hasCoverBlob,
            addedAt: Date.now(),
            lastPlayedAt: null,
          };

          await saveTrackWithMedia(track, file, meta.coverBlob);
          if (user) {
            void syncTrackToCloud(user.uid, track);
          }
          if (meta.coverBlob) {
            newCoverMap[id] = URL.createObjectURL(meta.coverBlob);
          }
          addedTracks.push(track);
        }

        coverObjectUrlsRef.current = {
          ...coverObjectUrlsRef.current,
          ...newCoverMap,
        };
        setCoverUrls((prev) => ({ ...prev, ...newCoverMap }));
        setTracks((prev) => [...prev, ...addedTracks]);
      } finally {
        setIsImporting(false);
      }
    },
    [user]
  );

  const handleFolderPicked = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;

    const entries: ImportedFileEntry[] = [];
    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      if (!isAudioFile(file)) continue;
      const rel = file.webkitRelativePath || "";
      const parts = rel.split("/").filter(Boolean);
      const folderName =
        parts.length >= 2 ? parts[parts.length - 2] : parts[0] || "Carpeta local";
      entries.push({ file, folderName });
    }
    e.target.value = "";
    await importAudioEntries(entries);
  };

  const handleFilesPicked = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;
    const entries: ImportedFileEntry[] = Array.from(fileList)
      .filter(isAudioFile)
      .map((file) => ({ file, folderName: "Archivos locales" }));
    e.target.value = "";
    await importAudioEntries(entries);
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDraggingFiles(false);
    const entries = await extractFilesFromDataTransfer(e.dataTransfer);
    await importAudioEntries(entries);
  };

  const handleLoadDemo = async () => {
    setIsImporting(true);
    try {
      const demos = await buildDemoEpisodes();
      const created: AudioTrack[] = [];
      const newCovers: Record<string, string> = {};

      for (const demo of demos) {
        let coverBlob: Blob | null = null;
        try {
          const res = await fetch(demo.coverUrl);
          if (res.ok) coverBlob = await res.blob();
        } catch {
          // Fallback silently to icon cover
        }

        const id = crypto.randomUUID();
        const track: AudioTrack = {
          id,
          title: demo.title,
          artist: demo.artist,
          album: demo.album,
          folderName: demo.folderName,
          fileName: demo.fileName,
          mimeType: "audio/wav",
          size: demo.audioBlob.size,
          duration: demo.duration,
          currentTime: demo.initialTime,
          completed: false,
          hasCoverBlob: Boolean(coverBlob),
          addedAt: Date.now(),
          lastPlayedAt: demo.initialTime > 0 ? Date.now() : null,
        };

        await saveTrackWithMedia(track, demo.audioBlob, coverBlob);
        if (user) {
          void syncTrackToCloud(user.uid, track);
        }
        if (coverBlob) {
          newCovers[id] = URL.createObjectURL(coverBlob);
        }
        created.push(track);
      }

      coverObjectUrlsRef.current = {
        ...coverObjectUrlsRef.current,
        ...newCovers,
      };
      setCoverUrls((prev) => ({ ...prev, ...newCovers }));
      setTracks((prev) => [...prev, ...created]);
    } finally {
      setIsImporting(false);
    }
  };

  const handleAddRecordingToLibrary = async (
    blob: Blob,
    title: string,
    durationSec: number
  ) => {
    const id = crypto.randomUUID();
    const track: AudioTrack = {
      id,
      title,
      artist: user?.displayName || "Nota de voz",
      album: "Grabaciones",
      folderName: "Micrófono",
      fileName: `grabacion-${Date.now()}.webm`,
      mimeType: blob.type || "audio/webm",
      size: blob.size,
      duration: durationSec,
      currentTime: 0,
      completed: false,
      hasCoverBlob: false,
      addedAt: Date.now(),
      lastPlayedAt: null,
    };
    await saveTrackWithMedia(track, blob, null);
    if (user) {
      void syncTrackToCloud(user.uid, track);
    }
    setTracks((prev) => [...prev, track]);
  };

  const handleSaveTranscription = async (item: TranscriptionItem) => {
    setTranscriptions((prev) => {
      const next = [item, ...prev];
      localStorage.setItem(LOCAL_TRANSCRIPTIONS_KEY, JSON.stringify(next));
      return next;
    });
    if (user) {
      await saveTranscriptionToCloud(user.uid, item);
    }
  };

  const handleDeleteTranscription = async (id: string) => {
    setTranscriptions((prev) => {
      const next = prev.filter((t) => t.id !== id);
      localStorage.setItem(LOCAL_TRANSCRIPTIONS_KEY, JSON.stringify(next));
      return next;
    });
    if (user) {
      await deleteTranscriptionFromCloud(user.uid, id);
    }
  };

  // Playlist CRUD (Local IndexedDB + Firestore sync)
  const handleCreatePlaylist = async (name: string) => {
    const pl: Playlist = {
      id: crypto.randomUUID(),
      name,
      trackIds: [],
      hasCoverBlob: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await savePlaylist(pl);
    if (user) {
      void syncPlaylistToCloud(user.uid, pl, true);
    }
    setPlaylists((prev) => [...prev, pl]);
    setActiveView({ type: "playlist", playlistId: pl.id });
  };

  const handleRenamePlaylist = async (id: string, name: string) => {
    const existing = playlists.find((p) => p.id === id);
    if (!existing) return;
    const updated = { ...existing, name, updatedAt: Date.now() };
    await savePlaylist(updated);
    if (user) {
      void syncPlaylistToCloud(user.uid, updated, false);
    }
    setPlaylists((prev) => prev.map((p) => (p.id === id ? updated : p)));
  };

  const handleDeletePlaylist = async (id: string) => {
    await deletePlaylistRecord(id);
    if (user) {
      void deletePlaylistFromCloud(user.uid, id);
    }
    setPlaylists((prev) => prev.filter((p) => p.id !== id));
    if (activeView.type === "playlist" && activeView.playlistId === id) {
      setActiveView({ type: "library" });
    }
  };

  const handleToggleTrackInPlaylist = async (
    playlistId: string,
    trackId: string
  ) => {
    const existing = playlists.find((p) => p.id === playlistId);
    if (!existing) return;
    const includes = existing.trackIds.includes(trackId);
    const trackIds = includes
      ? existing.trackIds.filter((id) => id !== trackId)
      : [...existing.trackIds, trackId];
    const updated: Playlist = {
      ...existing,
      trackIds,
      updatedAt: Date.now(),
    };
    await savePlaylist(updated);
    if (user) {
      void syncPlaylistToCloud(user.uid, updated, false);
    }
    setPlaylists((prev) =>
      prev.map((p) => (p.id === playlistId ? updated : p))
    );
  };

  const handleCreatePlaylistWithTrack = async (
    name: string,
    trackId: string
  ) => {
    const pl: Playlist = {
      id: crypto.randomUUID(),
      name,
      trackIds: [trackId],
      hasCoverBlob: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await savePlaylist(pl);
    if (user) {
      void syncPlaylistToCloud(user.uid, pl, true);
    }
    setPlaylists((prev) => [...prev, pl]);
  };

  const handleMoveTrackInPlaylist = async (
    playlistId: string,
    trackId: string,
    direction: "up" | "down"
  ) => {
    const existing = playlists.find((p) => p.id === playlistId);
    if (!existing) return;
    const idx = existing.trackIds.indexOf(trackId);
    if (idx === -1) return;
    const targetIdx = direction === "up" ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= existing.trackIds.length) return;

    const nextIds = [...existing.trackIds];
    const [moved] = nextIds.splice(idx, 1);
    nextIds.splice(targetIdx, 0, moved);

    const updated: Playlist = {
      ...existing,
      trackIds: nextIds,
      updatedAt: Date.now(),
    };
    await savePlaylist(updated);
    if (user) {
      void syncPlaylistToCloud(user.uid, updated, false);
    }
    setPlaylists((prev) =>
      prev.map((p) => (p.id === playlistId ? updated : p))
    );
  };

  const handleResetProgress = async (trackId: string) => {
    const track = tracks.find((t) => t.id === trackId);
    if (!track) return;
    if (currentTrackId === trackId && audioRef.current) {
      audioRef.current.currentTime = 0;
      setCurrentTime(0);
    }
    await updateTrackProgress(trackId, 0, track.duration, false);
    if (user) {
      void updateTrackProgressInCloud(user.uid, track, 0, track.duration, false);
    }
    setTracks((prev) =>
      prev.map((t) =>
        t.id === trackId ? { ...t, currentTime: 0, completed: false } : t
      )
    );
  };

  const handleDeleteTrack = async (trackId: string) => {
    if (currentTrackId === trackId) {
      audioRef.current?.pause();
      setIsPlaying(false);
      setCurrentTrackId(null);
      setCurrentTime(0);
      setDuration(0);
      setIsMiniPlayer(false);
      setIsImmersive(false);
    }
    await deleteTrackRecord(trackId);
    if (user) {
      void deleteTrackFromCloud(user.uid, trackId);
    }
    setTracks((prev) => prev.filter((t) => t.id !== trackId));
    const affected = playlists.filter((p) => p.trackIds.includes(trackId));
    for (const pl of affected) {
      const updated = {
        ...pl,
        trackIds: pl.trackIds.filter((id) => id !== trackId),
        updatedAt: Date.now(),
      };
      await savePlaylist(updated);
      if (user) {
        void syncPlaylistToCloud(user.uid, updated, false);
      }
    }
    if (affected.length > 0) {
      setPlaylists((prev) =>
        prev.map((p) => ({
          ...p,
          trackIds: p.trackIds.filter((id) => id !== trackId),
        }))
      );
    }
  };

  const handleApplyCoverBlob = async (
    target: CoverSearchTarget,
    blob: Blob
  ) => {
    const storageKey =
      target.kind === "track" ? target.id : `playlist:${target.id}`;
    await saveCoverBlob(storageKey, blob);

    const oldUrl = coverObjectUrlsRef.current[storageKey];
    if (oldUrl) URL.revokeObjectURL(oldUrl);
    const nextUrl = URL.createObjectURL(blob);
    coverObjectUrlsRef.current[storageKey] = nextUrl;
    setCoverUrls((prev) => ({ ...prev, [storageKey]: nextUrl }));

    if (target.kind === "track") {
      const track = tracks.find((t) => t.id === target.id);
      if (track) {
        const updated = { ...track, hasCoverBlob: true };
        await saveTrack(updated);
        setTracks((prev) =>
          prev.map((t) => (t.id === target.id ? updated : t))
        );
      }
    } else {
      const pl = playlists.find((p) => p.id === target.id);
      if (pl) {
        const updated = { ...pl, hasCoverBlob: true, updatedAt: Date.now() };
        await savePlaylist(updated);
        setPlaylists((prev) =>
          prev.map((p) => (p.id === target.id ? updated : p))
        );
      }
    }
  };

  const cycleRepeatMode = () => {
    setRepeatMode((prev) =>
      prev === "off" ? "all" : prev === "all" ? "one" : "off"
    );
  };

  const cycleSpeed = () => {
    const idx = SPEEDS.indexOf(playbackRate);
    setPlaybackRate(SPEEDS[(idx + 1) % SPEEDS.length]);
  };

  const viewTitle =
    activeView.type === "library"
      ? "Todos los audios"
      : activeView.type === "in-progress"
      ? "Seguir escuchando"
      : activePlaylist?.name ?? "Lista";

  return (
    <div
      className="h-screen w-screen overflow-hidden flex flex-col bg-zinc-50 dark:bg-[#0B0D11] text-zinc-900 dark:text-zinc-100"
      onDragOver={(e) => {
        e.preventDefault();
        setIsDraggingFiles(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node)) return;
        setIsDraggingFiles(false);
      }}
      onDrop={handleDrop}
    >
      {/* Hidden native inputs for folder and universal audio file selection */}
      <input
        ref={(el) => {
          folderInputRef.current = el;
          if (el) {
            el.setAttribute("webkitdirectory", "");
            el.setAttribute("directory", "");
          }
        }}
        type="file"
        multiple
        onChange={handleFolderPicked}
        className="hidden"
      />
      <input
        ref={filesInputRef}
        type="file"
        multiple
        accept={AUDIO_ACCEPT_STRING}
        onChange={handleFilesPicked}
        className="hidden"
      />

      {/* Hidden HTML5 Audio Engine with Web Audio fallback transcoding */}
      <audio
        ref={audioRef}
        onLoadedMetadata={(e) => {
          const audio = e.currentTarget;
          const dur = Number.isFinite(audio.duration) ? audio.duration : 0;
          setDuration(dur);

          if (currentTrackId && dur > 0) {
            setTracks((prev) =>
              prev.map((t) =>
                t.id === currentTrackId && t.duration === 0
                  ? { ...t, duration: dur }
                  : t
              )
            );
          }

          if (pendingResumeTimeRef.current !== null) {
            const targetTime = Math.min(
              pendingResumeTimeRef.current,
              Math.max(0, dur - 1)
            );
            audio.currentTime = targetTime;
            setCurrentTime(targetTime);
            pendingResumeTimeRef.current = null;
          }

          if (shouldAutoPlayOnLoadRef.current) {
            shouldAutoPlayOnLoadRef.current = false;
            void audio.play();
            setIsPlaying(true);
          }
        }}
        onError={async () => {
          const audio = audioRef.current;
          const blob = activeAudioBlobRef.current;
          if (!audio || !blob || fallbackAttemptedRef.current) {
            setIsPlaying(false);
            setAudioError(
              "Formato no soportado directamente por este navegador."
            );
            return;
          }
          fallbackAttemptedRef.current = true;
          const decodedWav = await transcodeViaWebAudioToWav(blob);
          if (decodedWav && audioRef.current) {
            if (activeAudioObjectUrlRef.current) {
              URL.revokeObjectURL(activeAudioObjectUrlRef.current);
            }
            const nextUrl = URL.createObjectURL(decodedWav);
            activeAudioObjectUrlRef.current = nextUrl;
            audioRef.current.src = nextUrl;
            audioRef.current.load();
          } else {
            setIsPlaying(false);
            setAudioError(
              "Este códec no es compatible con el navegador actual."
            );
          }
        }}
        onTimeUpdate={(e) => {
          const audio = e.currentTarget;
          const t = audio.currentTime;
          const dur = Number.isFinite(audio.duration) ? audio.duration : duration;
          setCurrentTime(t);

          const now = Date.now();
          if (currentTrackId && now - lastSavedTickRef.current >= 1500) {
            lastSavedTickRef.current = now;
            persistProgress(currentTrackId, t, dur, false);
          }
        }}
        onPause={(e) => {
          setIsPlaying(false);
          const audio = e.currentTarget;
          if (currentTrackId && !audio.ended) {
            const dur = Number.isFinite(audio.duration) ? audio.duration : duration;
            persistProgress(currentTrackId, audio.currentTime, dur, false, true);
          }
        }}
        onPlay={() => setIsPlaying(true)}
        onEnded={(e) => {
          const audio = e.currentTarget;
          const dur = Number.isFinite(audio.duration) ? audio.duration : duration;

          if (repeatMode === "one" && currentTrackId) {
            audio.currentTime = 0;
            setCurrentTime(0);
            void audio.play();
            return;
          }

          if (currentTrackId) {
            persistProgress(currentTrackId, 0, dur, true, true);
          }

          if (hasNext) {
            handleNext();
          } else {
            setIsPlaying(false);
          }
        }}
      />

      {/* Main Workspace: Sidebar + Content + Optional Queue Drawer */}
      <div className="flex-1 flex min-h-0 overflow-hidden relative">
        <Sidebar
          activeView={activeView}
          onSelectView={setActiveView}
          totalTracks={tracks.length}
          inProgressCount={inProgressCount}
          playlists={playlists}
          user={user}
          onSignIn={() => void signInWithGoogleAccount()}
          onSignOut={() => void signOutAccount()}
          onCreatePlaylist={handleCreatePlaylist}
          onRenamePlaylist={handleRenamePlaylist}
          onDeletePlaylist={handleDeletePlaylist}
          onPickFolder={() => folderInputRef.current?.click()}
          onPickFiles={() => filesInputRef.current?.click()}
          onOpenTranscribe={() => setIsTranscribeOpen(true)}
          isMobileOpen={isMobileMenuOpen}
          onCloseMobile={() => setIsMobileMenuOpen(false)}
        />

        <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <TopBar
            title={viewTitle}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            theme={theme}
            onToggleTheme={() =>
              setTheme((prev) => (prev === "dark" ? "light" : "dark"))
            }
            onPickFolder={() => folderInputRef.current?.click()}
            onOpenTranscribe={() => setIsTranscribeOpen(true)}
            onOpenMobileMenu={() => setIsMobileMenuOpen(true)}
            user={user}
            onSignIn={() => void signInWithGoogleAccount()}
          />

          <TrackList
            activeView={activeView}
            activePlaylist={activePlaylist}
            tracks={visibleTracks}
            allTrackCount={tracks.length}
            playlists={playlists}
            coverUrls={coverUrls}
            currentTrackId={currentTrackId}
            isPlaying={isPlaying}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            isImporting={isImporting}
            onSelectTrack={playTrackById}
            onToggleTrackPlay={playTrackById}
            onResetProgress={handleResetProgress}
            onDeleteTrack={handleDeleteTrack}
            onToggleTrackInPlaylist={handleToggleTrackInPlaylist}
            onCreatePlaylistWithTrack={handleCreatePlaylistWithTrack}
            onMoveTrackInPlaylist={handleMoveTrackInPlaylist}
            onOpenCoverSearch={setCoverTarget}
            onOpenSearchInfo={setSearchInfoTarget}
            onPickFolder={() => folderInputRef.current?.click()}
            onPickFiles={() => filesInputRef.current?.click()}
            onLoadDemo={handleLoadDemo}
            onPlayPlaylist={(pl) => {
              if (pl.trackIds.length > 0) {
                playTrackById(pl.trackIds[0]);
              }
            }}
          />
        </main>

        <AnimatePresence>
          {isQueueOpen && (
            <QueueDrawer
              isOpen={isQueueOpen}
              onClose={() => setIsQueueOpen(false)}
              queue={activeQueue}
              currentTrackId={currentTrackId}
              isPlaying={isPlaying}
              coverUrls={coverUrls}
              onSelectTrack={playTrackById}
            />
          )}
        </AnimatePresence>

        {/* Drag & Drop Folder Overlay */}
        {isDraggingFiles && (
          <div className="fixed inset-0 z-40 bg-zinc-950/75 backdrop-blur-xs flex items-center justify-center p-6 pointer-events-none">
            <div className="max-w-md w-full rounded-2xl border-2 border-dashed border-amber-500 bg-zinc-900/95 p-8 text-center space-y-3 text-zinc-100">
              <div className="mx-auto w-12 h-12 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center">
                <FolderPlus className="w-6 h-6" />
              </div>
              <h3 className="font-display text-lg font-semibold">
                Suelta la carpeta o tus archivos de audio
              </h3>
              <p className="text-xs text-zinc-400">
                Compatible con MP3, M4A, M4B, FLAC, WAV, OGG, OPUS, AIFF, AAC,
                WMA y más.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Full Spotify/Tidal Player Bar OR Floating Draggable Mini-Player */}
      {!isMiniPlayer && !isImmersive && (
        <PlayerBar
          track={currentTrack}
          coverUrl={currentTrack ? coverUrls[currentTrack.id] ?? null : null}
          isPlaying={isPlaying}
          currentTime={currentTime}
          duration={duration}
          volume={volume}
          muted={muted}
          playbackRate={playbackRate}
          shuffle={shuffle}
          repeatMode={repeatMode}
          isQueueOpen={isQueueOpen}
          hasPrevious={hasPrevious}
          hasNext={hasNext}
          audioError={audioError}
          onTogglePlay={handleTogglePlay}
          onSeek={handleSeek}
          onSkipRelative={handleSkipRelative}
          onPrevious={handlePrevious}
          onNext={handleNext}
          onToggleShuffle={() => setShuffle((s) => !s)}
          onCycleRepeat={cycleRepeatMode}
          onCycleSpeed={cycleSpeed}
          onVolumeChange={(val) => {
            setVolume(val);
            if (val > 0 && muted) setMuted(false);
          }}
          onToggleMute={() => setMuted((m) => !m)}
          onToggleQueue={() => setIsQueueOpen((q) => !q)}
          onOpenMiniPlayer={() => setIsMiniPlayer(true)}
          onOpenImmersive={() => setIsImmersive(true)}
          onOpenSearchInfo={() => {
            if (!currentTrack) return;
            setSearchInfoTarget({
              title: currentTrack.title,
              artist:
                currentTrack.artist !== "Audio local" ? currentTrack.artist : "",
            });
          }}
          onEditCover={() => {
            if (!currentTrack) return;
            setCoverTarget({
              kind: "track",
              id: currentTrack.id,
              initialQuery: currentTrack.title,
              initialAuthor:
                currentTrack.artist !== "Audio local" ? currentTrack.artist : "",
              title: currentTrack.title,
            });
          }}
        />
      )}

      <AnimatePresence>
        {isImmersive && currentTrack && (
          <ImmersivePlayer
            track={currentTrack}
            coverUrl={coverUrls[currentTrack.id] ?? null}
            isPlaying={isPlaying}
            currentTime={currentTime}
            duration={duration}
            volume={volume}
            muted={muted}
            playbackRate={playbackRate}
            shuffle={shuffle}
            repeatMode={repeatMode}
            hasPrevious={hasPrevious}
            hasNext={hasNext}
            onTogglePlay={handleTogglePlay}
            onSeek={handleSeek}
            onSkipRelative={handleSkipRelative}
            onPrevious={handlePrevious}
            onNext={handleNext}
            onToggleShuffle={() => setShuffle((s) => !s)}
            onCycleRepeat={cycleRepeatMode}
            onCycleSpeed={cycleSpeed}
            onVolumeChange={(val) => {
              setVolume(val);
              if (val > 0 && muted) setMuted(false);
            }}
            onToggleMute={() => setMuted((m) => !m)}
            onToggleQueue={() => {
              setIsImmersive(false);
              setIsQueueOpen(true);
            }}
            onSwitchToMini={() => {
              setIsImmersive(false);
              setIsMiniPlayer(true);
            }}
            onOpenSearchInfo={() => {
              setSearchInfoTarget({
                title: currentTrack.title,
                artist:
                  currentTrack.artist !== "Audio local"
                    ? currentTrack.artist
                    : "",
              });
            }}
            onEditCover={() => {
              setCoverTarget({
                kind: "track",
                id: currentTrack.id,
                initialQuery: currentTrack.title,
                initialAuthor:
                  currentTrack.artist !== "Audio local"
                    ? currentTrack.artist
                    : "",
                title: currentTrack.title,
              });
            }}
            onExit={() => setIsImmersive(false)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isMiniPlayer && currentTrack && (
          <MiniPlayer
            track={currentTrack}
            coverUrl={coverUrls[currentTrack.id] ?? null}
            isPlaying={isPlaying}
            currentTime={currentTime}
            duration={duration}
            volume={volume}
            muted={muted}
            playbackRate={playbackRate}
            shuffle={shuffle}
            repeatMode={repeatMode}
            hasPrevious={hasPrevious}
            hasNext={hasNext}
            canPopoutPip={canPopoutPip}
            onTogglePlay={handleTogglePlay}
            onSeek={handleSeek}
            onSkipRelative={handleSkipRelative}
            onPrevious={handlePrevious}
            onNext={handleNext}
            onToggleShuffle={() => setShuffle((s) => !s)}
            onCycleRepeat={cycleRepeatMode}
            onCycleSpeed={cycleSpeed}
            onVolumeChange={(val) => {
              setVolume(val);
              if (val > 0 && muted) setMuted(false);
            }}
            onToggleMute={() => setMuted((m) => !m)}
            onExpand={() => setIsMiniPlayer(false)}
            onOpenPipWindow={handleOpenPipWindow}
            onEditCover={() => {
              setCoverTarget({
                kind: "track",
                id: currentTrack.id,
                initialQuery: currentTrack.title,
                initialAuthor:
                  currentTrack.artist !== "Audio local"
                    ? currentTrack.artist
                    : "",
                title: currentTrack.title,
              });
            }}
          />
        )}
      </AnimatePresence>

      {/* Multi-source Cover Search & Download Modal */}
      <CoverSearchModal
        target={coverTarget}
        onClose={() => setCoverTarget(null)}
        onApplyCoverBlob={handleApplyCoverBlob}
      />

      {/* Grounded Google Search Info Modal */}
      <SearchInfoModal
        target={searchInfoTarget}
        onClose={() => setSearchInfoTarget(null)}
      />

      {/* Microphone Audio Recorder & Gemini 3.5 Transcribe Studio */}
      <TranscribeModal
        isOpen={isTranscribeOpen}
        onClose={() => setIsTranscribeOpen(false)}
        isSignedIn={Boolean(user)}
        savedTranscriptions={transcriptions}
        onSaveTranscription={handleSaveTranscription}
        onDeleteTranscription={handleDeleteTranscription}
        onAddRecordingToLibrary={handleAddRecordingToLibrary}
      />
    </div>
  );
}
