import { useEffect, useRef } from "react";
import { motion } from "motion/react";
import {
  Disc3,
  Globe,
  ImagePlus,
  ListOrdered,
  Minimize2,
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

interface ImmersivePlayerProps {
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
  onToggleQueue: () => void;
  onSwitchToMini: () => void;
  onOpenSearchInfo: () => void;
  onEditCover: () => void;
  onExit: () => void;
}

export function ImmersivePlayer({
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
  onSwitchToMini,
  onOpenSearchInfo,
  onEditCover,
  onExit,
}: ImmersivePlayerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const safeDuration = duration > 0 ? duration : track.duration ?? 0;
  const progressPct =
    safeDuration > 0 ? Math.min(100, (currentTime / safeDuration) * 100) : 0;
  const effectiveVolume = muted ? 0 : volume;
  const volumePct = Math.round(effectiveVolume * 100);
  const VolumeIcon =
    effectiveVolume === 0 ? VolumeX : effectiveVolume < 0.5 ? Volume1 : Volume2;

  const extLabel = track.fileName.split(".").pop()?.toUpperCase() || "AUDIO";

  // Subtle acoustic spectrum wave canvas (respects prefers-reduced-motion)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const prefersReduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    let rafId = 0;
    let phase = 0;

    const draw = () => {
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      const bars = 48;
      const gap = w / bars;
      const barWidth = Math.max(2, gap * 0.48);

      for (let i = 0; i < bars; i++) {
        const norm = i / bars;
        const centerWeight = Math.sin(norm * Math.PI);
        const wave = isPlaying && !prefersReduced
          ? Math.sin(phase * 1.4 + i * 0.38) * 0.4 +
            Math.cos(phase * 0.9 - i * 0.22) * 0.35 +
            0.5
          : 0.22;
        const amp = Math.max(0.12, Math.min(1, wave * (0.45 + 0.55 * centerWeight)));
        const barH = amp * (h * 0.85);
        const x = i * gap + (gap - barWidth) / 2;
        const y = (h - barH) / 2;

        ctx.fillStyle = isPlaying
          ? `rgba(245, 158, 11, ${0.28 + amp * 0.45})`
          : "rgba(255, 255, 255, 0.14)";
        ctx.beginPath();
        ctx.roundRect(x, y, barWidth, barH, 999);
        ctx.fill();
      }

      if (isPlaying && !prefersReduced) {
        phase += 0.045 * playbackRate;
        rafId = requestAnimationFrame(draw);
      }
    };

    draw();
    return () => cancelAnimationFrame(rafId);
  }, [isPlaying, playbackRate]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
      className="fixed inset-0 z-40 flex flex-col justify-between bg-[#090B10] text-zinc-100 overflow-hidden select-none"
    >
      {/* Adaptive Blurred Cover Backdrop + Measured Contrast Scrim */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {coverUrl ? (
          <img
            src={coverUrl}
            alt=""
            aria-hidden="true"
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover scale-125 blur-3xl opacity-45 transition-opacity duration-500"
          />
        ) : (
          <div className="w-full h-full bg-radial from-amber-900/20 via-[#0B0E14] to-[#06070A]" />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-[#090B10]/65 to-[#07090D]/95" />
      </div>

      {/* Minimal Top Bar */}
      <header className="relative z-10 px-5 sm:px-8 h-16 flex items-center justify-between gap-4 opacity-85 hover:opacity-100 transition-opacity shrink-0">
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-wider text-zinc-400 font-medium">
            Modo inmersivo
          </div>
          <div className="text-xs text-zinc-300 truncate">
            {track.folderName}
            {track.album && track.album !== track.folderName
              ? ` · ${track.album}`
              : ""}
          </div>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <button
            type="button"
            onClick={onOpenSearchInfo}
            title="Información en Google Search"
            aria-label="Información en Google Search"
            className="p-2 rounded-lg text-zinc-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <Globe className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={onEditCover}
            title="Buscar o cambiar portada"
            aria-label="Buscar o cambiar portada"
            className="p-2 rounded-lg text-zinc-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <ImagePlus className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={onToggleQueue}
            title="Cola de reproducción"
            aria-label="Cola de reproducción"
            className="p-2 rounded-lg text-zinc-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <ListOrdered className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={onSwitchToMini}
            title="Cambiar a Mini Reproductor"
            aria-label="Cambiar a Mini Reproductor"
            className="p-2 rounded-lg text-zinc-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <PictureInPicture2 className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={onExit}
            title="Salir del modo inmersivo (Esc)"
            aria-label="Salir del modo inmersivo"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white/10 hover:bg-white/20 text-white transition-colors whitespace-nowrap cursor-pointer"
          >
            <Minimize2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Salir</span>
          </button>
        </div>
      </header>

      {/* Center Stage: Large Cover Artwork + Title + Acoustic Wave */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 py-2 min-h-0">
        <motion.div
          animate={{ scale: isPlaying ? 1.02 : 0.98 }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          className="relative group w-56 h-56 sm:w-72 sm:h-72 md:w-80 md:h-80 lg:w-[340px] lg:h-[340px] rounded-2xl overflow-hidden shadow-[0_28px_70px_-15px_rgba(0,0,0,0.85)] border border-white/12 bg-zinc-900 shrink-0"
        >
          {coverUrl ? (
            <img
              src={coverUrl}
              alt={track.title}
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center gap-3 bg-gradient-to-br from-zinc-800 to-zinc-950 text-zinc-500">
              <Disc3 className="w-16 h-16 opacity-60" />
              <span className="text-xs text-zinc-400">Sin portada</span>
            </div>
          )}

          <button
            type="button"
            onClick={onEditCover}
            className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/60 text-white opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity duration-150 cursor-pointer"
          >
            <ImagePlus className="w-6 h-6" />
            <span className="text-xs font-medium">
              Buscar portada (Google, Amazon...)
            </span>
          </button>
        </motion.div>

        <div className="mt-6 max-w-xl w-full text-center space-y-1.5">
          <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-white text-balance truncate">
            {track.title}
          </h2>
          <p className="text-sm text-zinc-300 truncate">
            {track.artist}
            <span aria-hidden="true"> · </span>
            <span className="font-mono text-xs text-zinc-400">{extLabel}</span>
          </p>
        </div>

        {/* Acoustic Visualizer Strip */}
        <canvas
          ref={canvasRef}
          width={360}
          height={32}
          className="mt-4 w-64 sm:w-80 h-8 opacity-90 pointer-events-none"
        />
      </div>

      {/* Bottom Immersive Player Console */}
      <div className="relative z-10 w-full max-w-3xl mx-auto px-6 pb-6 sm:pb-8 pt-2 space-y-4 shrink-0">
        {/* Scrubber */}
        <div className="space-y-1.5">
          <input
            type="range"
            min={0}
            max={safeDuration || 1}
            step={0.5}
            value={Math.min(currentTime, safeDuration || 1)}
            onChange={(e) => onSeek(Number(e.target.value))}
            aria-label="Progreso en modo inmersivo"
            style={{
              background: `linear-gradient(to right, #f59e0b ${progressPct}%, rgba(255, 255, 255, 0.2) ${progressPct}%)`,
            }}
            className="audio-range w-full h-1.5 rounded-full"
          />
          <div className="flex items-center justify-between font-mono tabular-nums text-xs text-zinc-400">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(safeDuration)}</span>
          </div>
        </div>

        {/* Primary Transport */}
        <div className="flex items-center justify-center gap-3 sm:gap-5">
          <button
            type="button"
            onClick={onToggleShuffle}
            aria-label="Aleatorio"
            className={`p-2.5 rounded-full transition-colors cursor-pointer ${
              shuffle
                ? "text-amber-400 bg-amber-400/10"
                : "text-zinc-400 hover:text-white hover:bg-white/10"
            }`}
          >
            <Shuffle className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={onPrevious}
            disabled={!hasPrevious}
            aria-label="Episodio anterior"
            className="p-2.5 rounded-full text-zinc-200 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
          >
            <SkipBack className="w-5 h-5 fill-current" />
          </button>

          <button
            type="button"
            onClick={() => onSkipRelative(-15)}
            aria-label="Retroceder 15 segundos"
            className="inline-flex items-center gap-1 px-2.5 py-2 rounded-lg text-xs font-mono text-zinc-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" />
            <span>15</span>
          </button>

          <button
            type="button"
            onClick={onTogglePlay}
            aria-label={isPlaying ? "Pausar" : "Reproducir"}
            className="w-14 h-14 rounded-full bg-white text-zinc-950 hover:scale-105 active:scale-95 flex items-center justify-center shadow-lg transition-transform duration-150 cursor-pointer"
          >
            {isPlaying ? (
              <Pause className="w-6 h-6 fill-current" />
            ) : (
              <Play className="w-6 h-6 fill-current ml-0.5" />
            )}
          </button>

          <button
            type="button"
            onClick={() => onSkipRelative(30)}
            aria-label="Adelantar 30 segundos"
            className="inline-flex items-center gap-1 px-2.5 py-2 rounded-lg text-xs font-mono text-zinc-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <span>30</span>
            <RotateCw className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={onNext}
            disabled={!hasNext}
            aria-label="Episodio siguiente"
            className="p-2.5 rounded-full text-zinc-200 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
          >
            <SkipForward className="w-5 h-5 fill-current" />
          </button>

          <button
            type="button"
            onClick={onCycleRepeat}
            aria-label="Modo repetición"
            className={`p-2.5 rounded-full transition-colors cursor-pointer ${
              repeatMode !== "off"
                ? "text-amber-400 bg-amber-400/10"
                : "text-zinc-400 hover:text-white hover:bg-white/10"
            }`}
          >
            {repeatMode === "one" ? (
              <Repeat1 className="w-4 h-4" />
            ) : (
              <Repeat className="w-4 h-4" />
            )}
          </button>
        </div>

        {/* Speed & Volume Strip */}
        <div
          onWheel={(e) => {
            e.preventDefault();
            const step = e.deltaY < 0 ? 0.05 : -0.05;
            onVolumeChange(
              Math.max(0, Math.min(1, Number((volume + step).toFixed(2))))
            );
          }}
          className="flex items-center justify-between gap-4 pt-1"
        >
          <button
            type="button"
            onClick={onCycleSpeed}
            className="px-3 py-1.5 rounded-lg text-xs font-mono tabular-nums font-medium bg-white/10 hover:bg-white/15 text-zinc-200 transition-colors cursor-pointer"
          >
            Velocidad {playbackRate}x
          </button>

          <div className="flex items-center gap-2.5 w-44 sm:w-52">
            <button
              type="button"
              onClick={onToggleMute}
              aria-label={muted ? "Activar sonido" : "Silenciar"}
              className="p-1.5 rounded-md text-zinc-300 hover:text-white cursor-pointer"
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
              aria-label="Volumen en modo inmersivo"
              style={{
                background: `linear-gradient(to right, #f59e0b ${volumePct}%, rgba(255, 255, 255, 0.22) ${volumePct}%)`,
              }}
              className="audio-range flex-1 h-1 rounded-full"
            />
            <span className="font-mono tabular-nums text-xs text-zinc-400 w-9 text-right">
              {volumePct}%
            </span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
