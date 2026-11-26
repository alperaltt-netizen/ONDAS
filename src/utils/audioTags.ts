const AUDIO_EXTENSIONS = new Set([
  ".mp3",
  ".mp2",
  ".mp1",
  ".m4a",
  ".m4b",
  ".m4p",
  ".m4r",
  ".mp4",
  ".aac",
  ".adts",
  ".wav",
  ".wave",
  ".bwf",
  ".flac",
  ".ogg",
  ".oga",
  ".opus",
  ".spx",
  ".wma",
  ".asf",
  ".aiff",
  ".aif",
  ".aifc",
  ".alac",
  ".caf",
  ".ape",
  ".wv",
  ".mpc",
  ".amr",
  ".3gp",
  ".3g2",
  ".webm",
  ".mka",
  ".ac3",
  ".eac3",
  ".dts",
]);

export const AUDIO_ACCEPT_STRING =
  "audio/*,.mp3,.mp2,.m4a,.m4b,.m4p,.mp4,.aac,.wav,.wave,.flac,.ogg,.oga,.opus,.spx,.wma,.aiff,.aif,.aifc,.alac,.caf,.ape,.wv,.mpc,.amr,.3gp,.webm,.mka,.ac3";

export function isAudioFile(file: File): boolean {
  if (file.type && file.type.startsWith("audio/")) {
    return true;
  }
  const lower = file.name.toLowerCase();
  for (const ext of AUDIO_EXTENSIONS) {
    if (lower.endsWith(ext)) return true;
  }
  return false;
}

export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "00:00";
  const totalSec = Math.floor(seconds);
  const hrs = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  const mm = String(mins).padStart(2, "0");
  const ss = String(secs).padStart(2, "0");
  if (hrs > 0) {
    return `${hrs}:${mm}:${ss}`;
  }
  return `${mm}:${ss}`;
}

export function formatTotalDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0 min";
  const totalMins = Math.round(seconds / 60);
  if (totalMins < 60) return `${Math.max(1, totalMins)} min`;
  const hrs = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  return mins > 0 ? `${hrs} h ${mins} min` : `${hrs} h`;
}

function cleanTitleFromFilename(fileName: string): string {
  const withoutExt = fileName.replace(/\.[^/.]+$/, "");
  return withoutExt.replace(/[_]+/g, " ").replace(/\s+/g, " ").trim();
}

function decodeTextFrame(bytes: Uint8Array): string {
  if (bytes.length === 0) return "";
  const encoding = bytes[0];
  const payload = bytes.slice(1);
  try {
    if (encoding === 1 || encoding === 2) {
      const decoder = new TextDecoder(encoding === 1 ? "utf-16" : "utf-16be");
      return decoder.decode(payload).replace(/\0/g, "").trim();
    }
    if (encoding === 3) {
      return new TextDecoder("utf-8").decode(payload).replace(/\0/g, "").trim();
    }
    return new TextDecoder("iso-8859-1").decode(payload).replace(/\0/g, "").trim();
  } catch {
    return "";
  }
}

function parseApicFrame(bytes: Uint8Array): Blob | null {
  if (bytes.length < 4) return null;
  const encoding = bytes[0];
  let offset = 1;
  let mimeEnd = offset;
  while (mimeEnd < bytes.length && bytes[mimeEnd] !== 0) {
    mimeEnd++;
  }
  const mime =
    new TextDecoder("ascii")
      .decode(bytes.slice(offset, mimeEnd))
      .trim() || "image/jpeg";
  offset = mimeEnd + 1;
  if (offset >= bytes.length) return null;
  offset += 1;
  if (encoding === 1 || encoding === 2) {
    while (offset + 1 < bytes.length) {
      if (bytes[offset] === 0 && bytes[offset + 1] === 0) {
        offset += 2;
        break;
      }
      offset += 2;
    }
  } else {
    while (offset < bytes.length && bytes[offset] !== 0) {
      offset++;
    }
    offset += 1;
  }
  if (offset >= bytes.length) return null;
  const imageBytes = bytes.slice(offset);
  if (imageBytes.length < 64) return null;
  return new Blob([imageBytes], {
    type: mime.includes("/") ? mime : "image/jpeg",
  });
}

