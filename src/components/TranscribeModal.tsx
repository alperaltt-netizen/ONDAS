import { useEffect, useRef, useState } from "react";
import {
  Check,
  Copy,
  FileAudio,
  Loader2,
  Mic,
  Save,
  Square,
  Trash2,
  X,
} from "lucide-react";
import { TranscriptionItem } from "../types";
import { formatTime } from "../utils/audioTags";

interface TranscribeModalProps {
  isOpen: boolean;
  onClose: () => void;
  isSignedIn: boolean;
  savedTranscriptions: TranscriptionItem[];
  onSaveTranscription: (item: TranscriptionItem) => Promise<void>;
  onDeleteTranscription: (id: string) => Promise<void>;
  onAddRecordingToLibrary: (blob: Blob, title: string, durationSec: number) => Promise<void>;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const res = typeof reader.result === "string" ? reader.result : "";
      const comma = res.indexOf(",");
      resolve(comma >= 0 ? res.slice(comma + 1) : res);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export function TranscribeModal({
  isOpen,
  onClose,
  isSignedIn,
  savedTranscriptions,
  onSaveTranscription,
  onDeleteTranscription,
  onAddRecordingToLibrary,
}: TranscribeModalProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [levels, setLevels] = useState<number[]>(new Array(20).fill(0.12));
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [transcript, setTranscript] = useState("");
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const timerRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const recordedUrlRef = useRef<string | null>(null);

  const stopMeterAndStream = () => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (audioCtxRef.current) {
      void audioCtxRef.current.close();
      audioCtxRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setLevels(new Array(20).fill(0.12));
  };

  useEffect(() => {
    if (!isOpen) {
      if (
        mediaRecorderRef.current &&
        mediaRecorderRef.current.state !== "inactive"
      ) {
        mediaRecorderRef.current.stop();
      }
      stopMeterAndStream();
      setIsRecording(false);
    }
  }, [isOpen]);

  useEffect(() => {
    return () => {
      stopMeterAndStream();
      if (recordedUrlRef.current) {
        URL.revokeObjectURL(recordedUrlRef.current);
      }
    };
  }, []);

  if (!isOpen) return null;

  const startRecording = async () => {
    setErrorMsg(null);
    setSavedNotice(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const preferredTypes = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/mp4",
        "audio/ogg;codecs=opus",
      ];
      const mimeType =
        preferredTypes.find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      recorder.onstop = () => {
        const finalMime = recorder.mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type: finalMime });
        if (recordedUrlRef.current) {
          URL.revokeObjectURL(recordedUrlRef.current);
        }
        const url = URL.createObjectURL(blob);
        recordedUrlRef.current = url;
        setRecordedBlob(blob);
        setRecordedUrl(url);
        if (!title.trim()) {
          const now = new Date();
          setTitle(
            `Nota de voz ${now.toLocaleTimeString("es-ES", {
              hour: "2-digit",
              minute: "2-digit",
            })}`
          );
        }
        stopMeterAndStream();
      };

