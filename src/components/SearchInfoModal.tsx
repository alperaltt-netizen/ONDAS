import { useEffect, useState } from "react";
import { ExternalLink, Globe, Loader2, Search, X } from "lucide-react";
import { SearchInfoTarget } from "../types";

interface SearchInfoModalProps {
  target: SearchInfoTarget | null;
  onClose: () => void;
}

interface GroundedSource {
  uri: string;
  title: string;
}

export function SearchInfoModal({ target, onClose }: SearchInfoModalProps) {
  const [query, setQuery] = useState("");
  const [summary, setSummary] = useState("");
  const [sources, setSources] = useState<GroundedSource[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const runLookup = async (searchText: string) => {
    const trimmed = searchText.trim();
    if (trimmed.length < 2) {
      setErrorMsg("Escribe al menos 2 caracteres para buscar.");
      return;
    }
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/audio/search-info", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customQuery: trimmed }),
      });
      const data = (await res.json()) as {
        summary?: string;
        sources?: GroundedSource[];
        error?: string;
      };
      if (!res.ok) {
        setErrorMsg(data.error ?? "No se pudo consultar Google Search.");
        setSummary("");
        setSources([]);
        return;
      }
      setSummary(data.summary ?? "");
      setSources(data.sources ?? []);
    } catch {
      setErrorMsg("Error de red al consultar información en Google.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!target) return;
    const initial = [
      target.title,
      target.artist && target.artist !== "Audio local" ? target.artist : "",
    ]
      .filter(Boolean)
      .join(" — ");
    setQuery(initial);
    setSummary("");
    setSources([]);
    setErrorMsg(null);
    if (initial.length >= 2) {
      void runLookup(initial);
    }
  }, [target]);

  if (!target) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl max-h-[86vh] flex flex-col rounded-xl bg-white dark:bg-[#14171F] border border-zinc-200 dark:border-zinc-800 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <Globe className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0" />
            <div className="min-w-0">
              <h2 className="font-display text-lg font-semibold text-zinc-900 dark:text-zinc-50 truncate">
                Información en Google Search
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
                Datos actualizados sobre podcasts, episodios y autores
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar ventana"
            className="p-2 rounded-lg text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 shrink-0">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void runLookup(query);
            }}
            className="flex items-center gap-2"
          >
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Podcast, episodio, libro o autor..."
                className="w-full pl-9 pr-3 py-2 text-sm rounded-lg bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
              />
            </div>
            <button
              type="submit"
              disabled={isLoading}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-amber-600 hover:bg-amber-500 disabled:opacity-60 text-white transition-colors whitespace-nowrap cursor-pointer"
            >
              {isLoading ? "Consultando..." : "Buscar"}
            </button>
          </form>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {errorMsg && (
            <div className="px-4 py-3 rounded-lg bg-amber-500/10 border border-amber-500/25 text-xs text-amber-800 dark:text-amber-300">
              {errorMsg}
            </div>
          )}

          {isLoading ? (
            <div className="py-12 flex flex-col items-center justify-center gap-3 text-sm text-zinc-500 dark:text-zinc-400">
              <Loader2 className="w-6 h-6 animate-spin text-amber-600 dark:text-amber-400" />
              <span>Consultando datos actualizados en Google...</span>
            </div>
          ) : (
            <>
              {summary && (
                <div className="text-sm text-zinc-800 dark:text-zinc-200 leading-relaxed whitespace-pre-wrap">
                  {summary}
                </div>
              )}

              {sources.length > 0 && (
                <div className="pt-4 border-t border-zinc-200 dark:border-zinc-800 space-y-2.5">
                  <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                    Fuentes verificadas en Google Search
                  </div>
                  <div className="space-y-1.5">
                    {sources.map((src) => (
                      <a
                        key={src.uri}
                        href={src.uri}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-900/70 border border-zinc-200 dark:border-zinc-800 hover:border-amber-500/50 text-xs text-zinc-800 dark:text-zinc-200 transition-colors"
                      >
                        <span className="truncate font-medium">{src.title}</span>
                        <ExternalLink className="w-3.5 h-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
