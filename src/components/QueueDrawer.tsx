import { motion } from "motion/react";
import { Pause, Play, X } from "lucide-react";
import { AudioTrack } from "../types";
import { formatTime } from "../utils/audioTags";
import { CoverArt } from "./CoverArt";

interface QueueDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  queue: AudioTrack[];
  currentTrackId: string | null;
  isPlaying: boolean;
  coverUrls: Record<string, string>;
  onSelectTrack: (trackId: string) => void;
}

export function QueueDrawer({
  isOpen,
  onClose,
  queue,
  currentTrackId,
  isPlaying,
  coverUrls,
  onSelectTrack,
}: QueueDrawerProps) {
  if (!isOpen) return null;

  const currentIdx = queue.findIndex((t) => t.id === currentTrackId);
  const current = currentIdx >= 0 ? queue[currentIdx] : null;
  const upcoming = currentIdx >= 0 ? queue.slice(currentIdx + 1) : queue;

  return (
    <motion.aside
      initial={{ x: 24, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 24, opacity: 0 }}
      transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
      className="w-80 border-l border-zinc-200 dark:border-zinc-800/80 bg-zinc-50/95 dark:bg-[#101319]/95 flex flex-col shrink-0 h-full overflow-hidden"
    >
      <div className="px-4 h-16 border-b border-zinc-200 dark:border-zinc-800/80 flex items-center justify-between shrink-0">
        <h2 className="font-display text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          Cola de reproducción
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar cola"
          className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-200/60 dark:hover:bg-zinc-800 cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {current && (
          <div className="space-y-2">
            <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
              Reproduciendo ahora
            </div>
            <button
              type="button"
              onClick={() => onSelectTrack(current.id)}
              className="w-full flex items-center gap-3 p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/25 text-left cursor-pointer"
            >
              <CoverArt
                src={coverUrls[current.id]}
                alt={current.title}
                sizeClass="w-10 h-10"
              />
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold text-amber-700 dark:text-amber-400 truncate">
                  {current.title}
                </div>
                <div className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
                  {current.artist}
                </div>
              </div>
              {isPlaying ? (
                <Pause className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
              ) : (
                <Play className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
              )}
            </button>
          </div>
        )}

        <div className="space-y-2">
          <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
            A continuación ({upcoming.length})
          </div>
          {upcoming.length === 0 ? (
            <p className="text-xs text-zinc-500 dark:text-zinc-500 py-4">
              No hay más audios después del actual.
            </p>
          ) : (
            <div className="space-y-1">
              {upcoming.map((track) => (
                <button
                  key={track.id}
                  type="button"
                  onClick={() => onSelectTrack(track.id)}
                  className="w-full flex items-center gap-2.5 p-2 rounded-lg hover:bg-zinc-200/60 dark:hover:bg-zinc-800/60 text-left transition-colors cursor-pointer"
                >
                  <CoverArt
                    src={coverUrls[track.id]}
                    alt={track.title}
                    sizeClass="w-9 h-9"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-medium text-zinc-900 dark:text-zinc-100 truncate">
                      {track.title}
                    </div>
                    <div className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
                      {track.artist} ·{" "}
                      <span className="font-mono tabular-nums">
                        {formatTime(track.duration)}
                      </span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </motion.aside>
  );
}
