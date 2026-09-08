#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const FRAGMENT_SIZE = 8;
const HASH_LENGTH = 10;

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = join(root, "src", "data", "fallback-quotes.json");
const outDir = join(root, "public", "data");

function fail(message) {
  throw new Error(`build-quotes: ${message}`);
}

const raw = await readFile(sourcePath, "utf8");
const quotes = JSON.parse(raw);
if (!Array.isArray(quotes) || quotes.length === 0) {
  fail(`${sourcePath} must contain a non-empty array of quotes`);
}

for (const [index, quote] of quotes.entries()) {
  const valid =
    quote !== null &&
    typeof quote === "object" &&
    typeof quote.id === "string" &&
    quote.id.trim().length > 0 &&
    typeof quote.text === "string" &&
    quote.text.trim().length > 0 &&
    typeof quote.author === "string" &&
    quote.author.trim().length > 0;
  if (!valid) fail(`quote at index ${String(index)} needs non-empty id, text and author`);
}

await mkdir(outDir, { recursive: true });

for (const name of await readdir(outDir)) {
  if (/^quotes-\d+\.[0-9a-f]+\.json$/.test(name)) {
    await rm(join(outDir, name));
  }
}

const fragments = [];
for (let start = 0, part = 1; start < quotes.length; start += FRAGMENT_SIZE, part += 1) {
  const slice = quotes.slice(start, start + FRAGMENT_SIZE);
  const lean = slice.map((quote) => ({
    id: quote.id.trim(),
    text: quote.text.trim(),
    author: quote.author.trim(),
  }));
  const body = JSON.stringify(lean);
  const hash = createHash("sha256").update(body).digest("hex").slice(0, HASH_LENGTH);
  const file = `quotes-${String(part)}.${hash}.json`;
  await writeFile(join(outDir, file), `${body}\n`, "utf8");
  fragments.push({ file, count: slice.length, firstIndex: start });
}

const manifest = { total: quotes.length, fragments };
await writeFile(join(outDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

console.log(
  `build-quotes: ${String(quotes.length)} quotes -> ${String(fragments.length)} fragment(s) + manifest in public/data/`,
);
