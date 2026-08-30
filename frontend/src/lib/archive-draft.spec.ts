import { describe, it, expect } from "vitest";
import { parseArchiveDraft } from "./archive-draft";
describe("recuperación segura de borradores", () => {
  it("admite ausencia, no estructuras corruptas", () => {
    expect(parseArchiveDraft(null)).toEqual({});
    for (const bad of ["null", "{}", '{"lines":4}', "no-json"])
      expect(() => parseArchiveDraft(bad)).toThrow();
  });
  it("conserva líneas y registro ya confirmado", () => {
    const draft = {
      number: "P1",
      command: "C1",
      support: "",
      date: "2026-08-28T11:00",
      taxes: 0,
      discounts: 0,
      tip: 0,
      delivery: 0,
      payment: "EFECTIVO",
      lines: [{ nombre: "Arroz", cantidad: 1, precioUnitario: 20000 }],
      requestKey: "abc-12345678",
      savedId: 12,
    };
    expect(parseArchiveDraft(JSON.stringify(draft))).toEqual(draft);
  });
});
