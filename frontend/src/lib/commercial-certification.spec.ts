import { describe, expect, it } from "vitest";
import { branches, menu, tables } from "../data/demo";
import { canAccess } from "./access";

const roles = {
  administrador: {
    permisos: [
      "MESAS_VER",
      "COMANDAS_VER",
      "CAJA_VER",
      "REPORTES_VER",
      "USUARIOS_VER",
    ],
    capacidades: ["MESAS", "KDS", "ANALYTICS"],
  },
  mesero: { permisos: ["MESAS_VER", "PEDIDOS_CREAR"], capacidades: ["MESAS"] },
  cocina: { permisos: ["COMANDAS_VER"], capacidades: ["KDS"] },
  cajero: {
    permisos: ["CAJA_VER", "REGISTROS_FACTURA_VER"],
    capacidades: ["FACTURACION"],
  },
  contador: {
    permisos: ["REPORTES_VER", "REGISTROS_FACTURA_VER"],
    capacidades: ["ANALYTICS", "FACTURACION"],
  },
};

describe("certificación comercial", () => {
  it("mantiene el acceso operativo separado por rol", () => {
    expect(canAccess(roles.mesero, "MESAS_VER", "MESAS")).toBe(true);
    expect(canAccess(roles.mesero, "CAJA_VER")).toBe(false);
    expect(canAccess(roles.cocina, "COMANDAS_VER", "KDS")).toBe(true);
    expect(canAccess(roles.cajero, "CAJA_VER")).toBe(true);
    expect(canAccess(roles.contador, "REPORTES_VER", "ANALYTICS")).toBe(true);
    expect(canAccess(roles.administrador, "USUARIOS_VER")).toBe(true);
  });

  it("presenta una demostración coherente de tres sedes", () => {
    expect(branches).toHaveLength(3);
    expect(tables).toHaveLength(15);
    expect(new Set(tables.map((table) => table.number)).size).toBe(15);
    expect(menu.some((item) => item.station === "COCINA")).toBe(true);
    expect(menu.some((item) => item.station === "BAR")).toBe(true);
  });
});
