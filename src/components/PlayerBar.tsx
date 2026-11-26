import {
  Globe,
  ListOrdered,
  Maximize2,
  Pause,
  PictureInPicture2,
  Play,
  Repeat,
  Repeat1,
  RotateCcw,
  RotateCw,
  Shuffle,
  SkipBack,
  SkipForward,
  Volume1,
  Volume2,
  VolumeX,
} from "lucide-react";
import { AudioTrack, PlaybackSpeed, RepeatMode } from "../types";
import { formatTime } from "../utils/audioTags";
import { CoverArt } from "./CoverArt";

const SPEEDS: PlaybackSpeed[] = [0.75, 1, 1.25, 1.5, 1.75, 2];

interface PlayerBarProps {
  track: AudioTrack | null;
  coverUrl: string | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  muted: boolean;
  playbackRate: PlaybackSpeed;
  shuffle: boolean;
  repeatMode: RepeatMode;
  isQueueOpen: boolean;
  hasPrevious: boolean;
  hasNext: boolean;
  audioError: string | null;
  onTogglePlay: () => void;
  onSeek: (time: number) => void;
  onSkipRelative: (deltaSeconds: number) => void;
  onPrevious: () => void;
  onNext: () => void;
  onToggleShuffle: () => void;
  onCycleRepeat: () => void;
  onCycleSpeed: () => void;
  onVolumeChange: (val: number) => void;
  onToggleMute: () => void;
  onToggleQueue: () => void;
  onOpenMiniPlayer: () => void;
  onOpenImmersive: () => void;
  onOpenSearchInfo: () => void;
  onEditCover: () => void;
}

