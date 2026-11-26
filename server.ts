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
      `${query}${extraSuffix}`.trim()
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
