import { useEffect, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Check,
  FileAudio,
  FolderPlus,
  Globe,
  ImagePlus,
  ListPlus,
  Pause,
  Play,
  RotateCcw,
  Search,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import {
  ActiveView,
  AudioTrack,
  CoverSearchTarget,
  Playlist,
  SearchInfoTarget,
} from "../types";
import { formatTime, formatTotalDuration } from "../utils/audioTags";
import { CoverArt } from "./CoverArt";

interface TrackListProps {
  activeView: ActiveView;
  activePlaylist: Playlist | null;
  tracks: AudioTrack[];
  allTrackCount: number;
  playlists: Playlist[];
  coverUrls: Record<string, string>;
  currentTrackId: string | null;
  isPlaying: boolean;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  isImporting: boolean;
  onSelectTrack: (trackId: string) => void;
  onToggleTrackPlay: (trackId: string) => void;
  onResetProgress: (trackId: string) => void;
  onDeleteTrack: (trackId: string) => void;
  onToggleTrackInPlaylist: (playlistId: string, trackId: string) => void;
  onCreatePlaylistWithTrack: (name: string, trackId: string) => void;
  onMoveTrackInPlaylist: (
    playlistId: string,
    trackId: string,
    direction: "up" | "down"
  ) => void;
  onOpenCoverSearch: (target: CoverSearchTarget) => void;
  onOpenSearchInfo: (target: SearchInfoTarget) => void;
  onPickFolder: () => void;
  onPickFiles: () => void;
  onLoadDemo: () => void;
  onPlayPlaylist: (playlist: Playlist) => void;
}

export function TrackList({
  activeView,
  activePlaylist,
  tracks,
  allTrackCount,
  playlists,
  coverUrls,
  currentTrackId,
  isPlaying,
  searchQuery,
  onSearchChange,
  isImporting,
  onSelectTrack,
  onToggleTrackPlay,
  onResetProgress,
  onDeleteTrack,
  onToggleTrackInPlaylist,
  onCreatePlaylistWithTrack,
  onMoveTrackInPlaylist,
  onOpenCoverSearch,
  onOpenSearchInfo,
  onPickFolder,
  onPickFiles,
  onLoadDemo,
  onPlayPlaylist,
}: TrackListProps) {
  const [openMenuTrackId, setOpenMenuTrackId] = useState<string | null>(null);
  const [quickListName, setQuickListName] = useState("");

  useEffect(() => {
    if (!openMenuTrackId) return;
    const handleOutside = () => setOpenMenuTrackId(null);
    window.addEventListener("click", handleOutside);
    return () => window.removeEventListener("click", handleOutside);
  }, [openMenuTrackId]);

  const totalDuration = tracks.reduce((sum, t) => sum + (t.duration || 0), 0);

  return (
    <div className="flex-1 overflow-y-auto px-4 md:px-8 py-6">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Mobile search */}
        <div className="sm:hidden relative">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Buscar episodio, artista o carpeta..."
            className="w-full pl-9 pr-8 py-2 text-sm rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-amber-500/40"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => onSearchChange("")}
              aria-label="Limpiar búsqueda"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Playlist Hero Header */}
        {activeView.type === "playlist" && activePlaylist && (
          <div className="flex flex-col sm:flex-row sm:items-center gap-5 pb-6 border-b border-zinc-200 dark:border-zinc-800/80">
            <CoverArt
              src={coverUrls[`playlist:${activePlaylist.id}`]}
              alt={activePlaylist.name}
              sizeClass="w-24 h-24 sm:w-28 sm:h-28"
              roundedClass="rounded-xl"
              onEditCover={() =>
                onOpenCoverSearch({
                  kind: "playlist",
                  id: activePlaylist.id,
                  initialQuery: activePlaylist.name,
                  title: activePlaylist.name,
                })
              }
              editLabel="Descargar portada para la lista desde Google"
            />
            <div className="flex-1 min-w-0 space-y-2">
              <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                Lista de reproducción personalizada
              </div>
              <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 truncate">
                {activePlaylist.name}
              </h2>
              <div className="text-xs text-zinc-500 dark:text-zinc-400 font-mono tabular-nums">
                {tracks.length} {tracks.length === 1 ? "audio" : "audios"}
                <span aria-hidden="true"> · </span>
                {formatTotalDuration(totalDuration)}
              </div>
              <div className="pt-1 flex flex-wrap items-center gap-2.5">
                {tracks.length > 0 && (
                  <button
                    type="button"
                    onClick={() => onPlayPlaylist(activePlaylist)}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium bg-amber-600 hover:bg-amber-500 text-white transition-colors whitespace-nowrap cursor-pointer"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>Reproducir lista</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() =>
                    onOpenCoverSearch({
                      kind: "playlist",
                      id: activePlaylist.id,
                      initialQuery: activePlaylist.name,
                      title: activePlaylist.name,
                    })
                  }
                  className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-medium bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors whitespace-nowrap cursor-pointer"
                >
                  <ImagePlus className="w-3.5 h-3.5" />
                  <span>Portada desde Google</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Importing banner */}
        {isImporting && (
          <div className="px-4 py-3 rounded-lg border border-amber-500/30 bg-amber-500/10 text-xs text-amber-800 dark:text-amber-300">
            Importando archivos de audio y extrayendo metadatos...
          </div>
        )}

        {/* Empty State */}
        {tracks.length === 0 ? (
          <div className="py-16 px-6 rounded-xl border border-dashed border-zinc-300 dark:border-zinc-800 bg-white/60 dark:bg-zinc-900/30 text-center space-y-5">
            <div className="mx-auto w-12 h-12 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-amber-600 dark:text-amber-400">
              <FolderPlus className="w-6 h-6" />
            </div>
            <div className="max-w-md mx-auto space-y-1.5">
              <h2 className="font-display text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                {allTrackCount === 0
                  ? "Tu biblioteca de audio está vacía"
                  : activeView.type === "in-progress"
                  ? "No tienes audios pendientes a medias"
                  : activeView.type === "playlist"
                  ? "Esta lista todavía no tiene audios"
                  : "Sin resultados para tu búsqueda"}
              </h2>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed">
                {allTrackCount === 0
                  ? "Agrega una carpeta completa o arrastra tus audios y podcasts (MP3, M4A, M4B, FLAC, WAV, OGG, OPUS, AIFF, AAC, WMA, WebM y más)."
                  : activeView.type === "playlist"
                  ? "Ve a Todos los audios y usa el botón de lista en cualquier episodio para agregarlo aquí."
                  : "Prueba con otra palabra clave o limpia el filtro de búsqueda."}
              </p>
            </div>

            {allTrackCount === 0 && (
              <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
                <button
                  type="button"
                  onClick={onPickFolder}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-amber-600 hover:bg-amber-500 text-white transition-colors cursor-pointer"
                >
                  <FolderPlus className="w-4 h-4" />
                  <span>Seleccionar carpeta</span>
                </button>
                <button
                  type="button"
                  onClick={onPickFiles}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-800 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                >
                  <FileAudio className="w-4 h-4" />
                  <span>Seleccionar archivos</span>
                </button>
                <button
                  type="button"
                  onClick={onLoadDemo}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-200/60 dark:hover:bg-zinc-800/60 transition-colors cursor-pointer"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>Cargar episodios de prueba</span>
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="divide-y divide-zinc-200/80 dark:divide-zinc-800/80 border-y border-zinc-200/80 dark:border-zinc-800/80">
            {tracks.map((track, index) => {
              const isCurrent = track.id === currentTrackId;
              const isTrackPlaying = isCurrent && isPlaying;
              const progressPct =
                track.duration > 0
                  ? Math.min(100, (track.currentTime / track.duration) * 100)
                  : 0;
              const hasProgress = track.currentTime > 1 && !track.completed;
              const isMenuOpen = openMenuTrackId === track.id;

              return (
                <div
                  key={track.id}
                  onClick={() => onSelectTrack(track.id)}
                  className={`group relative py-3.5 px-2 sm:px-3 flex items-center gap-3.5 transition-colors cursor-pointer ${
                    isCurrent
                      ? "bg-amber-500/8 dark:bg-amber-500/10"
                      : "hover:bg-zinc-100/80 dark:hover:bg-zinc-900/60"
                  }`}
                >
                  {/* Play/Pause Button + Cover */}
                  <div className="relative flex items-center gap-3 shrink-0">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleTrackPlay(track.id);
                      }}
                      aria-label={
                        isTrackPlaying
                          ? `Pausar ${track.title}`
                          : `Reproducir ${track.title}`
                      }
                      className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors cursor-pointer ${
                        isCurrent
                          ? "bg-amber-600 text-white"
                          : "bg-zinc-200/80 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200 group-hover:bg-amber-600 group-hover:text-white"
                      }`}
                    >
                      {isTrackPlaying ? (
                        <Pause className="w-4 h-4 fill-current" />
                      ) : (
                        <Play className="w-4 h-4 fill-current ml-0.5" />
                      )}
                    </button>

                    <CoverArt
                      src={coverUrls[track.id]}
                      alt={track.title}
                      sizeClass="w-12 h-12"
                      onEditCover={() =>
                        onOpenCoverSearch({
                          kind: "track",
                          id: track.id,
                          initialQuery: track.title,
                          initialAuthor:
                            track.artist !== "Audio local" ? track.artist : "",
                          title: track.title,
                        })
                      }
                      editLabel="Buscar portada en Google, Amazon y más"
                    />
                  </div>

                  {/* Title, unboxed metadata & inline progress line */}
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <h3
                        className={`text-sm font-semibold truncate ${
                          isCurrent
                            ? "text-amber-700 dark:text-amber-400"
                            : "text-zinc-900 dark:text-zinc-100"
                        }`}
                      >
                        {track.title}
                      </h3>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                      <span className="truncate max-w-[200px]">
                        {track.artist}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="truncate max-w-[160px]">
                        {track.folderName}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums">
                        {formatTime(track.duration)}
                      </span>
                      {hasProgress && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono tabular-nums text-amber-700 dark:text-amber-400 font-medium">
                            Reanudar en {formatTime(track.currentTime)}
                          </span>
                        </>
                      )}
                      {track.completed && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                            Completado
                          </span>
                        </>
                      )}
                    </div>

                    {(hasProgress || track.completed) && (
                      <div className="w-full max-w-md h-1 rounded-full bg-zinc-200 dark:bg-zinc-800 overflow-hidden mt-1">
                        <div
                          className={`h-full rounded-full ${
                            track.completed
                              ? "bg-emerald-500"
                              : "bg-amber-500"
                          }`}
                          style={{
                            width: `${track.completed ? 100 : progressPct}%`,
                          }}
                        />
                      </div>
                    )}
                  </div>

                  {/* Row Actions */}
                  <div
                    className="flex items-center gap-1 shrink-0"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {/* Reorder inside playlist */}
                    {activeView.type === "playlist" && activePlaylist && (
                      <>
                        <button
                          type="button"
                          disabled={index === 0}
                          onClick={() =>
                            onMoveTrackInPlaylist(
                              activePlaylist.id,
                              track.id,
                              "up"
                            )
                          }
                          title="Subir en la lista"
                          aria-label="Subir en la lista"
                          className="p-2 rounded-lg text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-200/70 dark:hover:bg-zinc-800 disabled:opacity-25 cursor-pointer"
                        >
                          <ArrowUp className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          disabled={index === tracks.length - 1}
                          onClick={() =>
                            onMoveTrackInPlaylist(
                              activePlaylist.id,
                              track.id,
                              "down"
                            )
                          }
                          title="Bajar en la lista"
                          aria-label="Bajar en la lista"
                          className="p-2 rounded-lg text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-200/70 dark:hover:bg-zinc-800 disabled:opacity-25 cursor-pointer"
                        >
                          <ArrowDown className="w-4 h-4" />
                        </button>
                      </>
                    )}

                    {/* Grounded Google Search Info */}
                    <button
                      type="button"
                      onClick={() =>
                        onOpenSearchInfo({
                          title: track.title,
                          artist:
                            track.artist !== "Audio local" ? track.artist : "",
                        })
                      }
                      title="Información en Google Search"
                      aria-label={`Buscar información de ${track.title} en Google`}
                      className="p-2 rounded-lg text-zinc-500 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-zinc-200/70 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                    >
                      <Globe className="w-4 h-4" />
                    </button>

                    {/* Multi-source Cover Search */}
                    <button
                      type="button"
                      onClick={() =>
                        onOpenCoverSearch({
                          kind: "track",
                          id: track.id,
                          initialQuery: track.title,
                          initialAuthor:
                            track.artist !== "Audio local" ? track.artist : "",
                          title: track.title,
                        })
                      }
                      title="Buscar portada (Google, Amazon, autor...)"
                      aria-label={`Buscar portada para ${track.title}`}
                      className="p-2 rounded-lg text-zinc-500 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-zinc-200/70 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                    >
                      <ImagePlus className="w-4 h-4" />
                    </button>

                    {/* Reset Saved Progress */}
                    {(track.currentTime > 1 || track.completed) && (
                      <button
                        type="button"
                        onClick={() => onResetProgress(track.id)}
                        title="Reiniciar progreso guardado"
                        aria-label={`Reiniciar progreso de ${track.title}`}
                        className="p-2 rounded-lg text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-200/70 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                      >
                        <RotateCcw className="w-4 h-4" />
                      </button>
                    )}

                    {/* Add to Custom Playlist Popover */}
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => {
                          setOpenMenuTrackId(isMenuOpen ? null : track.id);
                          setQuickListName("");
                        }}
                        title="Agregar a lista de reproducción"
                        aria-label={`Agregar ${track.title} a lista`}
                        className="p-2 rounded-lg text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-200/70 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                      >
                        <ListPlus className="w-4 h-4" />
                      </button>

                      {isMenuOpen && (
                        <div className="absolute right-0 mt-1.5 w-60 rounded-xl bg-white dark:bg-[#191D26] border border-zinc-200 dark:border-zinc-700 shadow-xl z-30 p-2 space-y-1.5">
                          <div className="px-2 py-1 flex items-center justify-between text-xs font-medium text-zinc-500 dark:text-zinc-400">
                            <span>Guardar en lista</span>
                            <button
                              type="button"
                              onClick={() => setOpenMenuTrackId(null)}
                              aria-label="Cerrar menú"
                              className="p-0.5 hover:text-zinc-900 dark:hover:text-zinc-100 cursor-pointer"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          <div className="max-h-40 overflow-y-auto space-y-0.5">
                            {playlists.map((pl) => {
                              const included = pl.trackIds.includes(track.id);
                              return (
                                <button
                                  key={pl.id}
                                  type="button"
                                  onClick={() =>
                                    onToggleTrackInPlaylist(pl.id, track.id)
                                  }
                                  className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs text-zinc-800 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
                                >
                                  <span className="truncate">{pl.name}</span>
                                  {included && (
                                    <Check className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                                  )}
                                </button>
                              );
                            })}
                          </div>

                          <form
                            onSubmit={(e) => {
                              e.preventDefault();
                              const trimmed = quickListName.trim();
                              if (!trimmed) return;
                              onCreatePlaylistWithTrack(trimmed, track.id);
                              setQuickListName("");
                              setOpenMenuTrackId(null);
                            }}
                            className="pt-1 border-t border-zinc-200 dark:border-zinc-800 flex items-center gap-1"
                          >
                            <input
                              type="text"
                              value={quickListName}
                              onChange={(e) => setQuickListName(e.target.value)}
                              placeholder="Nueva lista..."
                              className="flex-1 min-w-0 px-2 py-1 text-xs rounded-md bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 focus:outline-none"
                            />
                            <button
                              type="submit"
                              className="px-2 py-1 text-xs font-medium rounded-md bg-amber-600 text-white cursor-pointer"
                            >
                              Crear
                            </button>
                          </form>
                        </div>
                      )}
                    </div>

                    {/* Delete or remove from playlist */}
                    {activeView.type === "playlist" && activePlaylist ? (
                      <button
                        type="button"
                        onClick={() =>
                          onToggleTrackInPlaylist(activePlaylist.id, track.id)
                        }
                        title="Quitar de esta lista"
                        aria-label={`Quitar ${track.title} de la lista`}
                        className="p-2 rounded-lg text-zinc-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-zinc-200/70 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onDeleteTrack(track.id)}
                        title="Eliminar de la biblioteca"
                        aria-label={`Eliminar ${track.title}`}
                        className="p-2 rounded-lg text-zinc-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-zinc-200/70 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
