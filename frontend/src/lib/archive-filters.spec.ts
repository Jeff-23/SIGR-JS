import { describe, expect, it } from "vitest";
import { archiveParams, archiveFilterError } from "./archive-filters";
const filters = {
  search: " PAP-1 ",
  from: "2026-08-28",
  to: "2026-08-28",
  minimum: "0",
  maximum: "20000",
  origin: "PAPEL",
};
describe("archivo operativo", () => {
  it("consulta el día completo de Colombia, incluyendo después de medianoche UTC", () => {
    const params = archiveParams(filters, 3);
    expect(new Date(params.desde!).toISOString()).toBe(
      "2026-08-28T05:00:00.000Z",
    );
    expect(new Date(params.hasta!).toISOString()).toBe(
      "2026-08-29T04:59:59.999Z",
    );
    expect(params).toMatchObject({
      buscar: "PAP-1",
      sucursalId: 3,
      montoDesde: 0,
      montoHasta: 20000,
      origen: "PAPEL",
    });
  });
  it("rechaza rangos invertidos y montos inválidos", () => {
    expect(archiveFilterError(filters)).toBeNull();
    expect(
      archiveFilterError({ ...filters, from: "2026-08-29" }),
    ).not.toBeNull();
    expect(archiveFilterError({ ...filters, minimum: "30000" })).not.toBeNull();
    expect(archiveFilterError({ ...filters, minimum: "NaN" })).not.toBeNull();
  });
});