      // Live Web Audio level visualizer
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      if (AudioCtx) {
        const ctx = new AudioCtx();
        audioCtxRef.current = ctx;
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 64;
        source.connect(analyser);
        const freqData = new Uint8Array(analyser.frequencyBinCount);
        const tick = () => {
          analyser.getByteFrequencyData(freqData);
          const nextLevels: number[] = [];
          for (let i = 0; i < 20; i++) {
            const val = freqData[i % freqData.length] / 255;
            nextLevels.push(Math.max(0.12, Math.min(1, val * 1.25)));
          }
          setLevels(nextLevels);
          rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
      }

      mediaRecorderRef.current = recorder;
      recorder.start(250);
      setElapsedSec(0);
      setIsRecording(true);
      timerRef.current = window.setInterval(() => {
        setElapsedSec((s) => s + 1);
      }, 1000);
    } catch {
      setErrorMsg(
        "No se pudo acceder al micrófono. Verifica los permisos del navegador."
      );
    }
  };

  const stopRecording = () => {
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== "inactive"
    ) {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  };

  const handleTranscribe = async () => {
    if (!recordedBlob) return;
    setIsTranscribing(true);
    setErrorMsg(null);
    setSavedNotice(null);
    try {
      const audioBase64 = await blobToBase64(recordedBlob);
      const res = await fetch("/api/audio/transcribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          audioBase64,
          mimeType: recordedBlob.type || "audio/webm",
        }),
      });
      const data = (await res.json()) as { text?: string; error?: string };
      if (!res.ok) {
        setErrorMsg(data.error ?? "No se pudo transcribir el audio.");
        return;
      }
      setTranscript(data.text || "");
      if (!data.text) {
        setErrorMsg("No se detectó voz en la grabación.");
      }
    } catch {
      setErrorMsg("Error de conexión al transcribir el audio.");
    } finally {
      setIsTranscribing(false);
    }
  };

  const handleSave = async () => {
    if (!transcript.trim()) return;
    setIsSaving(true);
    setErrorMsg(null);
    try {
      const item: TranscriptionItem = {
        id: crypto.randomUUID(),
        title: title.trim() || "Nota de voz",
        text: transcript.trim(),
        durationSec: elapsedSec,
        createdAt: Date.now(),
      };
      await onSaveTranscription(item);
      setSavedNotice(
        isSignedIn
          ? "Transcripción guardada en tu cuenta de Firestore."
          : "Transcripción guardada localmente (inicia sesión con Google para sincronizar en la nube)."
      );
    } catch {
      setErrorMsg("No se pudo guardar la transcripción.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddAudioTrack = async () => {
    if (!recordedBlob) return;
    await onAddRecordingToLibrary(
      recordedBlob,
      title.trim() || "Grabación de micrófono",
      elapsedSec
    );
    setSavedNotice("Audio agregado a tu biblioteca de reproducción.");
  };

  const handleCopy = async () => {
    if (!transcript) return;
    await navigator.clipboard.writeText(transcript);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl max-h-[90vh] flex flex-col rounded-xl bg-white dark:bg-[#14171F] border border-zinc-200 dark:border-zinc-800 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-2.5">
            <Mic className="w-5 h-5 text-amber-600 dark:text-amber-400" />
            <div>
              <h2 className="font-display text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                Grabar y transcribir audio
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Captura voz con tu micrófono y transcríbela automáticamente
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

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {errorMsg && (
            <div className="px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/25 text-xs text-red-700 dark:text-red-300">
              {errorMsg}
            </div>
          )}

          {savedNotice && (
            <div className="px-4 py-3 rounded-lg bg-emerald-500/10 border border-emerald-500/25 text-xs text-emerald-700 dark:text-emerald-300">
              {savedNotice}
            </div>
          )}

          {/* Recorder Console */}
          <div className="p-5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/80 dark:bg-zinc-900/50 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                {!isRecording ? (
                  <button
                    type="button"
                    onClick={() => void startRecording()}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-amber-600 hover:bg-amber-500 text-white transition-colors cursor-pointer"
                  >
                    <Mic className="w-4 h-4" />
                    <span>{recordedBlob ? "Grabar de nuevo" : "Iniciar grabación"}</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={stopRecording}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-red-600 hover:bg-red-500 text-white transition-colors cursor-pointer"
                  >
                    <Square className="w-4 h-4 fill-current" />
                    <span>Detener</span>
                  </button>
                )}

                <span className="font-mono tabular-nums text-sm font-medium text-zinc-700 dark:text-zinc-200">
                  {formatTime(elapsedSec)}
                </span>
              </div>

              {/* Live audio level bars */}
              <div
                className="flex items-center gap-1 h-8 px-2"
                aria-hidden="true"
              >
                {levels.map((lvl, idx) => (
                  <span
                    key={idx}
                    className={`w-1 rounded-full transition-all duration-75 ${
                      isRecording
                        ? "bg-amber-500"
                        : "bg-zinc-300 dark:bg-zinc-700"
                    }`}
                    style={{ height: `${Math.round(lvl * 28)}px` }}
                  />
                ))}
              </div>
            </div>

            {recordedUrl && !isRecording && (
              <div className="pt-3 border-t border-zinc-200 dark:border-zinc-800 space-y-3">
                <audio
                  controls
                  src={recordedUrl}
                  className="w-full h-9"
                />
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void handleTranscribe()}
                    disabled={isTranscribing}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium bg-zinc-900 dark:bg-white text-white dark:text-zinc-950 hover:opacity-90 disabled:opacity-50 transition-opacity cursor-pointer"
                  >
                    {isTranscribing ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Mic className="w-3.5 h-3.5" />
                    )}
                    <span>
                      {isTranscribing
                        ? "Transcribiendo audio..."
                        : "Transcribir audio"}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => void handleAddAudioTrack()}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
                  >
                    <FileAudio className="w-3.5 h-3.5" />
                    <span>Agregar audio al reproductor</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Transcription Editor */}
          {(transcript || recordedBlob) && (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Título de la transcripción..."
                  className="flex-1 px-3 py-2 text-sm rounded-lg bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                />
                <button
                  type="button"
                  onClick={() => void handleCopy()}
                  disabled={!transcript}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-zinc-700 disabled:opacity-40 cursor-pointer"
                >
                  {copied ? (
                    <Check className="w-3.5 h-3.5 text-emerald-500" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                  <span>{copied ? "Copiado" : "Copiar"}</span>
                </button>
                <button
                  type="button"
                  onClick={() => void handleSave()}
                  disabled={!transcript.trim() || isSaving}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium bg-amber-600 hover:bg-amber-500 text-white disabled:opacity-40 cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{isSaving ? "Guardando..." : "Guardar"}</span>
                </button>
              </div>

              <textarea
                rows={5}
                value={transcript}
                onChange={(e) => setTranscript(e.target.value)}
                placeholder="Aquí aparecerá la transcripción de tu grabación..."
                className="w-full p-3.5 text-sm rounded-lg bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 leading-relaxed focus:outline-none focus:ring-2 focus:ring-amber-500/50"
              />
            </div>
          )}

          {/* Saved Transcriptions History */}
          {savedTranscriptions.length > 0 && (
            <div className="space-y-3 pt-2 border-t border-zinc-200 dark:border-zinc-800">
              <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                Transcripciones guardadas ({savedTranscriptions.length})
              </div>
              <div className="space-y-2">
                {savedTranscriptions.map((item) => (
                  <div
                    key={item.id}
                    className="p-3.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-900/40 space-y-1.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                        {item.title}
                        <span className="font-normal text-zinc-500 dark:text-zinc-400">
                          {" "}
                          · {formatTime(item.durationSec)}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => void onDeleteTranscription(item.id)}
                        aria-label={`Eliminar ${item.title}`}
                        className="p-1 text-zinc-400 hover:text-red-500 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <p className="text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed whitespace-pre-wrap">
                      {item.text}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
