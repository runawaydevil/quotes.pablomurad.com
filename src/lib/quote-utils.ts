import type { Quote } from "../types/quote";

export interface Field {
  name: string;
  bg: string;
  ink: string;
}

export const FIELDS: readonly Field[] = [
  { name: "ember", bg: "#E35D1A", ink: "#FFFFFF" },
  { name: "grape", bg: "#6B2D9B", ink: "#FFFFFF" },
  { name: "navy", bg: "#1A3A6B", ink: "#FFFFFF" },
  { name: "crimson", bg: "#B91C1C", ink: "#FFFFFF" },
  { name: "forest", bg: "#1F6B45", ink: "#FFFFFF" },
  { name: "gold", bg: "#E8B923", ink: "#1A1408" },
  { name: "magenta", bg: "#C41E6E", ink: "#FFFFFF" },
  { name: "teal", bg: "#0E6E6B", ink: "#FFFFFF" },
  { name: "indigo", bg: "#3B2F8A", ink: "#FFFFFF" },
  { name: "sky", bg: "#1E6BB8", ink: "#FFFFFF" },
  { name: "lime", bg: "#B8C400", ink: "#1A1A00" },
  { name: "coral", bg: "#E24B3B", ink: "#FFFFFF" },
  { name: "chocolate", bg: "#6A3824", ink: "#FFFFFF" },
  { name: "cobalt", bg: "#1C2FA0", ink: "#FFFFFF" },
  { name: "olive", bg: "#5C6E14", ink: "#FFFFFF" },
  { name: "wine", bg: "#7A1B3A", ink: "#FFFFFF" },
  { name: "cerulean", bg: "#0B7F9A", ink: "#FFFFFF" },
  { name: "violet", bg: "#8A1FA8", ink: "#FFFFFF" },
  { name: "moss", bg: "#2F6B28", ink: "#FFFFFF" },
  { name: "lemon", bg: "#E3C200", ink: "#1A1500" },
  { name: "brick", bg: "#8F2A1C", ink: "#FFFFFF" },
  { name: "berry", bg: "#8C1858", ink: "#FFFFFF" },
  { name: "steel", bg: "#2A5878", ink: "#FFFFFF" },
  { name: "tangerine", bg: "#F06A12", ink: "#FFFFFF" },
] as const;

export const DEFAULT_FIELD: Field = FIELDS[0] ?? {
  name: "ember",
  bg: "#E35D1A",
  ink: "#FFFFFF",
};

export function hashId(id: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function fieldForId(id: string, excludeName?: string): Field {
  const start = hashId(id) % FIELDS.length;
  const picked = FIELDS[start] ?? DEFAULT_FIELD;
  if (excludeName === undefined || picked.name !== excludeName) {
    return picked;
  }
  return FIELDS[(start + 1) % FIELDS.length] ?? picked;
}

export function formatCopyText(quote: Pick<Quote, "text" | "author">): string {
  return `“${quote.text}” — ${quote.author}`;
}
