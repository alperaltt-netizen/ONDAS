import { motion } from "motion/react";
import {
  ExternalLink,
  GripHorizontal,
  Maximize2,
  Pause,
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

interface MiniPlayerProps {
  track: AudioTrack;
  coverUrl: string | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  muted: boolean;
  playbackRate: PlaybackSpeed;
  shuffle: boolean;
  repeatMode: RepeatMode;
  hasPrevious: boolean;
  hasNext: boolean;
  canPopoutPip: boolean;
  onTogglePlay: () => void;
  onSeek: (time: number) => void;
  onSkipRelative: (delta: number) => void;
  onPrevious: () => void;
  onNext: () => void;
  onToggleShuffle: () => void;
  onCycleRepeat: () => void;
  onCycleSpeed: () => void;
  onVolumeChange: (val: number) => void;
  onToggleMute: () => void;
  onExpand: () => void;
  onOpenPipWindow: () => void;
  onEditCover: () => void;
}

export function MiniPlayer({
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
  hasPrevious,
  hasNext,
  canPopoutPip,
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
  onExpand,
  onOpenPipWindow,
  onEditCover,
}: MiniPlayerProps) {
  const safeDuration = duration > 0 ? duration : track.duration ?? 0;
  const progressPct =
    safeDuration > 0 ? Math.min(100, (currentTime / safeDuration) * 100) : 0;
  const effectiveVolume = muted ? 0 : volume;
  const volumePct = Math.round(effectiveVolume * 100);
  const VolumeIcon =
    effectiveVolume === 0 ? VolumeX : effectiveVolume < 0.5 ? Volume1 : Volume2;

  return (
    <motion.div
      drag
      dragMomentum={false}
      initial={{ opacity: 0, scale: 0.94, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.94, y: 20 }}
      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
      className="fixed bottom-5 right-5 z-40 w-[336px] sm:w-[368px] rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white/95 dark:bg-[#131720]/95 backdrop-blur-xl shadow-2xl overflow-hidden"
    >
      {/* Top Drag Handle & Window Actions */}
      <div className="px-3.5 py-2 border-b border-zinc-200/80 dark:border-zinc-800/80 flex items-center justify-between cursor-grab active:cursor-grabbing select-none">
        <div className="flex items-center gap-1.5 text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
          <GripHorizontal className="w-3.5 h-3.5" />
          <span>Mini reproductor</span>
        </div>

        <div className="flex items-center gap-1">
          {canPopoutPip && (
            <button
              type="button"
              onClick={onOpenPipWindow}
              title="Abrir en ventana flotante del sistema"
              aria-label="Abrir en ventana flotante del sistema"
              className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={onExpand}
            title="Volver al reproductor completo"
            aria-label="Expandir reproductor completo"
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-zinc-50 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            <Maximize2 className="w-3.5 h-3.5" />
            <span>Expandir</span>
          </button>
        </div>
      </div>

      {/* Main Compact Body */}
      <div className="p-4 space-y-3.5">
        <div className="flex items-center gap-3.5">
          <CoverArt
            src={coverUrl}
            alt={track.title}
            sizeClass="w-14 h-14"
            roundedClass="rounded-xl"
            onEditCover={onEditCover}
            editLabel="Descargar portada desde Google"
          />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-50 truncate">
              {track.title}
            </div>
            <div className="text-xs text-zinc-500 dark:text-zinc-400 truncate mt-0.5">
              {track.artist}
            </div>
            <div className="font-mono tabular-nums text-[11px] text-amber-600 dark:text-amber-400 mt-1">
              {formatTime(currentTime)} / {formatTime(safeDuration)}
            </div>
          </div>
        </div>

        {/* Scrubber */}
        <input
          type="range"
          min={0}
          max={safeDuration || 1}
          step={0.5}
          value={Math.min(currentTime, safeDuration || 1)}
          onChange={(e) => onSeek(Number(e.target.value))}
          aria-label="Progreso en mini reproductor"
          style={{
            background: `linear-gradient(to right, #f59e0b ${progressPct}%, rgba(161, 161, 170, 0.25) ${progressPct}%)`,
          }}
          className="audio-range w-full h-1 rounded-full"
        />

        {/* Transport Controls */}
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={onToggleShuffle}
            aria-label="Aleatorio"
            className={`p-1.5 rounded-md transition-colors cursor-pointer ${
              shuffle
                ? "text-amber-600 dark:text-amber-400"
                : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"
            }`}
          >
            <Shuffle className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={onPrevious}
            disabled={!hasPrevious}
            aria-label="Anterior"
            className="p-1.5 rounded-md text-zinc-700 dark:text-zinc-200 disabled:opacity-30 cursor-pointer"
          >
            <SkipBack className="w-4 h-4 fill-current" />
          </button>

          <button
            type="button"
            onClick={() => onSkipRelative(-15)}
            aria-label="Retroceder 15 segundos"
            className="px-1.5 py-1 rounded-md text-[11px] font-mono text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
          >
            -15
          </button>

          <button
            type="button"
            onClick={onTogglePlay}
            aria-label={isPlaying ? "Pausar" : "Reproducir"}
            className="w-10 h-10 rounded-full bg-zinc-900 dark:bg-white text-white dark:text-zinc-950 flex items-center justify-center shadow-sm hover:scale-105 active:scale-95 transition-transform cursor-pointer"
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
            aria-label="Adelantar 30 segundos"
            className="px-1.5 py-1 rounded-md text-[11px] font-mono text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
          >
            +30
          </button>

          <button
            type="button"
            onClick={onNext}
            disabled={!hasNext}
            aria-label="Siguiente"
            className="p-1.5 rounded-md text-zinc-700 dark:text-zinc-200 disabled:opacity-30 cursor-pointer"
          >
            <SkipForward className="w-4 h-4 fill-current" />
          </button>

          <button
            type="button"
            onClick={onCycleRepeat}
            aria-label="Repetir"
            className={`p-1.5 rounded-md transition-colors cursor-pointer ${
              repeatMode !== "off"
                ? "text-amber-600 dark:text-amber-400"
                : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"
            }`}
          >
            {repeatMode === "one" ? (
              <Repeat1 className="w-3.5 h-3.5" />
            ) : (
              <Repeat className="w-3.5 h-3.5" />
            )}
          </button>
        </div>

        {/* Bottom Speed + Volume Bar */}
        <div
          onWheel={(e) => {
            e.preventDefault();
            const step = e.deltaY < 0 ? 0.05 : -0.05;
            onVolumeChange(
              Math.max(0, Math.min(1, Number((volume + step).toFixed(2))))
            );
          }}
          className="pt-2 border-t border-zinc-200/80 dark:border-zinc-800/80 flex items-center justify-between gap-3"
        >
          <button
            type="button"
            onClick={onCycleSpeed}
            className="px-2 py-1 rounded-md text-[11px] font-mono tabular-nums bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200 cursor-pointer"
          >
            {playbackRate}x
          </button>

          <div className="flex items-center gap-2 flex-1">
            <button
              type="button"
              onClick={onToggleMute}
              aria-label={muted ? "Activar sonido" : "Silenciar"}
              className="p-1 text-zinc-600 dark:text-zinc-300 cursor-pointer"
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
              aria-label="Volumen en mini reproductor"
              style={{
                background: `linear-gradient(to right, #f59e0b ${volumePct}%, rgba(161, 161, 170, 0.25) ${volumePct}%)`,
              }}
              className="audio-range flex-1 h-1 rounded-full"
            />
            <span className="font-mono tabular-nums text-[11px] text-zinc-500 dark:text-zinc-400 w-8 text-right">
              {volumePct}%
            </span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
