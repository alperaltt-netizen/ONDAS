import "dotenv/config";
import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenAI } from "@google/genai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;
const HOST = "127.0.0.1";

type CoverSourceKey = "google" | "amazon" | "deezer" | "apple" | "musicbrainz";

interface CoverResult {
  url: string;
  title: string;
  source: string;
  sourceKey: CoverSourceKey;
}

function getGenAIClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

function isSafeExternalUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return false;
    }
    const host = parsed.hostname.toLowerCase();
    if (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "0.0.0.0" ||
      host === "::1" ||
      host.endsWith(".local") ||
      host.startsWith("10.") ||
      host.startsWith("192.168.") ||
      host.startsWith("169.254.") ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs = 4500
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function extractMetaImageFromHtml(html: string, baseUrl: string): string[] {
  const candidates: string[] = [];
  const patterns = [
    /<meta[^>]+(?:property|name)=["'](?:og:image|og:image:secure_url|twitter:image|twitter:image:src)["'][^>]+content=["']([^"']+)["']/gi,
    /<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:og:image|og:image:secure_url|twitter:image|twitter:image:src)["']/gi,
  ];
  for (const regex of patterns) {
    let match: RegExpExecArray | null;
    while ((match = regex.exec(html)) !== null) {
      const raw = match[1]?.replace(/&amp;/g, "&").trim();
      if (!raw) continue;
      try {
        const resolved = new URL(raw, baseUrl).toString();
        if (isSafeExternalUrl(resolved)) {
          candidates.push(resolved);
        }
      } catch {
        // Ignore malformed URLs
      }
    }
  }
  return candidates;
}

async function searchViaGeminiGoogleSearch(
  query: string,
  includeAmazon = false
): Promise<CoverResult[]> {
  const ai = getGenAIClient();
  if (!ai) return [];

  try {
    const prompt = includeAmazon
      ? `Busca en Google y Amazon la portada oficial de "${query}" (en Amazon Music, Audible, libros, álbumes o podcasts). Responde brevemente.`
      : `Busca en Google la portada oficial del podcast, audiolibro, álbum o autor: "${query}". Responde brevemente indicando el título oficial y autor.`;

    const response = await ai.models.generateContent({
      model: "gemini-4-hydrogen",
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
      },
    });

    const chunks =
      response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
    const webUrls = chunks
      .map((chunk) => ({
        uri: chunk.web?.uri ?? "",
        title: chunk.web?.title ?? query,
      }))
      .filter((item) => item.uri && isSafeExternalUrl(item.uri))
      .slice(0, 6);

    const results: CoverResult[] = [];
    await Promise.all(
      webUrls.map(async (item) => {
        try {
          const res = await fetchWithTimeout(
            item.uri,
            {
              headers: {
                "User-Agent":
                  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
                Accept: "text/html,application/xhtml+xml",
              },
              redirect: "follow",
            },
            3500
          );
          if (!res.ok) return;
          const contentType = res.headers.get("content-type") ?? "";
          if (!contentType.includes("text/html")) return;
          const html = await res.text();
          const imgs = extractMetaImageFromHtml(html.slice(0, 120_000), item.uri);
          const isAmazonUrl =
            item.uri.includes("amazon.") || item.uri.includes("audible.");
          for (const imgUrl of imgs.slice(0, 2)) {
            results.push({
              url: imgUrl,
              title: item.title,
              source: isAmazonUrl ? "Amazon / Audible" : "Google Search",
              sourceKey: isAmazonUrl ? "amazon" : "google",
            });
          }
        } catch {
          // Ignore individual page timeouts
        }
      })
    );

    return results;
  } catch {
    return [];
  }
}

async function searchViaGoogleImagesHtml(
  query: string,
  extraSuffix = "portada cover"
): Promise<CoverResult[]> {
  try {
    const searchUrl = `https://www.google.com/search?tbm=isch&hl=es&q=${encodeURIComponent(
      `${query} ${extraSuffix}`.trim()
    )}`;
    const res = await fetchWithTimeout(
      searchUrl,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
          "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
        },
      },
      4500
    );
    if (!res.ok) return [];
    const html = await res.text();

    const results: CoverResult[] = [];
    const seen = new Set<string>();

    const directRegex =
      /https?:\/\/[^"'\s<>\\]+?\.(?:jpg|jpeg|png|webp)(?:\?[^"'\s<>\\]*)?/gi;
    let match: RegExpExecArray | null;
    while ((match = directRegex.exec(html)) !== null && results.length < 8) {
      const candidate = match[0]
        .replace(/\\u003d/g, "=")
        .replace(/\\u0026/g, "&");
      if (
        candidate.includes("google.com") ||
        candidate.includes("gstatic.com") ||
        candidate.includes("googleusercontent.com/logos") ||
        !isSafeExternalUrl(candidate) ||
        seen.has(candidate)
      ) {
        continue;
      }
      seen.add(candidate);
      const isAmazonCdn = candidate.includes("media-amazon.com");
      results.push({
        url: candidate,
        title: query,
        source: isAmazonCdn ? "Amazon (vía Google)" : "Google Imágenes",
        sourceKey: isAmazonCdn ? "amazon" : "google",
      });
    }

    const thumbRegex =
      /https:\/\/encrypted-tbn0\.gstatic\.com\/images\?q=[^"'\s<>\\]+/gi;
    while ((match = thumbRegex.exec(html)) !== null && results.length < 12) {
      const candidate = match[0]
        .replace(/\\u003d/g, "=")
        .replace(/\\u0026/g, "&")
        .replace(/&amp;/g, "&");
      if (seen.has(candidate)) continue;
      seen.add(candidate);
      results.push({
        url: candidate,
        title: query,
        source: "Google Imágenes",
        sourceKey: "google",
      });
    }

    return results;
  } catch {
    return [];
  }
}

async function searchViaAmazonAndAudible(query: string): Promise<CoverResult[]> {
  const results: CoverResult[] = [];
  const seen = new Set<string>();

  const extractAmazonImages = (html: string, sourceLabel: string) => {
    const regex =
      /https:\/\/m\.media-amazon\.com\/images\/I\/[A-Za-z0-9+_-]+(?:\._[^"'\s<>]+)?\.(?:jpg|jpeg|png|webp)/gi;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(html)) !== null && results.length < 10) {
      let imgUrl = match[0];
      imgUrl = imgUrl.replace(/\._[A-Z0-9_,]+_\./i, "._SL600_.");
      if (
        imgUrl.includes("sprite") ||
        imgUrl.includes("transparent") ||
        imgUrl.includes("_SS40_") ||
        seen.has(imgUrl)
      ) {
        continue;
      }
      seen.add(imgUrl);
      results.push({
        url: imgUrl,
        title: query,
        source: sourceLabel,
        sourceKey: "amazon",
      });
    }
  };

  await Promise.all([
    (async () => {
      try {
        const res = await fetchWithTimeout(
          `https://www.amazon.com/s?k=${encodeURIComponent(query)}`,
          {
            headers: {
              "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
              "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
            },
          },
          4500
        );
        if (res.ok) {
          extractAmazonImages(await res.text(), "Amazon");
        }
      } catch {
        // Ignore Amazon direct block/timeout; Google/Audible fallback covers it
      }
    })(),
    (async () => {
      try {
        const res = await fetchWithTimeout(
          `https://www.audible.com/search?keywords=${encodeURIComponent(query)}`,
          {
            headers: {
              "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
            },
          },
          4500
        );
        if (res.ok) {
          extractAmazonImages(await res.text(), "Audible (Amazon)");
        }
      } catch {
        // Ignore Audible timeout
      }
    })(),
    (async () => {
      const amazonViaGoogle = await searchViaGoogleImagesHtml(
        query,
        "site:amazon.com OR site:amazon.es OR site:audible.com"
      );
      for (const item of amazonViaGoogle) {
        if (!seen.has(item.url) && results.length < 12) {
          seen.add(item.url);
          results.push({
            ...item,
            source: "Amazon",
            sourceKey: "amazon",
          });
        }
      }
    })(),
  ]);

  return results;
}

async function searchViaDeezer(
  query: string,
  byAuthorOnly: boolean
): Promise<CoverResult[]> {
  const results: CoverResult[] = [];
  try {
    const endpoint = byAuthorOnly
      ? `https://api.deezer.com/search/artist?q=${encodeURIComponent(query)}&limit=5`
      : `https://api.deezer.com/search/album?q=${encodeURIComponent(query)}&limit=6`;

    const res = await fetchWithTimeout(endpoint, {}, 4000);
    if (res.ok) {
      const data = (await res.json()) as {
        data?: Array<{
          title?: string;
          name?: string;
          cover_xl?: string;
          cover_big?: string;
          picture_xl?: string;
          picture_big?: string;
          artist?: { name?: string; picture_xl?: string };
        }>;
      };
      for (const item of data.data ?? []) {
        const img =
          item.cover_xl ||
          item.cover_big ||
          item.picture_xl ||
          item.picture_big ||
          item.artist?.picture_xl;
        if (img && isSafeExternalUrl(img)) {
          results.push({
            url: img,
            title: item.title
              ? `${item.title}${item.artist?.name ? ` — ${item.artist.name}` : ""}`
              : item.name || query,
            source: "Deezer",
            sourceKey: "deezer",
          });
        }
      }
    }

    if (byAuthorOnly) {
      const albRes = await fetchWithTimeout(
        `https://api.deezer.com/search/album?q=artist:"${encodeURIComponent(
          query
        )}"&limit=6`,
        {},
        4000
      );
      if (albRes.ok) {
        const albData = (await albRes.json()) as {
          data?: Array<{
            title?: string;
            cover_xl?: string;
            cover_big?: string;
            artist?: { name?: string };
          }>;
        };
        for (const item of albData.data ?? []) {
          const img = item.cover_xl || item.cover_big;
          if (img && isSafeExternalUrl(img)) {
            results.push({
              url: img,
              title: `${item.title ?? query}${
                item.artist?.name ? ` — ${item.artist.name}` : ""
              }`,
              source: "Deezer",
              sourceKey: "deezer",
            });
          }
        }
      }
    }
  } catch {
    // Ignore Deezer errors
  }
  return results;
}

async function searchViaItunesCatalog(
  query: string,
  byAuthorOnly: boolean
): Promise<CoverResult[]> {
  const results: CoverResult[] = [];
  const attrParam = byAuthorOnly ? "&attribute=authorTerm" : "";
  const musicAttr = byAuthorOnly ? "&attribute=artistTerm" : "";

  try {
    const [podRes, musicRes, bookRes] = await Promise.all([
      fetchWithTimeout(
        `https://itunes.apple.com/search?term=${encodeURIComponent(
          query
        )}&media=podcast${attrParam}&limit=5`
      ),
      fetchWithTimeout(
        `https://itunes.apple.com/search?term=${encodeURIComponent(
          query
        )}&media=music&entity=album${musicAttr}&limit=5`
      ),
      fetchWithTimeout(
        `https://itunes.apple.com/search?term=${encodeURIComponent(
          query
        )}&media=audiobook${attrParam}&limit=4`
      ),
    ]);

    const parseItems = async (res: Response, label: string) => {
      if (!res.ok) return;
      const data = (await res.json()) as {
        results?: Array<{
          artworkUrl600?: string;
          artworkUrl100?: string;
          collectionName?: string;
          artistName?: string;
        }>;
      };
      for (const item of data.results ?? []) {
        const rawImg = item.artworkUrl600 ?? item.artworkUrl100;
        if (!rawImg) continue;
        const highRes = rawImg.replace("100x100bb", "600x600bb");
        if (isSafeExternalUrl(highRes)) {
          results.push({
            url: highRes,
            title: item.collectionName
              ? `${item.collectionName}${item.artistName ? ` — ${item.artistName}` : ""}`
              : item.artistName || query,
            source: label,
            sourceKey: "apple",
          });
        }
      }
    };

    await Promise.all([
      parseItems(podRes, "Apple Podcasts"),
      parseItems(musicRes, "Apple Music"),
      parseItems(bookRes, "Audiolibros"),
    ]);
  } catch {
    // Ignore iTunes network errors
  }
  return results;
}

async function searchViaMusicBrainz(
  query: string,
  byAuthorOnly: boolean
): Promise<CoverResult[]> {
  const results: CoverResult[] = [];
  try {
    const mbQuery = byAuthorOnly ? `artist:"${query}"` : query;
    const res = await fetchWithTimeout(
      `https://musicbrainz.org/ws/2/release/?query=${encodeURIComponent(
        mbQuery
      )}&limit=5&fmt=json`,
      {
        headers: {
          "User-Agent": "OndasAudioPlayer/1.0 (contact@ondas.local)",
        },
      },
      4000
    );
    if (!res.ok) return [];
    const data = (await res.json()) as {
      releases?: Array<{
        id: string;
        title?: string;
        "artist-credit"?: Array<{ name?: string }>;
      }>;
    };

    for (const rel of (data.releases ?? []).slice(0, 4)) {
      const artist = rel["artist-credit"]?.[0]?.name;
      const coverUrl = `https://coverartarchive.org/release/${rel.id}/front-500`;
      results.push({
        url: coverUrl,
        title: `${rel.title ?? query}${artist ? ` — ${artist}` : ""}`,
        source: "MusicBrainz",
        sourceKey: "musicbrainz",
      });
    }
  } catch {
    // Ignore MusicBrainz errors
  }
  return results;
}

function resolveDistPath(): string {
  const candidates = [
    path.resolve(__dirname, "dist"),
    path.resolve(__dirname, "../dist"),
    path.resolve(process.cwd(), "dist"),
    path.resolve(process.cwd(), "resources/app/dist"),
    path.resolve(process.cwd(), "resources/dist"),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, "index.html"))) {
      return candidate;
    }
  }
  return candidates[0];
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: "25mb" }));

  // Grounded audio/podcast info search via gemini-4-hydrogen + Google Search
  app.post("/api/audio/search-info", async (req, res) => {
    const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
    const artist = typeof req.body?.artist === "string" ? req.body.artist.trim() : "";
    const customQuery =
      typeof req.body?.customQuery === "string" ? req.body.customQuery.trim() : "";

    const searchSubject = customQuery || [title, artist].filter(Boolean).join(" — ");
    if (!searchSubject || searchSubject.length < 2) {
      res.status(400).json({ error: "Proporciona un título, artista o consulta válida." });
      return;
    }

    const ai = getGenAIClient();
    if (!ai) {
      res.status(503).json({
        error: "La clave de API de Gemini no está configurada en el servidor.",
      });
      return;
    }

    try {
      const response = await ai.models.generateContent({
        model: "gemini-4-hydrogen",
        contents: `Usa Google Search para obtener información actualizada y precisa en español sobre este podcast, episodio, audiolibro o artista/álbum: "${searchSubject}". Incluye una sinopsis breve, creador o anfitrión, datos relevantes y contexto.`,
        config: {
          tools: [{ googleSearch: {} }],
        },
      });

      const chunks =
        response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
      const sources: Array<{ uri: string; title: string }> = [];
      const seenUris = new Set<string>();
      for (const chunk of chunks) {
        const uri = chunk.web?.uri ?? "";
        const chunkTitle = chunk.web?.title ?? uri;
        if (uri && isSafeExternalUrl(uri) && !seenUris.has(uri)) {
          seenUris.add(uri);
          sources.push({ uri, title: chunkTitle });
        }
      }

      res.json({
        summary: response.text ?? "No se encontró información adicional.",
        sources,
      });
    } catch (err) {
      console.error("Search info error:", err);
      res.status(500).json({
        error: "No se pudo consultar Google Search en este momento.",
      });
    }
  });

  // Audio transcription endpoint using gemini-3.5-transcribe
  app.post("/api/audio/transcribe", async (req, res) => {
    const audioBase64 =
      typeof req.body?.audioBase64 === "string" ? req.body.audioBase64 : "";
    const rawMime =
      typeof req.body?.mimeType === "string" ? req.body.mimeType : "audio/webm";
    const cleanMime = rawMime.split(";")[0].trim() || "audio/webm";

    if (!audioBase64 || audioBase64.length < 32) {
      res.status(400).json({ error: "No se recibió audio válido para transcribir." });
      return;
    }
    if (!cleanMime.startsWith("audio/") && !cleanMime.startsWith("video/webm")) {
      res.status(400).json({ error: "Tipo MIME de audio no válido." });
      return;
    }

    const ai = getGenAIClient();
    if (!ai) {
      res.status(503).json({
        error: "La clave de API de Gemini no está configurada en el servidor.",
      });
      return;
    }

    try {
      const response = await ai.models.generateContent({
        model: "gemini-3.5-transcribe",
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: cleanMime === "video/webm" ? "audio/webm" : cleanMime,
                data: audioBase64,
              },
            },
            {
              text: "Transcribe este audio con exactitud en su idioma original, manteniendo puntuación clara y natural.",
            },
          ],
        },
      });

      res.json({
        text: (response.text ?? "").trim(),
      });
    } catch (err) {
      console.error("Transcription error:", err);
      res.status(500).json({
        error: "No se pudo transcribir el audio con Gemini.",
      });
    }
  });

  // Multi-source cover search: Google, Amazon/Audible, Deezer, Apple/iTunes, MusicBrainz
  app.post("/api/cover/search", async (req, res) => {
    const rawQuery =
      typeof req.body?.query === "string" ? req.body.query.trim() : "";
    const rawAuthor =
      typeof req.body?.author === "string" ? req.body.author.trim() : "";
    const mode =
      req.body?.mode === "author" || req.body?.mode === "title"
        ? (req.body.mode as "author" | "title")
        : "combined";

    const byAuthorOnly = mode === "author" && rawAuthor.length >= 2;
    const effectiveQuery =
      mode === "author"
        ? rawAuthor || rawQuery
        : mode === "title"
        ? rawQuery || rawAuthor
        : [rawQuery, rawAuthor].filter(Boolean).join(" ").trim();

    if (!effectiveQuery || effectiveQuery.length < 2) {
      res.status(400).json({
        error: "Escribe un título o un autor (mínimo 2 caracteres).",
      });
      return;
    }

    const googleImagesUrl = `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(
      `${effectiveQuery} portada`
    )}`;
    const amazonSearchUrl = `https://www.amazon.com/s?k=${encodeURIComponent(
      effectiveQuery
    )}`;

    try {
      const [
        googleImages,
        geminiSearch,
        amazonResults,
        deezerResults,
        appleResults,
        mbResults,
      ] = await Promise.all([
        searchViaGoogleImagesHtml(
          effectiveQuery,
          byAuthorOnly ? "autor podcast album portada" : "portada cover"
        ),
        searchViaGeminiGoogleSearch(effectiveQuery, true),
        searchViaAmazonAndAudible(effectiveQuery),
        searchViaDeezer(effectiveQuery, byAuthorOnly),
        searchViaItunesCatalog(effectiveQuery, byAuthorOnly),
        searchViaMusicBrainz(effectiveQuery, byAuthorOnly),
      ]);

      const buckets = [
        appleResults,
        amazonResults,
        deezerResults,
        geminiSearch,
        googleImages,
        mbResults,
      ];
      const merged: CoverResult[] = [];
      const maxLen = Math.max(...buckets.map((b) => b.length));
      for (let i = 0; i < maxLen; i++) {
        for (const bucket of buckets) {
          if (bucket[i]) merged.push(bucket[i]);
        }
      }

      const unique: CoverResult[] = [];
      const seen = new Set<string>();
      for (const item of merged) {
        if (!seen.has(item.url) && isSafeExternalUrl(item.url)) {
          seen.add(item.url);
          unique.push(item);
        }
      }

      res.json({
        results: unique.slice(0, 32),
        googleImagesUrl,
        amazonSearchUrl,
      });
    } catch (err) {
      console.error("Cover search error:", err);
      res.status(500).json({
        error: "No se pudo completar la búsqueda de portadas.",
        googleImagesUrl,
        amazonSearchUrl,
      });
    }
  });

  // Proxy & download cover image cleanly without browser CORS failures
  app.get("/api/cover/proxy", async (req, res) => {
    const rawUrl = typeof req.query.url === "string" ? req.query.url : "";
    const downloadName =
      typeof req.query.download === "string" ? req.query.download : "";

    if (!rawUrl || !isSafeExternalUrl(rawUrl)) {
      res.status(400).json({ error: "URL de imagen inválida o no permitida." });
      return;
    }

    try {
      const upstream = await fetchWithTimeout(
        rawUrl,
        {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
            Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
          },
          redirect: "follow",
        },
        7000
      );

      if (!upstream.ok) {
        res.status(502).json({ error: "No se pudo descargar la imagen origen." });
        return;
      }

      const contentType = upstream.headers.get("content-type") ?? "";
      if (!contentType.startsWith("image/")) {
        res.status(415).json({ error: "El recurso no es una imagen válida." });
        return;
      }

      const arrayBuffer = await upstream.arrayBuffer();
      if (arrayBuffer.byteLength === 0 || arrayBuffer.byteLength > 10 * 1024 * 1024) {
        res.status(413).json({ error: "La imagen excede el límite permitido." });
        return;
      }

      res.setHeader("Content-Type", contentType);
      res.setHeader("Cache-Control", "public, max-age=86400");
      if (downloadName) {
        const safeName = downloadName.replace(/[^a-zA-Z0-9._-]/g, "_");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="${safeName}"`
        );
      }
      res.send(Buffer.from(arrayBuffer));
    } catch {
      res.status(502).json({ error: "Error al obtener la portada." });
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = resolveDistPath();
    console.log("Serving static frontend from:", distPath);
    app.use(express.static(distPath));
    app.use((_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, HOST, () => {
    console.log(`Ondas server running at http://${HOST}:${PORT}`);
  });
}

startServer();
