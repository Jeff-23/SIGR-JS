import { describe, it, expect } from "vitest";
import { csvCell, reportRange } from "./reports";
describe("reportes", () => {
  it("compara períodos consecutivos de igual duración", () => {
    expect(reportRange("2026-08-28", "2026-08-28")).toEqual({
      current: {
        desde: "2026-08-28T05:00:00.000Z",
        hasta: "2026-08-29T04:59:59.999Z",
      },
      previous: {
        desde: "2026-08-27T05:00:00.000Z",
        hasta: "2026-08-28T04:59:59.999Z",
      },
    });
  });
  it("protege CSV contra fórmulas y escapa comillas", () => {
    expect(csvCell('=HYPERLINK("x")')).toBe('"\'=HYPERLINK(""x"")"');
    expect(csvCell("Sopa, arroz")).toBe('"Sopa, arroz"');
  });
});