function readSyncSafeInt(view: DataView, offset: number): number {
  return (
    ((view.getUint8(offset) & 0x7f) << 21) |
    ((view.getUint8(offset + 1) & 0x7f) << 14) |
    ((view.getUint8(offset + 2) & 0x7f) << 7) |
    (view.getUint8(offset + 3) & 0x7f)
  );
}

function parseFlacMetadata(
  bytes: Uint8Array,
  view: DataView,
  result: ParsedAudioMeta
): void {
  let offset = 4; // after 'fLaC'
  while (offset + 4 <= bytes.length) {
    const headerByte = bytes[offset];
    const isLast = (headerByte & 0x80) !== 0;
    const blockType = headerByte & 0x7f;
    const blockSize =
      (bytes[offset + 1] << 16) |
      (bytes[offset + 2] << 8) |
      bytes[offset + 3];
    offset += 4;
    if (offset + blockSize > bytes.length) break;

    if (blockType === 4) {
      // VORBIS_COMMENT
      try {
        let pos = offset;
        const vendorLen = view.getUint32(pos, true);
        pos += 4 + vendorLen;
        if (pos + 4 <= offset + blockSize) {
          const count = view.getUint32(pos, true);
          pos += 4;
          const utf8 = new TextDecoder("utf-8");
          for (let i = 0; i < count && pos + 4 <= offset + blockSize; i++) {
            const len = view.getUint32(pos, true);
            pos += 4;
            if (pos + len > offset + blockSize) break;
            const entry = utf8.decode(bytes.slice(pos, pos + len));
            pos += len;
            const eq = entry.indexOf("=");
            if (eq > 0) {
              const key = entry.slice(0, eq).toUpperCase();
              const val = entry.slice(eq + 1).trim();
              if (key === "TITLE" && val) result.title = val;
              else if (key === "ARTIST" && val) result.artist = val;
              else if (key === "ALBUM" && val) result.album = val;
            }
          }
        }
      } catch {
        // Ignore malformed vorbis comment
      }
    } else if (blockType === 6 && !result.coverBlob) {
      // PICTURE block
      try {
        let pos = offset + 4; // skip picture type
        const mimeLen = view.getUint32(pos, false);
        pos += 4;
        const mime = new TextDecoder("ascii").decode(
          bytes.slice(pos, pos + mimeLen)
        );
        pos += mimeLen;
        const descLen = view.getUint32(pos, false);
        pos += 4 + descLen + 16; // skip width, height, depth, colors
        const dataLen = view.getUint32(pos, false);
        pos += 4;
        if (pos + dataLen <= offset + blockSize && dataLen > 64) {
          result.coverBlob = new Blob([bytes.slice(pos, pos + dataLen)], {
            type: mime || "image/jpeg",
          });
        }
      } catch {
        // Ignore malformed picture block
      }
    }

    offset += blockSize;
    if (isLast) break;
  }
}