export function PlayerBar({
  track,
  coverUrl,
  isPlaying,
  currentTime,
  duration,
  volume,
  muted,
  playbackRate,
  shuffle,
  repeatMode,
  isQueueOpen,
  hasPrevious,
  hasNext,
  audioError,
  onTogglePlay,
  onSeek,
  onSkipRelative,
  onPrevious,
  onNext,
  onToggleShuffle,
  onCycleRepeat,
  onCycleSpeed,
  onVolumeChange,
  onToggleMute,
  onToggleQueue,
  onOpenMiniPlayer,
  onOpenImmersive,
  onOpenSearchInfo,
  onEditCover,
}: PlayerBarProps) {
  const safeDuration = duration > 0 ? duration : track?.duration ?? 0;
  const progressPct =
    safeDuration > 0 ? Math.min(100, (currentTime / safeDuration) * 100) : 0;
  const effectiveVolume = muted ? 0 : volume;
  const volumePct = Math.round(effectiveVolume * 100);

  const VolumeIcon =
    effectiveVolume === 0 ? VolumeX : effectiveVolume < 0.5 ? Volume1 : Volume2;

  const handleVolumeWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const step = e.deltaY < 0 ? 0.05 : -0.05;
    onVolumeChange(Math.max(0, Math.min(1, Number((volume + step).toFixed(2)))));
  };

  if (!track) {
    return (
      <footer className="h-16 px-6 border-t border-zinc-200 dark:border-zinc-800/80 bg-white/95 dark:bg-[#0E1117]/95 flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400 shrink-0">
        <span>
          Selecciona un audio o agrega una carpeta para comenzar a escuchar.
        </span>
        <span className="hidden sm:inline font-mono tabular-nums">
          Compatible con MP3, M4A, M4B, FLAC, WAV, OGG, OPUS, AIFF y más
        </span>
      </footer>
    );
  }

  const extLabel = track.fileName.split(".").pop()?.toUpperCase() || "AUDIO";

  return (
    <footer className="border-t border-zinc-200 dark:border-zinc-800/90 bg-white/95 dark:bg-[#0D1016]/95 backdrop-blur-xl px-4 md:px-6 py-2.5 md:py-3 shrink-0">
      <div className="max-w-[1440px] mx-auto flex flex-col md:flex-row items-center gap-2.5 md:gap-6">
        {/* Left Zone (30%): Now Playing Artwork & Metadata (Spotify / Tidal style) */}
        <div className="w-full md:w-[30%] flex items-center justify-between md:justify-start gap-3.5 min-w-0">
          <div className="flex items-center gap-3.5 min-w-0 flex-1">
            <CoverArt
              src={coverUrl}
              alt={track.title}
              sizeClass="w-12 h-12 md:w-14 md:h-14"
              roundedClass="rounded-lg"
              onEditCover={onEditCover}
              editLabel="Descargar portada desde Google"
            />
            <button
              type="button"
              onClick={onOpenImmersive}
              title="Abrir modo inmersivo"
              className="min-w-0 flex-1 text-left group/title cursor-pointer"
            >
              <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-50 truncate group-hover/title:text-amber-600 dark:group-hover/title:text-amber-400 transition-colors">
                {track.title}
              </div>
              <div className="text-xs text-zinc-500 dark:text-zinc-400 truncate mt-0.5">
                {track.artist}
                <span aria-hidden="true"> · </span>
                <span className="font-mono">{extLabel}</span>
                <span aria-hidden="true"> · </span>
                <span className="font-mono tabular-nums">
                  {formatTime(currentTime)}
                </span>
              </div>
              {audioError && (
                <div className="text-[11px] text-red-500 dark:text-red-400 truncate mt-0.5">
                  {audioError}
                </div>
              )}
            </button>
          </div>

          {/* Mobile quick immersive, mini-player & speed */}
          <div className="flex md:hidden items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={onCycleSpeed}
              className="px-2 py-1 rounded-md text-[11px] font-mono tabular-nums bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 cursor-pointer"
            >
              {playbackRate}x
            </button>
            <button
              type="button"
              onClick={onOpenMiniPlayer}
              aria-label="Abrir mini reproductor"
              className="p-2 rounded-lg text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
            >
              <PictureInPicture2 className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={onOpenImmersive}
              aria-label="Abrir modo inmersivo"
              className="p-2 rounded-lg text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
            >
              <Maximize2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Center Zone (40%): Transport & Full-Width Scrubber */}
        <div className="w-full md:w-[40%] flex flex-col items-center gap-1.5 max-w-2xl">
          <div className="flex items-center gap-1.5 sm:gap-2.5">
            <button
              type="button"
              onClick={onToggleShuffle}
              title={shuffle ? "Desactivar aleatorio" : "Modo aleatorio"}
              aria-label="Modo aleatorio"
              className={`relative p-2 rounded-lg transition-colors cursor-pointer ${
                shuffle
                  ? "text-amber-600 dark:text-amber-400"
                  : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"
              }`}
            >
              <Shuffle className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={onPrevious}
              disabled={!hasPrevious}
              title="Anterior"
              aria-label="Episodio anterior"
              className="p-2 rounded-lg text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800/80 disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
            >
              <SkipBack className="w-4 h-4 fill-current" />
            </button>

            <button
              type="button"
              onClick={() => onSkipRelative(-15)}
              title="Retroceder 15 segundos"
              aria-label="Retroceder 15 segundos"
              className="inline-flex items-center gap-0.5 px-2 py-1.5 rounded-lg text-[11px] font-mono text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800/80 transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>15</span>
            </button>

            <button
              type="button"
              onClick={onTogglePlay}
              title={isPlaying ? "Pausar" : "Reproducir"}
              aria-label={isPlaying ? "Pausar" : "Reproducir"}
              className="w-10 h-10 rounded-full bg-zinc-900 dark:bg-white text-white dark:text-zinc-950 hover:scale-105 active:scale-95 flex items-center justify-center shadow-sm transition-transform duration-150 cursor-pointer"
            >
              {isPlaying ? (
                <Pause className="w-4 h-4 fill-current" />
              ) : (
                <Play className="w-4 h-4 fill-current ml-0.5" />
              )}
            </button>

            <button
              type="button"
              onClick={() => onSkipRelative(30)}
              title="Adelantar 30 segundos"
              aria-label="Adelantar 30 segundos"
              className="inline-flex items-center gap-0.5 px-2 py-1.5 rounded-lg text-[11px] font-mono text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800/80 transition-colors cursor-pointer"
            >
              <span>30</span>
              <RotateCw className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={onNext}
              disabled={!hasNext}
              title="Siguiente"
              aria-label="Episodio siguiente"
              className="p-2 rounded-lg text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800/80 disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
            >
              <SkipForward className="w-4 h-4 fill-current" />
            </button>

            <button
              type="button"
              onClick={onCycleRepeat}
              title={
                repeatMode === "off"
                  ? "Repetir desactivado"
                  : repeatMode === "all"
                  ? "Repetir lista"
                  : "Repetir este audio"
              }
              aria-label="Cambiar modo de repetición"
              className={`relative p-2 rounded-lg transition-colors cursor-pointer ${
                repeatMode !== "off"
                  ? "text-amber-600 dark:text-amber-400"
                  : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"
              }`}
            >
              {repeatMode === "one" ? (
                <Repeat1 className="w-4 h-4" />
              ) : (
                <Repeat className="w-4 h-4" />
              )}
            </button>
          </div>

          <div className="w-full flex items-center gap-2.5">
            <span className="font-mono tabular-nums text-[11px] text-zinc-500 dark:text-zinc-400 w-11 text-right shrink-0">
              {formatTime(currentTime)}
            </span>
            <input
              type="range"
              min={0}
              max={safeDuration || 1}
              step={0.5}
              value={Math.min(currentTime, safeDuration || 1)}
              onChange={(e) => onSeek(Number(e.target.value))}
              aria-label="Progreso de reproducción"
              style={{
                background: `linear-gradient(to right, #f59e0b ${progressPct}%, rgba(161, 161, 170, 0.25) ${progressPct}%)`,
              }}
              className="audio-range flex-1 h-1 rounded-full"
            />
            <span className="font-mono tabular-nums text-[11px] text-zinc-500 dark:text-zinc-400 w-11 shrink-0">
              {formatTime(safeDuration)}
            </span>
          </div>
        </div>

        {/* Right Zone (30%): Speed, Queue, Mini-Player & Tidal/Spotify Volume */}
        <div className="hidden md:flex items-center justify-end gap-2 lg:gap-2.5 w-[30%] shrink-0">
          <button
            type="button"
            onClick={onCycleSpeed}
            title={`Velocidad: ${playbackRate}x`}
            className="px-2 py-1.5 rounded-md text-xs font-mono tabular-nums font-medium text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-zinc-50 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            {playbackRate}x
          </button>

          <button
            type="button"
            onClick={onOpenSearchInfo}
            title="Buscar información en Google"
            aria-label="Buscar información en Google"
            className="p-2 rounded-lg text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            <Globe className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={onToggleQueue}
            title="Cola de reproducción"
            aria-label="Cola de reproducción"
            className={`p-2 rounded-lg transition-colors cursor-pointer ${
              isQueueOpen
                ? "text-amber-600 dark:text-amber-400 bg-amber-500/10"
                : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            }`}
          >
            <ListOrdered className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={onOpenMiniPlayer}
            title="Activar mini reproductor"
            aria-label="Activar mini reproductor"
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-zinc-50 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors whitespace-nowrap cursor-pointer"
          >
            <PictureInPicture2 className="w-4 h-4" />
            <span className="hidden xl:inline">Mini</span>
          </button>

          <button
            type="button"
            onClick={onOpenImmersive}
            title="Modo inmersivo (solo portada y reproductor)"
            aria-label="Modo inmersivo"
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-zinc-50 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors whitespace-nowrap cursor-pointer"
          >
            <Maximize2 className="w-4 h-4" />
          </button>

          {/* Spotify / Tidal Volume Control with Wheel & Level Readout */}
          <div
            onWheel={handleVolumeWheel}
            className="group/vol flex items-center gap-1.5 pl-1"
            title={`Volumen: ${volumePct}% (usa la rueda del ratón para ajustar)`}
          >
            <button
              type="button"
              onClick={onToggleMute}
              aria-label={muted ? "Activar sonido" : "Silenciar"}
              className="p-1.5 rounded-md text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-zinc-50 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
            >
              <VolumeIcon className="w-4 h-4" />
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={effectiveVolume}
              onChange={(e) => onVolumeChange(Number(e.target.value))}
              aria-label="Volumen"
              style={{
                background: `linear-gradient(to right, #f59e0b ${volumePct}%, rgba(161, 161, 170, 0.28) ${volumePct}%)`,
              }}
              className="audio-range w-20 lg:w-24 h-1 rounded-full"
            />
            <span className="hidden xl:inline-block w-8 text-right font-mono tabular-nums text-[11px] text-zinc-400 dark:text-zinc-500 group-hover/vol:text-zinc-700 dark:group-hover/vol:text-zinc-300 transition-colors">
              {volumePct}%
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}

export { SPEEDS };
