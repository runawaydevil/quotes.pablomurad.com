import { emergencyQuotes } from "../data/emergency-quotes";
import type { Quote } from "../types/quote";

export const MANIFEST_URL = "/data/manifest.json";
export const DATA_BASE_URL = "/data/";

const FETCH_TIMEOUT_MS = 4000;
const CACHE_KEY = "a-good-line:last-quote";

export type QuoteSource = "fragment" | "cache" | "embedded";

export interface QuoteResult {
  quote: Quote;
  source: QuoteSource;
}

export interface FragmentEntry {
  file: string;
  count: number;
  firstIndex: number;
}

export interface QuoteManifest {
  total: number;
  fragments: FragmentEntry[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function asPositiveInt(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
}

function buildQuote(id: string, text: string, author: string): Quote {
  return { id, text, author };
}

export function normalizeFallback(entry: unknown): Quote | null {
  if (!isRecord(entry)) return null;
  const text = asNonEmptyString(entry.text);
  const author = asNonEmptyString(entry.author);
  const id = asNonEmptyString(entry.id);
  if (text === null || author === null || id === null) return null;
  return buildQuote(id, text, author);
}

/** Fragments must cover [0, total) with no gaps, or an index maps to the wrong quote. */
export function parseManifest(payload: unknown): QuoteManifest | null {
  if (!isRecord(payload)) return null;
  const total = asPositiveInt(payload.total);
  if (total === null || !Array.isArray(payload.fragments)) return null;

  const fragments: FragmentEntry[] = [];
  for (const raw of payload.fragments) {
    if (!isRecord(raw)) return null;
    const file = asNonEmptyString(raw.file);
    const count = asPositiveInt(raw.count);
    const firstIndex =
      typeof raw.firstIndex === "number" && Number.isInteger(raw.firstIndex) && raw.firstIndex >= 0
        ? raw.firstIndex
        : null;
    if (file === null || count === null || firstIndex === null) return null;
    fragments.push({ file, count, firstIndex });
  }

  fragments.sort((a, b) => a.firstIndex - b.firstIndex);
  let expected = 0;
  for (const fragment of fragments) {
    if (fragment.firstIndex !== expected) return null;
    expected += fragment.count;
  }
  return expected === total ? { total, fragments } : null;
}

export function fragmentEntryForIndex(
  manifest: QuoteManifest,
  index: number,
): FragmentEntry | null {
  if (!Number.isInteger(index) || index < 0 || index >= manifest.total) return null;
  return (
    manifest.fragments.find(
      (fragment) => index >= fragment.firstIndex && index < fragment.firstIndex + fragment.count,
    ) ?? null
  );
}

/** Uniform over [0, total). Exclude by redrawing among the rest — never pick a fragment first. */
export function pickRandomIndex(
  total: number,
  excludeIndex?: number,
  rng: () => number = Math.random,
): number {
  if (total <= 1) return 0;
  if (excludeIndex === undefined) {
    return Math.floor(rng() * total);
  }
  const offset = 1 + Math.floor(rng() * (total - 1));
  return (excludeIndex + offset) % total;
}

export function readCachedQuote(): Quote | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return null;
    const text = asNonEmptyString(parsed.text);
    const author = asNonEmptyString(parsed.author);
    const id = asNonEmptyString(parsed.id);
    if (text === null || author === null || id === null) return null;
    return buildQuote(id, text, author);
  } catch {
    return null;
  }
}

export function writeCachedQuote(quote: Quote): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(quote));
  } catch {
    // private mode / quota
  }
}

export function pickEmergencyQuote(
  excludeId?: string,
  pool: Quote[] = emergencyQuotes,
): Quote | null {
  const candidates = pool.filter((quote) => quote.id !== excludeId);
  const usable = candidates.length > 0 ? candidates : pool;
  if (usable.length === 0) return null;
  const index = Math.floor(Math.random() * usable.length);
  return usable[index] ?? null;
}

async function fetchJson(url: string, fetcher: typeof fetch): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, FETCH_TIMEOUT_MS);
  try {
    const response = await fetcher(url, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      throw new Error(`GET ${url} responded with HTTP ${String(response.status)}`);
    }
    return (await response.json()) as unknown;
  } finally {
    clearTimeout(timer);
  }
}

let manifestCache: QuoteManifest | null = null;
let manifestPromise: Promise<QuoteManifest> | null = null;

async function loadManifest(fetcher: typeof fetch): Promise<QuoteManifest> {
  if (manifestCache !== null) return manifestCache;
  manifestPromise ??= fetchJson(MANIFEST_URL, fetcher)
    .then((payload) => {
      const manifest = parseManifest(payload);
      if (manifest === null) throw new Error("Quotes manifest is invalid");
      manifestCache = manifest;
      return manifest;
    })
    .finally(() => {
      manifestPromise = null;
    });
  return manifestPromise;
}

const fragmentCache = new Map<string, Quote[]>();
const fragmentPromises = new Map<string, Promise<Quote[]>>();

async function loadFragment(entry: FragmentEntry, fetcher: typeof fetch): Promise<Quote[]> {
  const cached = fragmentCache.get(entry.file);
  if (cached !== undefined) return cached;
  let promise = fragmentPromises.get(entry.file);
  if (promise === undefined) {
    promise = fetchJson(`${DATA_BASE_URL}${entry.file}`, fetcher)
      .then((payload) => {
        if (!Array.isArray(payload)) throw new Error(`Fragment ${entry.file} is not an array`);
        const quotes = payload
          .map(normalizeFallback)
          .filter((quote): quote is Quote => quote !== null);
        if (quotes.length === 0) throw new Error(`Fragment ${entry.file} has no valid quotes`);
        fragmentCache.set(entry.file, quotes);
        return quotes;
      })
      .finally(() => {
        fragmentPromises.delete(entry.file);
      });
    fragmentPromises.set(entry.file, promise);
  }
  return promise;
}

async function quoteAtIndex(
  manifest: QuoteManifest,
  index: number,
  fetcher: typeof fetch,
): Promise<Quote> {
  const entry = fragmentEntryForIndex(manifest, index);
  if (entry === null) throw new Error(`No fragment covers quote index ${String(index)}`);
  const quotes = await loadFragment(entry, fetcher);
  const quote = quotes[index - entry.firstIndex];
  if (quote === undefined) {
    throw new Error(`Quote index ${String(index)} missing from fragment ${entry.file}`);
  }
  return quote;
}

export function resetQuotesCaches(): void {
  manifestCache = null;
  manifestPromise = null;
  fragmentCache.clear();
  fragmentPromises.clear();
}

export async function getNextQuote(
  excludeId?: string,
  fetcher: typeof fetch = fetch,
): Promise<QuoteResult> {
  try {
    const manifest = await loadManifest(fetcher);
    let index = pickRandomIndex(manifest.total);
    let quote = await quoteAtIndex(manifest, index, fetcher);
    if (quote.id === excludeId && manifest.total > 1) {
      // avoid showing the same line twice in a row
      index = pickRandomIndex(manifest.total, index);
      quote = await quoteAtIndex(manifest, index, fetcher);
    }
    writeCachedQuote(quote);
    return { quote, source: "fragment" };
  } catch {
    const cached = readCachedQuote();
    if (cached !== null && cached.id !== excludeId) {
      return { quote: cached, source: "cache" };
    }
    const embedded = pickEmergencyQuote(excludeId);
    if (embedded !== null) {
      return { quote: embedded, source: "embedded" };
    }
    if (cached !== null) {
      return { quote: cached, source: "cache" };
    }
    throw new Error("No quote available from any source");
  }
}