function parseMp4Ilst(
  bytes: Uint8Array,
  view: DataView,
  result: ParsedAudioMeta
): void {
  const utf8 = new TextDecoder("utf-8");

  function findBox(
    start: number,
    end: number,
    target: string
  ): { start: number; end: number } | null {
    let pos = start;
    while (pos + 8 <= end) {
      const size = view.getUint32(pos, false);
      if (size < 8 || pos + size > end) break;
      const name = String.fromCharCode(
        bytes[pos + 4],
        bytes[pos + 5],
        bytes[pos + 6],
        bytes[pos + 7]
      );
      if (name === target) {
        return { start: pos + 8, end: pos + size };
      }
      pos += size;
    }
    return null;
  }

  const moov = findBox(0, bytes.length, "moov");
  if (!moov) return;
  const udta = findBox(moov.start, moov.end, "udta");
  if (!udta) return;
  const meta = findBox(udta.start, udta.end, "meta");
  if (!meta) return;
  // meta box has 4-byte version/flags header before children
  const ilst = findBox(meta.start + 4, meta.end, "ilst");
  if (!ilst) return;

  let pos = ilst.start;
  while (pos + 8 <= ilst.end) {
    const size = view.getUint32(pos, false);
    if (size < 8 || pos + size > ilst.end) break;
    const atomName = String.fromCharCode(
      bytes[pos + 4],
      bytes[pos + 5],
      bytes[pos + 6],
      bytes[pos + 7]
    );
    const dataBox = findBox(pos + 8, pos + size, "data");
    if (dataBox && dataBox.start + 8 < dataBox.end) {
      const typeFlag = view.getUint32(dataBox.start, false) & 0xffffff;
      const payload = bytes.slice(dataBox.start + 8, dataBox.end);
      if (atomName === "\xa9nam" && typeFlag === 1) {
        const val = utf8.decode(payload).trim();
        if (val) result.title = val;
      } else if (atomName === "\xa9ART" && typeFlag === 1) {
        const val = utf8.decode(payload).trim();
        if (val) result.artist = val;
      } else if (atomName === "\xa9alb" && typeFlag === 1) {
        const val = utf8.decode(payload).trim();
        if (val) result.album = val;
      } else if (atomName === "covr" && !result.coverBlob && payload.length > 64) {
        const mime = typeFlag === 14 ? "image/png" : "image/jpeg";
        result.coverBlob = new Blob([payload], { type: mime });
      }
    }
    pos += size;
  }
}

export interface ParsedAudioMeta {
  title: string;
  artist: string;
  album: string;
  coverBlob: Blob | null;
}

export async function parseAudioMetadata(
  file: File,
  folderName: string
): Promise<ParsedAudioMeta> {
  const fallbackTitle = cleanTitleFromFilename(file.name);
  const result: ParsedAudioMeta = {
    title: fallbackTitle || file.name,
    artist: folderName || "Audio local",
    album: folderName || "",
    coverBlob: null,
  };

  try {
    const sliceSize = Math.min(file.size, 1024 * 1024);
    const buffer = await file.slice(0, sliceSize).arrayBuffer();
    const bytes = new Uint8Array(buffer);
    const view = new DataView(buffer);

    // 1. ID3v2 (MP3 / WAV / AAC)
    if (
      bytes.length > 10 &&
      bytes[0] === 0x49 &&
      bytes[1] === 0x44 &&
      bytes[2] === 0x33
    ) {
      const version = bytes[3];
      const tagSize = readSyncSafeInt(view, 6);
      const limit = Math.min(bytes.length, 10 + tagSize);
      let offset = 10;

      if ((bytes[5] & 0x40) !== 0 && offset + 4 <= limit) {
        const extSize =
          version === 4
            ? readSyncSafeInt(view, offset)
            : view.getUint32(offset);
        offset += extSize;
      }

      while (offset + 10 <= limit) {
        const frameId = String.fromCharCode(
          bytes[offset],
          bytes[offset + 1],
          bytes[offset + 2],
          bytes[offset + 3]
        );
        if (!/^[A-Z0-9]{4}$/.test(frameId)) break;

        const frameSize =
          version === 4
            ? readSyncSafeInt(view, offset + 4)
            : view.getUint32(offset + 4);
        offset += 10;
        if (frameSize <= 0 || offset + frameSize > limit) break;

        const frameData = bytes.slice(offset, offset + frameSize);
        if (frameId === "TIT2") {
          const val = decodeTextFrame(frameData);
          if (val) result.title = val;
        } else if (frameId === "TPE1") {
          const val = decodeTextFrame(frameData);
          if (val) result.artist = val;
        } else if (frameId === "TALB") {
          const val = decodeTextFrame(frameData);
          if (val) result.album = val;
        } else if (frameId === "APIC" && !result.coverBlob) {
          result.coverBlob = parseApicFrame(frameData);
        }

        offset += frameSize;
      }
      return result;
    }

    // 2. FLAC ('fLaC')
    if (
      bytes.length > 8 &&
      bytes[0] === 0x66 &&
      bytes[1] === 0x4c &&
      bytes[2] === 0x61 &&
      bytes[3] === 0x43
    ) {
      parseFlacMetadata(bytes, view, result);
      return result;
    }

    // 3. MP4 / M4A / M4B ('ftyp')
    if (
      bytes.length > 12 &&
      bytes[4] === 0x66 &&
      bytes[5] === 0x74 &&
      bytes[6] === 0x79 &&
      bytes[7] === 0x70
    ) {
      parseMp4Ilst(bytes, view, result);
      return result;
    }
  } catch {
    // Use clean filename fallbacks if tag parsing fails
  }

  return result;
}

