import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  Download,
  ExternalLink,
  ImagePlus,
  Link2,
  Loader2,
  Search,
  Upload,
  User,
  X,
} from "lucide-react";
import { CoverSearchCandidate, CoverSearchTarget } from "../types";

type SearchMode = "combined" | "author" | "title";
type SourceFilter = "all" | "google" | "amazon" | "apple" | "deezer" | "musicbrainz";

interface CoverSearchModalProps {
  target: CoverSearchTarget | null;
  onClose: () => void;
  onApplyCoverBlob: (target: CoverSearchTarget, blob: Blob) => Promise<void>;
}

export function CoverSearchModal({
  target,
  onClose,
  onApplyCoverBlob,
}: CoverSearchModalProps) {
  const [titleQuery, setTitleQuery] = useState("");
  const [authorQuery, setAuthorQuery] = useState("");
  const [searchMode, setSearchMode] = useState<SearchMode>("combined");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [results, setResults] = useState<CoverSearchCandidate[]>([]);
  const [hiddenUrls, setHiddenUrls] = useState<Set<string>>(new Set());
  const [googleImagesUrl, setGoogleImagesUrl] = useState("");
  const [amazonSearchUrl, setAmazonSearchUrl] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [applyingUrl, setApplyingUrl] = useState<string | null>(null);
  const [appliedUrl, setAppliedUrl] = useState<string | null>(null);
  const [manualUrl, setManualUrl] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const runSearch = async (
    nextTitle: string,
    nextAuthor: string,
    nextMode: SearchMode
  ) => {
    const t = nextTitle.trim();
    const a = nextAuthor.trim();
    const effective =
      nextMode === "author"
        ? a || t
        : nextMode === "title"
        ? t || a
        : [t, a].filter(Boolean).join(" ").trim();

    if (effective.length < 2) {
      setErrorMsg("Escribe al menos 2 caracteres en título o autor.");
      return;
    }

    setIsSearching(true);
    setErrorMsg(null);
    setHiddenUrls(new Set());
    try {
      const res = await fetch("/api/cover/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: t,
          author: a,
          mode: nextMode,
        }),
      });
      const data = (await res.json()) as {
        results?: CoverSearchCandidate[];
        googleImagesUrl?: string;
        amazonSearchUrl?: string;
        error?: string;
      };
      setGoogleImagesUrl(
        data.googleImagesUrl ??
          `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(
            `${effective} portada`
          )}`
      );
      setAmazonSearchUrl(
        data.amazonSearchUrl ??
          `https://www.amazon.com/s?k=${encodeURIComponent(effective)}`
      );
      if (!res.ok) {
        setErrorMsg(data.error ?? "No se pudieron obtener portadas.");
        setResults([]);
        return;
      }
      setResults(data.results ?? []);
      if ((data.results ?? []).length === 0) {
        setErrorMsg(
          "No se encontraron portadas directas. Prueba buscar solo por autor o pega una URL desde Google o Amazon."
        );
      }
    } catch {
      setErrorMsg("Error de conexión al buscar portadas.");
    } finally {
      setIsSearching(false);
    }
  };

  useEffect(() => {
    if (!target) return;
    const initTitle = target.initialQuery;
    const initAuthor = target.initialAuthor ?? "";
    setTitleQuery(initTitle);
    setAuthorQuery(initAuthor);
    setSearchMode("combined");
    setSourceFilter("all");
    setResults([]);
    setHiddenUrls(new Set());
    setAppliedUrl(null);
    setManualUrl("");
    setErrorMsg(null);
    void runSearch(initTitle, initAuthor, "combined");
  }, [target]);

  const visibleResults = useMemo(() => {
    return results.filter((item) => {
      if (hiddenUrls.has(item.url)) return false;
      if (sourceFilter === "all") return true;
      return item.sourceKey === sourceFilter;
    });
  }, [results, hiddenUrls, sourceFilter]);

  const sourceCounts = useMemo(() => {
    const counts: Record<SourceFilter, number> = {
      all: 0,
      google: 0,
      amazon: 0,
      apple: 0,
      deezer: 0,
      musicbrainz: 0,
    };
    for (const item of results) {
      if (hiddenUrls.has(item.url)) continue;
      counts.all += 1;
      if (item.sourceKey && item.sourceKey in counts) {
        counts[item.sourceKey] += 1;
      }
    }
    return counts;
  }, [results, hiddenUrls]);

  if (!target) return null;

  const handleApplyRemoteUrl = async (imageUrl: string) => {
    setApplyingUrl(imageUrl);
    setErrorMsg(null);
    try {
      const proxyUrl = `/api/cover/proxy?url=${encodeURIComponent(imageUrl)}`;
      const res = await fetch(proxyUrl);
      if (!res.ok) {
        throw new Error("No se pudo descargar la portada seleccionada.");
      }
      const blob = await res.blob();
      if (!blob.type.startsWith("image/") || blob.size < 100) {
        throw new Error("El enlace no devolvió una imagen válida.");
      }
      await onApplyCoverBlob(target, blob);
      setAppliedUrl(imageUrl);
      window.setTimeout(() => onClose(), 380);
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : "No se pudo descargar esta portada."
      );
    } finally {
      setApplyingUrl(null);
    }
  };

  const handleLocalImageUpload = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await onApplyCoverBlob(target, file);
    onClose();
  };

  const sourceTabs: Array<{ key: SourceFilter; label: string }> = [
    { key: "all", label: "Todas" },
    { key: "google", label: "Google" },
    { key: "amazon", label: "Amazon" },
    { key: "apple", label: "Apple" },
    { key: "deezer", label: "Deezer" },
    { key: "musicbrainz", label: "MusicBrainz" },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl max-h-[90vh] flex flex-col rounded-xl bg-white dark:bg-[#14171F] border border-zinc-200 dark:border-zinc-800 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-4 shrink-0">
          <div className="min-w-0">
            <h2 className="font-display text-lg font-semibold text-zinc-900 dark:text-zinc-50 truncate">
              Buscar y descargar portada
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate mt-0.5">
              Google, Amazon, Audible, Apple Podcasts, Deezer y MusicBrainz ·{" "}
              {target.title}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar ventana"
            className="p-2 rounded-lg text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search Controls: Title + Author + Mode */}
        <div className="px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 space-y-3 shrink-0">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void runSearch(titleQuery, authorQuery, searchMode);
            }}
            className="grid grid-cols-1 sm:grid-cols-12 gap-2"
          >
            <div className="relative sm:col-span-5">
              <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={titleQuery}
                onChange={(e) => setTitleQuery(e.target.value)}
                placeholder="Título, podcast o álbum..."
                className="w-full pl-9 pr-3 py-2 text-sm rounded-lg bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
              />
            </div>

            <div className="relative sm:col-span-5">
              <User className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={authorQuery}
                onChange={(e) => setAuthorQuery(e.target.value)}
                placeholder="Autor, creador o artista..."
                className="w-full pl-9 pr-3 py-2 text-sm rounded-lg bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
              />
            </div>

            <button
              type="submit"
              disabled={isSearching}
              className="sm:col-span-2 px-4 py-2 rounded-lg text-sm font-medium bg-amber-600 hover:bg-amber-500 disabled:opacity-60 text-white transition-colors whitespace-nowrap cursor-pointer"
            >
              {isSearching ? "Buscando..." : "Buscar"}
            </button>
          </form>

          {/* Search Mode + Source Filter Tabs */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1 p-1 rounded-lg bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
              <button
                type="button"
                onClick={() => {
                  setSearchMode("combined");
                  void runSearch(titleQuery, authorQuery, "combined");
                }}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                  searchMode === "combined"
                    ? "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-50 shadow-xs"
                    : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200"
                }`}
              >
                Título y autor
              </button>
              <button
                type="button"
                onClick={() => {
                  setSearchMode("author");
                  void runSearch(titleQuery, authorQuery, "author");
                }}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                  searchMode === "author"
                    ? "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-50 shadow-xs"
                    : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200"
                }`}
              >
                Solo por autor
              </button>
              <button
                type="button"
                onClick={() => {
                  setSearchMode("title");
                  void runSearch(titleQuery, authorQuery, "title");
                }}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                  searchMode === "title"
                    ? "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-50 shadow-xs"
                    : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200"
                }`}
              >
                Solo por título
              </button>
            </div>

            {/* Source filter */}
            <div className="flex flex-wrap items-center gap-1">
              {sourceTabs.map((tab) => {
                const count = sourceCounts[tab.key];
                const isActive = sourceFilter === tab.key;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setSourceFilter(tab.key)}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                      isActive
                        ? "bg-amber-600 text-white"
                        : "bg-zinc-100 dark:bg-zinc-800/80 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700"
                    }`}
                  >
                    {tab.label}
                    {count > 0 ? ` (${count})` : ""}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Direct external links + paste URL + local upload */}
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs pt-0.5">
            <div className="flex flex-wrap items-center gap-3">
              {googleImagesUrl && (
                <a
                  href={googleImagesUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 hover:underline font-medium"
                >
                  <span>Google Imágenes</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
              {amazonSearchUrl && (
                <a
                  href={amazonSearchUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 hover:underline font-medium"
                >
                  <span>Buscar en Amazon</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-zinc-100 font-medium cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Subir imagen</span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleLocalImageUpload}
                className="hidden"
              />
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (manualUrl.trim()) {
                  void handleApplyRemoteUrl(manualUrl.trim());
                }
              }}
              className="flex items-center gap-1.5 w-full sm:w-auto"
            >
              <div className="relative flex-1 sm:w-64">
                <Link2 className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="url"
                  value={manualUrl}
                  onChange={(e) => setManualUrl(e.target.value)}
                  placeholder="Pegar URL de Google o Amazon..."
                  className="w-full pl-8 pr-2.5 py-1.5 text-xs rounded-md bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-amber-500/40"
                />
              </div>
              <button
                type="submit"
                disabled={!manualUrl.trim() || applyingUrl !== null}
                className="px-2.5 py-1.5 text-xs font-medium rounded-md bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-100 disabled:opacity-40 cursor-pointer"
              >
                Aplicar URL
              </button>
            </form>
          </div>
        </div>

        {/* Results Grid */}
        <div className="flex-1 overflow-y-auto p-6">
          {errorMsg && (
            <div className="mb-4 px-4 py-3 rounded-lg bg-amber-500/10 border border-amber-500/25 text-xs text-amber-800 dark:text-amber-300">
              {errorMsg}
            </div>
          )}

          {isSearching ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {Array.from({ length: 8 }).map((_, idx) => (
                <div
                  key={idx}
                  className="aspect-square rounded-lg bg-zinc-200 dark:bg-zinc-800 animate-pulse"
                />
              ))}
            </div>
          ) : visibleResults.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {visibleResults.map((item) => {
                const proxiedSrc = `/api/cover/proxy?url=${encodeURIComponent(
                  item.url
                )}`;
                const safeFileBase = (target.title || "portada")
                  .toLowerCase()
                  .replace(/[^a-z0-9]+/gi, "-")
                  .slice(0, 40);
                const downloadHref = `/api/cover/proxy?url=${encodeURIComponent(
                  item.url
                )}&download=${encodeURIComponent(`${safeFileBase}.jpg`)}`;
                const isApplying = applyingUrl === item.url;
                const isApplied = appliedUrl === item.url;

                return (
                  <div
                    key={item.url}
                    className="group flex flex-col rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/70 overflow-hidden"
                  >
                    <div className="relative aspect-square bg-zinc-200 dark:bg-zinc-800 overflow-hidden">
                      <img
                        src={proxiedSrc}
                        alt={item.title}
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        onError={() =>
                          setHiddenUrls((prev) => new Set(prev).add(item.url))
                        }
                        className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-[1.03]"
                      />
                    </div>

                    <div className="p-2.5 flex flex-col gap-2">
                      <div className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
                        {item.source} · {item.title}
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => void handleApplyRemoteUrl(item.url)}
                          disabled={applyingUrl !== null}
                          className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-1.5 rounded-md text-xs font-medium bg-amber-600 hover:bg-amber-500 disabled:opacity-60 text-white transition-colors cursor-pointer"
                        >
                          {isApplying ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : isApplied ? (
                            <Check className="w-3.5 h-3.5" />
                          ) : (
                            <ImagePlus className="w-3.5 h-3.5" />
                          )}
                          <span>{isApplied ? "Aplicada" : "Usar"}</span>
                        </button>

                        <a
                          href={downloadHref}
                          download={`${safeFileBase}.jpg`}
                          title="Descargar imagen a tu equipo"
                          aria-label={`Descargar portada ${item.title}`}
                          className="p-1.5 rounded-md bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 transition-colors"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </a>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            !errorMsg && (
              <div className="py-12 text-center text-sm text-zinc-500 dark:text-zinc-400">
                {sourceFilter !== "all"
                  ? "No hay portadas en esta fuente. Selecciona 'Todas' o prueba otra búsqueda."
                  : "Escribe el título o el autor arriba para buscar portadas en Google, Amazon y más."}
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}
