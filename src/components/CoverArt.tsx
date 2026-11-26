import { Disc3, ImagePlus } from "lucide-react";

interface CoverArtProps {
  src?: string | null;
  alt: string;
  sizeClass?: string;
  roundedClass?: string;
  onEditCover?: () => void;
  editLabel?: string;
}

export function CoverArt({
  src,
  alt,
  sizeClass = "w-12 h-12",
  roundedClass = "rounded-lg",
  onEditCover,
  editLabel = "Buscar portada en Google",
}: CoverArtProps) {
  return (
    <div
      className={`relative shrink-0 overflow-hidden bg-zinc-200 dark:bg-zinc-800/90 border border-zinc-300/70 dark:border-zinc-700/60 ${sizeClass} ${roundedClass} group`}
    >
      {src ? (
        <img
          src={src}
          alt={alt}
          referrerPolicy="no-referrer"
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-zinc-200 to-zinc-300 dark:from-zinc-800 dark:to-zinc-900 text-zinc-500 dark:text-zinc-500">
          <Disc3 className="w-5 h-5 opacity-75" />
        </div>
      )}

      {onEditCover && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onEditCover();
          }}
          title={editLabel}
          aria-label={editLabel}
          className="absolute inset-0 flex items-center justify-center bg-black/60 text-white opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity duration-150 cursor-pointer"
        >
          <ImagePlus className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