// Convert uncompressed AIFF (.aif/.aiff) into standard browser-playable WAV Blob
export async function convertAiffToWavIfNeeded(blob: Blob, fileName: string): Promise<Blob> {
  const lower = fileName.toLowerCase();
  if (!lower.endsWith(".aiff") && !lower.endsWith(".aif")) {
    return blob;
  }
  try {
    const buffer = await blob.arrayBuffer();
    const view = new DataView(buffer);
    const bytes = new Uint8Array(buffer);
    const tag = (off: number) =>
      String.fromCharCode(bytes[off], bytes[off + 1], bytes[off + 2], bytes[off + 3]);

    if (tag(0) !== "FORM" || tag(8) !== "AIFF") {
      return blob;
    }

    let offset = 12;
    let channels = 2;
    let numSampleFrames = 0;
    let sampleSize = 16;
    let sampleRate = 44100;
    let soundDataOffset = 0;
    let soundDataLen = 0;

    while (offset + 8 <= buffer.byteLength) {
      const chunkId = tag(offset);
      const chunkSize = view.getUint32(offset + 4, false);
      const dataStart = offset + 8;
      if (chunkId === "COMM" && chunkSize >= 18) {
        channels = view.getInt16(dataStart, false);
        numSampleFrames = view.getUint32(dataStart + 2, false);
        sampleSize = view.getInt16(dataStart + 6, false);
        // Decode 80-bit IEEE 754 extended float sample rate
        const exp = ((view.getUint8(dataStart + 8) & 0x7f) << 8) | view.getUint8(dataStart + 9);
        const hi = view.getUint32(dataStart + 10, false);
        sampleRate = Math.round(hi * Math.pow(2, exp - 16383 - 31));
      } else if (chunkId === "SSND") {
        const ssndOffset = view.getUint32(dataStart, false);
        soundDataOffset = dataStart + 8 + ssndOffset;
        soundDataLen = chunkSize - 8 - ssndOffset;
      }
      offset += 8 + chunkSize + (chunkSize % 2);
    }

    if (!soundDataOffset || sampleSize !== 16 || numSampleFrames <= 0) {
      return blob;
    }

    const totalSamples = Math.min(
      numSampleFrames * channels,
      Math.floor(soundDataLen / 2)
    );
    const wavBuf = new ArrayBuffer(44 + totalSamples * 2);
    const wavView = new DataView(wavBuf);
    const writeStr = (o: number, s: string) => {
      for (let i = 0; i < s.length; i++) wavView.setUint8(o + i, s.charCodeAt(i));
    };
    writeStr(0, "RIFF");
    wavView.setUint32(4, 36 + totalSamples * 2, true);
    writeStr(8, "WAVE");
    writeStr(12, "fmt ");
    wavView.setUint32(16, 16, true);
    wavView.setUint16(20, 1, true);
    wavView.setUint16(22, channels, true);
    wavView.setUint32(24, sampleRate, true);
    wavView.setUint32(28, sampleRate * channels * 2, true);
    wavView.setUint16(32, channels * 2, true);
    wavView.setUint16(34, 16, true);
    writeStr(36, "data");
    wavView.setUint32(40, totalSamples * 2, true);

    for (let i = 0; i < totalSamples; i++) {
      const sample = view.getInt16(soundDataOffset + i * 2, false);
      wavView.setInt16(44 + i * 2, sample, true);
    }

    return new Blob([wavBuf], { type: "audio/wav" });
  } catch {
    return blob;
  }
}

