import { describe, expect, it } from "vitest";

import { FIELDS, fieldForId, formatCopyText } from "./quote-utils";

describe("formatCopyText", () => {
  it("formats as “Quote” — Author", () => {
    expect(formatCopyText({ text: "Quote text", author: "Author Name" })).toBe(
      "“Quote text” — Author Name",
    );
  });

  it("keeps the author name untouched", () => {
    expect(formatCopyText({ text: "Less is more.", author: "Ludwig Mies van der Rohe" })).toBe(
      "“Less is more.” — Ludwig Mies van der Rohe",
    );
  });
});

describe("fieldForId", () => {
  it("returns the same field for the same id", () => {
    expect(fieldForId("local-01")).toEqual(fieldForId("local-01"));
    expect(fieldForId("local-22").name).toBe(fieldForId("local-22").name);
  });

  it("only returns known fields with hex colors", () => {
    const ids = ["a", "b", "local-01", "local-30", "kpQDqnRoz5", "xyz-123"];
    for (const id of ids) {
      const field = fieldForId(id);
      expect(FIELDS.some((entry) => entry.name === field.name)).toBe(true);
      expect(field.bg).toMatch(/^#[0-9A-F]{6}$/i);
      expect(field.ink).toMatch(/^#[0-9A-F]{6}$/i);
    }
  });

  it("uses dark ink on light fields", () => {
    for (const name of ["gold", "lime", "lemon"]) {
      const field = FIELDS.find((entry) => entry.name === name);
      expect(field?.ink).not.toBe("#FFFFFF");
    }
  });

  it("keeps a wide set of distinct backgrounds", () => {
    const backgrounds = new Set(FIELDS.map((field) => field.bg.toLowerCase()));
    expect(FIELDS.length).toBeGreaterThanOrEqual(20);
    expect(backgrounds.size).toBe(FIELDS.length);
  });

  it("never repeats the excluded field when another exists", () => {
    for (const field of FIELDS) {
      const next = fieldForId("local-07", field.name);
      expect(next.name).not.toBe(field.name);
    }
  });

  it("varies across different ids", () => {
    const names = new Set(
      ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"].map((id) => fieldForId(id).name),
    );
    expect(names.size).toBeGreaterThan(1);
  });
});
