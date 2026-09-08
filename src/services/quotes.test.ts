import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import fallbackData from "../data/fallback-quotes.json";
import {
  fragmentEntryForIndex,
  getNextQuote,
  normalizeFallback,
  parseManifest,
  pickRandomIndex,
  resetQuotesCaches,
} from "./quotes";
import type { QuoteManifest } from "./quotes";

/** Deterministic PRNG (mulberry32) so statistical tests never flake. */
function seededRng(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const testManifest: QuoteManifest = {
  total: 4,
  fragments: [{ file: "quotes-1.test.json", count: 4, firstIndex: 0 }],
};

const testFragment = [
  { id: "t1", text: "First line.", author: "Author One" },
  { id: "t2", text: "Second line.", author: "Author Two" },
  { id: "t3", text: "Third line.", author: "Author Three" },
  { id: "t4", text: "Fourth line.", author: "Author Four" },
];

function jsonResponse(payload: unknown): {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
} {
  return { ok: true, status: 200, json: () => Promise.resolve(payload) };
}

function makeFetcher(handlers: {
  manifest?: unknown;
  fragments?: Record<string, unknown>;
  failManifest?: boolean;
}): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("manifest")) {
      if (handlers.failManifest === true) throw new Error("network down");
      return jsonResponse(handlers.manifest ?? testManifest);
    }
    for (const [file, payload] of Object.entries(handlers.fragments ?? {})) {
      if (url.includes(file)) {
        if (payload instanceof Error) throw payload;
        return jsonResponse(payload);
      }
    }
    throw new Error(`unexpected fetch: ${url}`);
  }) as unknown as typeof fetch;
}

const okFetcher = makeFetcher({ fragments: { "quotes-1.test.json": testFragment } });
const failingFetcher = makeFetcher({ failManifest: true });