// Fallback transcode via Web Audio API if native <audio> element cannot play the container
export async function transcodeViaWebAudioToWav(blob: Blob): Promise<Blob | null> {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtx) return null;
    const ctx = new AudioCtx();
    const arrayBuffer = await blob.arrayBuffer();
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
    await ctx.close();

    const numChannels = Math.min(2, audioBuffer.numberOfChannels);
    const length = audioBuffer.length;
    const sampleRate = audioBuffer.sampleRate;
    const interleaved = new Float32Array(length * numChannels);

    for (let ch = 0; ch < numChannels; ch++) {
      const channelData = audioBuffer.getChannelData(ch);
      for (let i = 0; i < length; i++) {
        interleaved[i * numChannels + ch] = channelData[i];
      }
    }

    const buffer = new ArrayBuffer(44 + interleaved.length * 2);
    const view = new DataView(buffer);
    const writeStr = (o: number, s: string) => {
      for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i));
    };

    writeStr(0, "RIFF");
    view.setUint32(4, 36 + interleaved.length * 2, true);
    writeStr(8, "WAVE");
    writeStr(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numChannels * 2, true);
    view.setUint16(32, numChannels * 2, true);
    view.setUint16(34, 16, true);
    writeStr(36, "data");
    view.setUint32(40, interleaved.length * 2, true);

    let offset = 44;
    for (let i = 0; i < interleaved.length; i++) {
      const clamped = Math.max(-1, Math.min(1, interleaved[i]));
      view.setInt16(
        offset,
        clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff,
        true
      );
      offset += 2;
    }

    return new Blob([buffer], { type: "audio/wav" });
  } catch {
    return null;
  }
}

export async function probeAudioDuration(file: Blob): Promise<number> {
  return new Promise((resolve) => {
    const audio = document.createElement("audio");
    const url = URL.createObjectURL(file);
    let settled = false;

    const finish = (dur: number) => {
      if (settled) return;
      settled = true;
      URL.revokeObjectURL(url);
      audio.src = "";
      resolve(Number.isFinite(dur) && dur > 0 ? dur : 0);
    };

    const timer = window.setTimeout(() => finish(0), 4000);
    audio.preload = "metadata";
    audio.onloadedmetadata = () => {
      window.clearTimeout(timer);
      finish(audio.duration);
    };
    audio.onerror = () => {
      window.clearTimeout(timer);
      finish(0);
    };
    audio.src = url;
  });
}

export interface ImportedFileEntry {
  file: File;
  folderName: string;
}

