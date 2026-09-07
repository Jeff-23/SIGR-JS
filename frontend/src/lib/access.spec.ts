import { describe, expect, it } from "vitest";
import { canAccess, hasAnyPermission, hasCapability, hasPermission } from "./access";

const context = { permisos: ["MESAS_VER", "PEDIDOS_CREAR"], capacidades: ["MESAS"] };

describe("access", () => {
  it("requires the assigned permission", () => {
    expect(hasPermission(context, "MESAS_VER")).toBe(true);
    expect(hasPermission(context, "CAJA_VER")).toBe(false);
  });

  it("accepts one permission from a permitted group", () => {
    expect(hasAnyPermission(context, ["CAJA_VER", "PEDIDOS_CREAR"])).toBe(true);
    expect(hasAnyPermission(context, ["CAJA_VER", "REPORTES_VER"])).toBe(false);
  });

  it("requires the plan capability", () => {
    expect(hasCapability(context, "MESAS")).toBe(true);
    expect(hasCapability(context, "FACTURACION")).toBe(false);
  });

  it("combines permission groups and capability without granting either implicitly", () => {
    expect(canAccess(context, "MESAS_VER", "MESAS", ["PEDIDOS_CREAR", "CAJA_VER"])).toBe(true);
    expect(canAccess(context, "MESAS_VER", "MESAS", ["CAJA_VER"])).toBe(false);
    expect(canAccess(context, "MESAS_VER", "FACTURACION", ["PEDIDOS_CREAR"])).toBe(false);
  });
});