beforeEach(() => {
  resetQuotesCaches();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("local collection", () => {
  it("ships a valid collection of 25–40 quotes", () => {
    const quotes = (fallbackData as unknown[]).map(normalizeFallback);
    for (const quote of quotes) {
      expect(quote).not.toBeNull();
    }
    expect(quotes.length).toBeGreaterThanOrEqual(25);
    expect(quotes.length).toBeLessThanOrEqual(40);
    const ids = new Set(quotes.map((quote) => quote?.id));
    expect(ids.size).toBe(quotes.length);
  });
});

describe("normalizeFallback", () => {
  it("keeps only id, text and author", () => {
    const quote = normalizeFallback({
      id: "x1",
      text: "Some text.",
      author: "Some Author",
      authorDescription: "A person",
      authorLink: "javascript:alert(1)",
      tags: ["a", "b", "c"],
    });
    expect(quote).toEqual({
      id: "x1",
      text: "Some text.",
      author: "Some Author",
    });
  });

  it("rejects malformed entries", () => {
    expect(normalizeFallback(null)).toBeNull();
    expect(normalizeFallback("quote")).toBeNull();
    expect(normalizeFallback({ text: "T", author: "A" })).toBeNull();
    expect(normalizeFallback({ id: "x", text: "   ", author: "A" })).toBeNull();
    expect(normalizeFallback({ id: "x", text: "T", author: 42 })).toBeNull();
  });
});

describe("pickRandomIndex", () => {
  it("never repeats the excluded index when total > 1 (200 seeded draws)", () => {
    const rng = seededRng(1234);
    const hits = new Map<number, number>();
    for (let i = 0; i < 200; i++) {
      const index = pickRandomIndex(8, 3, rng);
      expect(index).not.toBe(3);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(8);
      hits.set(index, (hits.get(index) ?? 0) + 1);
    }
    // Statistical sanity: every allowed index gets hit at least once.
    expect(hits.size).toBe(7);
  });

  it("is uniform over the whole range without an exclusion", () => {
    const rng = seededRng(99);
    const hits = new Set<number>();
    for (let i = 0; i < 200; i++) {
      const index = pickRandomIndex(30, undefined, rng);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(30);
      hits.add(index);
    }
    expect(hits.size).toBeGreaterThan(20);
  });

  it("returns 0 when there is a single quote", () => {
    expect(pickRandomIndex(1, 0, seededRng(1))).toBe(0);
    expect(pickRandomIndex(1)).toBe(0);
  });
});

describe("fragmentEntryForIndex", () => {
  const manifest: QuoteManifest = {
    total: 30,
    fragments: [
      { file: "quotes-1.a.json", count: 8, firstIndex: 0 },
      { file: "quotes-2.b.json", count: 8, firstIndex: 8 },
      { file: "quotes-3.c.json", count: 8, firstIndex: 16 },
      { file: "quotes-4.d.json", count: 6, firstIndex: 24 },
    ],
  };

  it("maps boundary indices to the right fragment", () => {
    expect(fragmentEntryForIndex(manifest, 0)?.file).toBe("quotes-1.a.json");
    expect(fragmentEntryForIndex(manifest, 7)?.file).toBe("quotes-1.a.json");
    expect(fragmentEntryForIndex(manifest, 8)?.file).toBe("quotes-2.b.json");
    expect(fragmentEntryForIndex(manifest, 15)?.file).toBe("quotes-2.b.json");
    expect(fragmentEntryForIndex(manifest, 16)?.file).toBe("quotes-3.c.json");
    expect(fragmentEntryForIndex(manifest, 23)?.file).toBe("quotes-3.c.json");
    expect(fragmentEntryForIndex(manifest, 24)?.file).toBe("quotes-4.d.json");
    expect(fragmentEntryForIndex(manifest, 29)?.file).toBe("quotes-4.d.json");
  });

  it("rejects out-of-range indices", () => {
    expect(fragmentEntryForIndex(manifest, -1)).toBeNull();
    expect(fragmentEntryForIndex(manifest, 30)).toBeNull();
    expect(fragmentEntryForIndex(manifest, 1.5)).toBeNull();
  });
});

describe("parseManifest", () => {
  it("accepts a valid manifest", () => {
    const parsed = parseManifest({
      total: 30,
      fragments: [
        { file: "quotes-1.a.json", count: 8, firstIndex: 0 },
        { file: "quotes-2.b.json", count: 8, firstIndex: 8 },
      ],
    });
    // Not contiguous with total=30, so invalid.
    expect(parsed).toBeNull();

    const valid = parseManifest({
      total: 12,
      fragments: [
        { file: "quotes-2.b.json", count: 4, firstIndex: 8 },
        { file: "quotes-1.a.json", count: 8, firstIndex: 0 },
      ],
    });
    expect(valid).toEqual({
      total: 12,
      fragments: [
        { file: "quotes-1.a.json", count: 8, firstIndex: 0 },
        { file: "quotes-2.b.json", count: 4, firstIndex: 8 },
      ],
    });
  });

  it("rejects malformed manifests", () => {
    expect(parseManifest(null)).toBeNull();
    expect(parseManifest({})).toBeNull();
    expect(parseManifest({ total: 0, fragments: [] })).toBeNull();
    expect(parseManifest({ total: 4, fragments: "nope" })).toBeNull();
    expect(
      parseManifest({ total: 4, fragments: [{ file: "", count: 4, firstIndex: 0 }] }),
    ).toBeNull();
    expect(
      parseManifest({ total: 4, fragments: [{ file: "f.json", count: 0, firstIndex: 0 }] }),
    ).toBeNull();
    expect(
      parseManifest({ total: 4, fragments: [{ file: "f.json", count: 4, firstIndex: -1 }] }),
    ).toBeNull();
    // Gap in coverage: first fragment does not start at 0.
    expect(
      parseManifest({ total: 4, fragments: [{ file: "f.json", count: 4, firstIndex: 1 }] }),
    ).toBeNull();
  });
});

describe("getNextQuote", () => {
  it("returns a fragment quote on the happy path and caches it", async () => {
    const setItem = vi.fn();
    vi.stubGlobal("localStorage", {
      getItem: () => null,
      setItem,
    });
    vi.spyOn(Math, "random").mockReturnValue(0.5); // index 2 of 4

    const result = await getNextQuote(undefined, okFetcher);
    expect(result.source).toBe("fragment");
    expect(result.quote.id).toBe("t3");
    expect(setItem).toHaveBeenCalledOnce();
  });

  it("never repeats the current quote (redraws on collision)", async () => {
    const random = vi.spyOn(Math, "random");
    random.mockReturnValueOnce(0); // index 0 -> t1, the excluded quote
    random.mockReturnValueOnce(0.5); // redraw offset 2 -> index 2

    const result = await getNextQuote("t1", okFetcher);
    expect(result.source).toBe("fragment");
    expect(result.quote.id).toBe("t3");
  });

  it("fetches the manifest once for concurrent calls", async () => {
    let manifestCalls = 0;
    const countingFetcher = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("manifest")) {
        manifestCalls += 1;
        return jsonResponse(testManifest);
      }
      return jsonResponse(testFragment);
    }) as unknown as typeof fetch;

    const [a, b] = await Promise.all([
      getNextQuote(undefined, countingFetcher),
      getNextQuote(undefined, countingFetcher),
    ]);
    expect(manifestCalls).toBe(1);
    expect(a.source).toBe("fragment");
    expect(b.source).toBe("fragment");
  });

  it("fetches each fragment only once", async () => {
    let fragmentCalls = 0;
    const countingFetcher = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("manifest")) return jsonResponse(testManifest);
      fragmentCalls += 1;
      return jsonResponse(testFragment);
    }) as unknown as typeof fetch;

    await getNextQuote(undefined, countingFetcher);
    await getNextQuote(undefined, countingFetcher);
    expect(fragmentCalls).toBe(1);
  });

  it("skips malformed fragment entries", async () => {
    const fetcher = makeFetcher({
      fragments: {
        "quotes-1.test.json": [
          { id: "t1", text: "First line.", author: "Author One" },
          { id: "", text: "", author: "" },
          { id: "t3", text: "Third line.", author: "Author Three" },
        ],
      },
    });
    vi.spyOn(Math, "random").mockReturnValue(0); // index 0 -> first valid entry
    const result = await getNextQuote(undefined, fetcher);
    expect(result.source).toBe("fragment");
    expect(result.quote.id).toBe("t1");
  });

  it("falls back to the cached quote when fragment loading fails", async () => {
    const cached = { id: "cached-1", text: "From cache.", author: "Cache Author" };
    vi.stubGlobal("localStorage", {
      getItem: () => JSON.stringify(cached),
      setItem: () => undefined,
    });

    const result = await getNextQuote(undefined, failingFetcher);
    expect(result.source).toBe("cache");
    expect(result.quote.id).toBe("cached-1");
  });

  it("falls back to an embedded quote when the cache holds the excluded quote", async () => {
    const cached = { id: "current", text: "From cache.", author: "Cache Author" };
    vi.stubGlobal("localStorage", {
      getItem: () => JSON.stringify(cached),
      setItem: () => undefined,
    });

    const result = await getNextQuote("current", failingFetcher);
    expect(result.source).toBe("embedded");
    expect(result.quote.id).not.toBe("current");
  });

  it("falls back to an embedded quote when the manifest fetch fails and storage is empty", async () => {
    const result = await getNextQuote(undefined, failingFetcher);
    expect(result.source).toBe("embedded");
    expect(result.quote.text.length).toBeGreaterThan(0);
    expect(result.quote.author.length).toBeGreaterThan(0);
  });

  it("treats a non-OK manifest response as failure", async () => {
    const notOkFetcher = (async () => ({
      ok: false,
      status: 404,
      json: () => Promise.resolve({}),
    })) as unknown as typeof fetch;

    const result = await getNextQuote(undefined, notOkFetcher);
    expect(result.source).toBe("embedded");
  });

  it("treats an invalid manifest payload as failure", async () => {
    const badManifest = makeFetcher({ manifest: { total: -3, fragments: [] } });
    const result = await getNextQuote(undefined, badManifest);
    expect(result.source).toBe("embedded");
  });

  it("falls back when the fragment fetch fails", async () => {
    const fetcher = makeFetcher({
      fragments: { "quotes-1.test.json": new Error("fragment 404") },
    });
    const result = await getNextQuote(undefined, fetcher);
    expect(result.source).toBe("embedded");
  });
});
