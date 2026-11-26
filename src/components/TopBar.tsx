import {
  FolderPlus,
  LogIn,
  Menu,
  Mic,
  Moon,
  Search,
  Sun,
  X,
} from "lucide-react";
import { User } from "firebase/auth";

interface TopBarProps {
  title: string;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  theme: "dark" | "light";
  onToggleTheme: () => void;
  onPickFolder: () => void;
  onOpenTranscribe: () => void;
  onOpenMobileMenu: () => void;
  user: User | null;
  onSignIn: () => void;
}

export function TopBar({
  title,
  searchQuery,
  onSearchChange,
  theme,
  onToggleTheme,
  onPickFolder,
  onOpenTranscribe,
  onOpenMobileMenu,
  user,
  onSignIn,
}: TopBarProps) {
  return (
    <header className="h-16 px-4 md:px-8 border-b border-zinc-200 dark:border-zinc-800/80 bg-zinc-50/90 dark:bg-[#0B0D11]/90 backdrop-blur-md flex items-center justify-between gap-4 md:gap-8 shrink-0">
      {/* Zone 1: View Title / Mobile Drawer Toggle */}
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          onClick={onOpenMobileMenu}
          aria-label="Abrir menú"
          className="md:hidden p-2 -ml-2 rounded-lg text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200/70 dark:hover:bg-zinc-800 cursor-pointer"
        >
          <Menu className="w-5 h-5" />
        </button>
        <h1 className="font-display text-lg md:text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 truncate">
          {title}
        </h1>
      </div>

      {/* Zone 2: Live Search */}
      <div className="flex-1 max-w-md hidden sm:block">
        <div className="relative">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Buscar episodio, artista o carpeta..."
            className="w-full pl-9 pr-8 py-2 text-sm rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-amber-500/40 transition-shadow"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => onSearchChange("")}
              aria-label="Limpiar búsqueda"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Zone 3: Quick Actions & Theme */}
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={onOpenTranscribe}
          title="Grabar micrófono y transcribir"
          aria-label="Grabar y transcribir"
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Mic className="w-4 h-4 text-amber-600 dark:text-amber-400" />
          <span className="hidden lg:inline">Transcribir</span>
        </button>

        <button
          type="button"
          onClick={onToggleTheme}
          title={theme === "dark" ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
          aria-label={theme === "dark" ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          {theme === "dark" ? (
            <Sun className="w-4 h-4 text-amber-500" />
          ) : (
            <Moon className="w-4 h-4 text-zinc-700" />
          )}
        </button>

        {!user && (
          <button
            type="button"
            onClick={onSignIn}
            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-amber-600 hover:bg-amber-500 text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <LogIn className="w-3.5 h-3.5" />
            <span>Acceder con Google</span>
          </button>
        )}

        <button
          type="button"
          onClick={onPickFolder}
          className="md:hidden inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-amber-600 hover:bg-amber-500 text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <FolderPlus className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
}