export async function extractFilesFromDataTransfer(
  dataTransfer: DataTransfer
): Promise<ImportedFileEntry[]> {
  const entries: FileSystemEntry[] = [];
  if (dataTransfer.items) {
    for (let i = 0; i < dataTransfer.items.length; i++) {
      const entry = dataTransfer.items[i].webkitGetAsEntry?.();
      if (entry) entries.push(entry);
    }
  }

  if (entries.length === 0) {
    const files = Array.from(dataTransfer.files).filter(isAudioFile);
    return files.map((file) => ({
      file,
      folderName: "Archivos locales",
    }));
  }

  const collected: ImportedFileEntry[] = [];

  async function walkEntry(
    entry: FileSystemEntry,
    parentFolder: string
  ): Promise<void> {
    if (entry.isFile) {
      const fileEntry = entry as FileSystemFileEntry;
      await new Promise<void>((resolve) => {
        fileEntry.file(
          (file) => {
            if (isAudioFile(file)) {
              collected.push({
                file,
                folderName: parentFolder || "Archivos locales",
              });
            }
            resolve();
          },
          () => resolve()
        );
      });
    } else if (entry.isDirectory) {
      const dirEntry = entry as FileSystemDirectoryEntry;
      const reader = dirEntry.createReader();
      const readAll = async (): Promise<FileSystemEntry[]> => {
        const all: FileSystemEntry[] = [];
        while (true) {
          const batch = await new Promise<FileSystemEntry[]>((resolve) => {
            reader.readEntries(
              (res) => resolve(res),
              () => resolve([])
            );
          });
          if (batch.length === 0) break;
          all.push(...batch);
        }
        return all;
      };

      const children = await readAll();
      for (const child of children) {
        await walkEntry(child, dirEntry.name);
      }
    }
  }

  for (const entry of entries) {
    await walkEntry(entry, "");
  }

  return collected;
}

function encodeWavFromSamples(samples: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeStr(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, samples.length * 2, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(
      offset,
      clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff,
      true
    );
    offset += 2;
  }

  return new Blob([buffer], { type: "audio/wav" });
}

function synthesizeAmbientPodcastTrack(
  freqs: number[],
  durationSec: number
): Blob {
  const sampleRate = 22050;
  const totalSamples = sampleRate * durationSec;
  const samples = new Float32Array(totalSamples);

  for (let i = 0; i < totalSamples; i++) {
    const t = i / sampleRate;
    const envelope =
      Math.min(1, t / 0.8) * Math.min(1, (durationSec - t) / 1.2);
    const pulse = 0.72 + 0.28 * Math.sin((2 * Math.PI * t) / 4);
    let val = 0;
    freqs.forEach((freq, idx) => {
      const detune = Math.sin(t * (0.4 + idx * 0.17)) * 1.5;
      val += Math.sin(2 * Math.PI * (freq + detune) * t) / freqs.length;
    });
    samples[i] = val * envelope * pulse * 0.28;
  }

  return encodeWavFromSamples(samples, sampleRate);
}

export interface DemoEpisodeSeed {
  title: string;
  artist: string;
  album: string;
  folderName: string;
  fileName: string;
  duration: number;
  initialTime: number;
  audioBlob: Blob;
  coverUrl: string;
}

export async function buildDemoEpisodes(): Promise<DemoEpisodeSeed[]> {
  return [
    {
      title: "Episodio 01: Diseño de interfaces sonoras",
      artist: "Frecuencia Nocturna",
      album: "Temporada 2",
      folderName: "Podcasts de Diseño",
      fileName: "ep01_diseno_interfaces.wav",
      duration: 42,
      initialTime: 14,
      audioBlob: synthesizeAmbientPodcastTrack([196, 246.94, 293.66], 42),
      coverUrl: "/src/assets/images/cover_podcast_studio_1795703674238.jpg",
    },
    {
      title: "Episodio 02: Arquitectura acústica y foco",
      artist: "Frecuencia Nocturna",
      album: "Temporada 2",
      folderName: "Podcasts de Diseño",
      fileName: "ep02_arquitectura_acustica.wav",
      duration: 36,
      initialTime: 0,
      audioBlob: synthesizeAmbientPodcastTrack([174.61, 220, 261.63], 36),
      coverUrl: "/src/assets/images/cover_night_broadcast_1795703674545.jpg",
    },
    {
      title: "Sesión de estudio: Cinta analógica en vivo",
      artist: "Cuadernos de Campo",
      album: "Archivo Abierto",
      folderName: "Sesiones en Vivo",
      fileName: "sesion_cinta_analogica.wav",
      duration: 48,
      initialTime: 0,
      audioBlob: synthesizeAmbientPodcastTrack([146.83, 220, 293.66], 48),
      coverUrl: "/src/assets/images/cover_field_notes_1795703675502.jpg",
    },
  ];
}
