import { useState } from "react";
import {
  Clock,
  FolderPlus,
  Library,
  ListMusic,
  Plus,
  Trash2,
  Pencil,
  Check,
  X,
  FileAudio,
  Mic,
  LogIn,
  LogOut,
} from "lucide-react";
import { User } from "firebase/auth";
import { ActiveView, Playlist } from "../types";

interface SidebarProps {
  activeView: ActiveView;
  onSelectView: (view: ActiveView) => void;
  totalTracks: number;
  inProgressCount: number;
  playlists: Playlist[];
  user: User | null;
  onSignIn: () => void;
  onSignOut: () => void;
  onCreatePlaylist: (name: string) => void;
  onRenamePlaylist: (id: string, name: string) => void;
  onDeletePlaylist: (id: string) => void;
  onPickFolder: () => void;
  onPickFiles: () => void;
  onOpenTranscribe: () => void;
  isMobileOpen: boolean;
  onCloseMobile: () => void;
}

export function Sidebar({
  activeView,
  onSelectView,
  totalTracks,
  inProgressCount,
  playlists,
  user,
  onSignIn,
  onSignOut,
  onCreatePlaylist,
  onRenamePlaylist,
  onDeletePlaylist,
  onPickFolder,
  onPickFiles,
  onOpenTranscribe,
  isMobileOpen,
  onCloseMobile,
}: SidebarProps) {
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newName.trim();
    if (!trimmed) return;
    onCreatePlaylist(trimmed);
    setNewName("");
    setIsCreating(false);
  };

  const handleRenameSubmit = (e: React.FormEvent, id: string) => {
    e.preventDefault();
    const trimmed = editingName.trim();
    if (trimmed) {
      onRenamePlaylist(id, trimmed);
    }
    setEditingId(null);
  };

  const content = (
    <div className="flex flex-col h-full bg-zinc-100/90 dark:bg-[#11141A] border-r border-zinc-200 dark:border-zinc-800/80 w-[264px] select-none">
      {/* Brand header */}
      <div className="px-5 h-16 flex items-center border-b border-zinc-200 dark:border-zinc-800/80 shrink-0">
        <span className="font-display text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 whitespace-nowrap">
          Ondas
        </span>
      </div>

      {/* Navigation & Playlists */}
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
        <nav aria-label="Biblioteca" className="space-y-1">
          <div className="px-2.5 pb-1.5 text-xs font-medium text-zinc-500 dark:text-zinc-400">
            Biblioteca
          </div>
          <button
            type="button"
            onClick={() => {
              onSelectView({ type: "library" });
              onCloseMobile();
            }}
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
              activeView.type === "library"
                ? "bg-white dark:bg-zinc-800/90 text-zinc-900 dark:text-zinc-50 shadow-xs border border-zinc-200/80 dark:border-zinc-700/60"
                : "text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200/60 dark:hover:bg-zinc-800/40"
            }`}
          >
            <span className="flex items-center gap-2.5 truncate">
              <Library className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <span className="truncate">Todos los audios</span>
            </span>
            <span className="font-mono tabular-nums text-xs text-zinc-500 dark:text-zinc-400">
              {totalTracks}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              onSelectView({ type: "in-progress" });
              onCloseMobile();
            }}
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
              activeView.type === "in-progress"
                ? "bg-white dark:bg-zinc-800/90 text-zinc-900 dark:text-zinc-50 shadow-xs border border-zinc-200/80 dark:border-zinc-700/60"
                : "text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200/60 dark:hover:bg-zinc-800/40"
            }`}
          >
            <span className="flex items-center gap-2.5 truncate">
              <Clock className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <span className="truncate">Seguir escuchando</span>
            </span>
            <span className="font-mono tabular-nums text-xs text-zinc-500 dark:text-zinc-400">
              {inProgressCount}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              onOpenTranscribe();
              onCloseMobile();
            }}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200/60 dark:hover:bg-zinc-800/40 transition-colors cursor-pointer"
          >
            <Mic className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <span className="truncate">Grabar y transcribir</span>
          </button>
        </nav>

        {/* Custom Playlists */}
        <div className="space-y-2">
          <div className="px-2.5 flex items-center justify-between">
            <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
              Listas personalizadas
            </span>
            <button
              type="button"
              onClick={() => setIsCreating((v) => !v)}
              title="Crear nueva lista"
              aria-label="Crear nueva lista"
              className="p-1.5 rounded-md text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-200/70 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          {isCreating && (
            <form onSubmit={handleCreateSubmit} className="px-1 space-y-2">
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Nombre de la lista..."
                autoFocus
                className="w-full px-3 py-2 text-sm rounded-lg bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
              />
              <div className="flex items-center gap-1.5">
                <button
                  type="submit"
                  className="flex-1 px-3 py-1.5 text-xs font-medium rounded-md bg-amber-600 hover:bg-amber-500 text-white transition-colors cursor-pointer"
                >
                  Crear
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsCreating(false);
                    setNewName("");
                  }}
                  className="px-3 py-1.5 text-xs font-medium rounded-md bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-300 dark:hover:bg-zinc-700 transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
              </div>
            </form>
          )}

          {playlists.length === 0 && !isCreating ? (
            <p className="px-2.5 py-2 text-xs text-zinc-500 dark:text-zinc-500 leading-relaxed">
              Crea listas para organizar tus episodios, charlas o álbumes.
            </p>
          ) : (
            <div className="space-y-1">
              {playlists.map((pl) => {
                const isActive =
                  activeView.type === "playlist" &&
                  activeView.playlistId === pl.id;

                if (editingId === pl.id) {
                  return (
                    <form
                      key={pl.id}
                      onSubmit={(e) => handleRenameSubmit(e, pl.id)}
                      className="flex items-center gap-1 px-1 py-1"
                    >
                      <input
                        type="text"
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        autoFocus
                        className="flex-1 min-w-0 px-2.5 py-1.5 text-sm rounded-md bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                      />
                      <button
                        type="submit"
                        aria-label="Guardar nombre"
                        className="p-1.5 rounded-md text-emerald-600 dark:text-emerald-400 hover:bg-zinc-200 dark:hover:bg-zinc-800 cursor-pointer"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        aria-label="Cancelar edición"
                        onClick={() => setEditingId(null)}
                        className="p-1.5 rounded-md text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-800 cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </form>
                  );
                }

                return (
                  <div
                    key={pl.id}
                    className={`group flex items-center justify-between rounded-lg transition-colors ${
                      isActive
                        ? "bg-white dark:bg-zinc-800/90 text-zinc-900 dark:text-zinc-50 shadow-xs border border-zinc-200/80 dark:border-zinc-700/60"
                        : "text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200/60 dark:hover:bg-zinc-800/40"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        onSelectView({ type: "playlist", playlistId: pl.id });
                        onCloseMobile();
                      }}
                      className="flex-1 min-w-0 flex items-center gap-2.5 px-3 py-2.5 text-sm font-medium text-left cursor-pointer"
                    >
                      <ListMusic className="w-4 h-4 shrink-0 text-zinc-500 dark:text-zinc-400" />
                      <span className="truncate">{pl.name}</span>
                    </button>
                    <div className="flex items-center pr-2 gap-0.5 shrink-0">
                      <span className="font-mono tabular-nums text-xs text-zinc-500 dark:text-zinc-400 px-1 group-hover:hidden">
                        {pl.trackIds.length}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(pl.id);
                          setEditingName(pl.name);
                        }}
                        title="Renombrar lista"
                        aria-label={`Renombrar ${pl.name}`}
                        className="hidden group-hover:inline-flex p-1.5 rounded-md text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 cursor-pointer"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeletePlaylist(pl.id)}
                        title="Eliminar lista"
                        aria-label={`Eliminar ${pl.name}`}
                        className="hidden group-hover:inline-flex p-1.5 rounded-md text-zinc-500 hover:text-red-600 dark:hover:text-red-400 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Bottom Import + Google Account Sync */}
      <div className="p-3 border-t border-zinc-200 dark:border-zinc-800/80 space-y-2 shrink-0">
        <button
          type="button"
          onClick={() => {
            onPickFolder();
            onCloseMobile();
          }}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-amber-600 hover:bg-amber-500 text-white transition-colors whitespace-nowrap cursor-pointer"
        >
          <FolderPlus className="w-4 h-4 shrink-0" />
          <span>Agregar carpeta</span>
        </button>
        <button
          type="button"
          onClick={() => {
            onPickFiles();
            onCloseMobile();
          }}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-xs font-medium bg-zinc-200/80 dark:bg-zinc-800/80 hover:bg-zinc-300/80 dark:hover:bg-zinc-800 text-zinc-800 dark:text-zinc-200 transition-colors whitespace-nowrap cursor-pointer"
        >
          <FileAudio className="w-3.5 h-3.5 shrink-0" />
          <span>Agregar archivos</span>
        </button>

        {/* User Account Box */}
        <div className="pt-2 border-t border-zinc-200 dark:border-zinc-800/80">
          {user ? (
            <div className="flex items-center justify-between gap-2 px-1 py-1">
              <div className="flex items-center gap-2.5 min-w-0">
                {user.photoURL ? (
                  <img
                    src={user.photoURL}
                    alt={user.displayName ?? "Usuario"}
                    referrerPolicy="no-referrer"
                    className="w-8 h-8 rounded-full object-cover shrink-0 border border-zinc-300 dark:border-zinc-700"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-amber-600 text-white text-xs font-semibold flex items-center justify-center shrink-0">
                    {(user.displayName ?? user.email ?? "U")[0].toUpperCase()}
                  </div>
                )}
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                    {user.displayName ?? "Cuenta Google"}
                  </div>
                  <div className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
                    Sincronizado
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={onSignOut}
                title="Cerrar sesión"
                aria-label="Cerrar sesión"
                className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-200 dark:hover:bg-zinc-800 cursor-pointer shrink-0"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={onSignIn}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-medium bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-800 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
            >
              <LogIn className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
              <span>Conectar con Google</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <>
      <aside className="hidden md:block shrink-0 h-full">{content}</aside>

      {isMobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs"
            onClick={onCloseMobile}
          />
          <aside className="relative z-10 h-full">{content}</aside>
        </div>
      )}
    </>
  );
}
