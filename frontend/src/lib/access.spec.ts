import { describe, expect, it } from "vitest";
import { canAccess, hasCapability, hasPermission } from "./access";
const context = { permisos: ["MESAS_VER"], capacidades: ["MESAS"] };
describe("access", () => {
  it("requires the assigned permission", () => { expect(hasPermission(context, "MESAS_VER")).toBe(true); expect(hasPermission(context, "CAJA_VER")).toBe(false); });
  it("requires the plan capability", () => { expect(hasCapability(context, "MESAS")).toBe(true); expect(hasCapability(context, "FACTURACION")).toBe(false); });
  it("combines permission and capability without granting either implicitly", () => { expect(canAccess(context, "MESAS_VER", "MESAS")).toBe(true); expect(canAccess(context, "MESAS_VER", "FACTURACION")).toBe(false); });
});
