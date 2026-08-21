import { describe, expect, it } from "vitest";
import { activeOrder, cartTotal, pendingCommandDetails, type ApiOrder, type CartLine } from "./contracts";

const product = { id: 1, nombre: "Almuerzo", precio: "20000", categoria: { id: 1, nombre: "Almuerzos" } };

describe("contrato operativo de salón", () => {
  it("calcula la cuenta preliminar sin redondeos ocultos", () => {
    const lines: CartLine[] = [{ product, quantity: 2, notes: "Sin cebolla" }];
    expect(cartTotal(lines)).toBe(40000);
  });

  it("sólo envía a comanda las cantidades todavía pendientes", () => {
    const order = { estado: "PENDIENTE", detalles: [{ id: 9, cantidad: 3, comandas: [{ cantidad: 1 }], producto: product }], comandas: [] } as unknown as ApiOrder;
    expect(pendingCommandDetails(order)).toEqual([{ detallePedidoId: 9, cantidad: 2 }]);
  });

  it("excluye pedidos cancelados y facturados del servicio activo", () => {
    expect(activeOrder({ estado: "CANCELADO" } as ApiOrder)).toBe(false);
    expect(activeOrder({ estado: "ENTREGADO" } as ApiOrder)).toBe(true);
  });
});
