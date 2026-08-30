import { describe, expect, it } from "vitest";
import { mayQueue, sameScope } from "./offline-policy";

describe("offline isolation", () => {
  const scope = { actorId: 1, tenantId: 2, apiUrl: "https://api.example.test" };
  it("rejects legacy operations without an owner", () =>
    expect(sameScope(undefined, scope)).toBe(false));
  it("rejects another operator, tenant or server", () => {
    expect(sameScope({ ...scope, actorId: 3 }, scope)).toBe(false);
    expect(sameScope({ ...scope, tenantId: 3 }, scope)).toBe(false);
    expect(sameScope({ ...scope, apiUrl: "https://other.test" }, scope)).toBe(
      false,
    );
    expect(sameScope(scope, null)).toBe(false);
    expect(sameScope(scope, scope)).toBe(true);
  });
  it("never silently queues payments, archive updates or closing cash", () => {
    expect(mayQueue("POST", "/pedidos")).toBe(true);
    for (const path of [
      "/ventas/1/pagos",
      "/cajas/1/cerrar",
      "/registros-factura",
      "https://other.test/pedidos",
    ])
      expect(mayQueue("POST", path)).toBe(false);
    expect(mayQueue("PATCH", "/pedidos")).toBe(false);
  });
});
