// Client for a self-hosted LibreTranslate server (https://github.com/LibreTranslate/LibreTranslate).
// All content is written in English, so every request translates from "en".

import { getMany, putMany } from "./cache.js";

const BATCH_SIZE = 20;
// The first translation for a language can be slow while the server loads its model.
const TRANSLATE_TIMEOUT_MS = 60_000;
// Listing languages is instant on a healthy server, so fail fast when it doesn't answer.
const LANGUAGES_TIMEOUT_MS = 8_000;

export class TranslationError extends Error {
  constructor(kind, message) {
    super(message);
    this.kind = kind; // "unreachable" | "rate-limited" | "server"
  }
}

function baseUrl(serverUrl) {
  return serverUrl.trim().replace(/\/+$/, "");
}

async function request(url, options, fetchFn, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res;
  try {
    res = await fetchFn(url, { ...options, signal: controller.signal });
  } catch {
    throw new TranslationError(
      "unreachable",
      "Could not reach the translation server. Check that LibreTranslate is running and the server address in Settings is correct.",
    );
  } finally {
    clearTimeout(timer);
  }
  if (res.status === 429) {
    throw new TranslationError("rate-limited", "The translation server is rate-limiting requests. Wait a moment and retry.");
  }
  let body = null;
  try {
    body = await res.json();
  } catch {
    // handled below
  }
  if (!res.ok || body === null) {
    const detail = body && body.error ? `: ${body.error}` : "";
    throw new TranslationError("server", `The translation server returned an error (${res.status})${detail}`);
  }
  return body;
}

// Returns [{ code, name, targets }] as reported by the server.
export async function fetchLanguages(serverUrl, fetchFn = fetch) {
  return request(`${baseUrl(serverUrl)}/languages`, { method: "GET" }, fetchFn, LANGUAGES_TIMEOUT_MS);
}

// Translates an array of English texts in one request. Returns translations in the same order.
export async function translateBatch(texts, target, { serverUrl, apiKey = "" }, fetchFn = fetch) {
  const payload = { q: texts, source: "en", target, format: "text" };
  if (apiKey) payload.api_key = apiKey;
  const body = await request(
    `${baseUrl(serverUrl)}/translate`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) },
    fetchFn,
    TRANSLATE_TIMEOUT_MS,
  );
  const out = body.translatedText;
  if (!Array.isArray(out) || out.length !== texts.length) {
    throw new TranslationError("server", "The translation server sent an unexpected response.");
  }
  return out;
}

// Returns a Map of English text -> translation for `lang`, using the cache first and
// translating only what is missing, in batches. English needs no translation.
export async function ensureTranslations(texts, lang, settings, fetchFn = fetch) {
  const unique = [...new Set(texts)];
  if (lang === "en") return new Map(unique.map((t) => [t, t]));

  const result = await getMany(lang, unique);
  const missing = unique.filter((t) => !result.has(t));
  for (let i = 0; i < missing.length; i += BATCH_SIZE) {
    const chunk = missing.slice(i, i + BATCH_SIZE);
    const translated = await translateBatch(chunk, lang, settings, fetchFn);
    const fresh = new Map(chunk.map((t, j) => [t, translated[j]]));
    await putMany(lang, fresh);
    for (const [t, v] of fresh) result.set(t, v);
  }
  return result;
}
