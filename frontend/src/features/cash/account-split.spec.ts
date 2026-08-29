import { describe, expect, it } from "vitest";
import { splitPeople, splitPercentages, splitProducts } from "./account-split";

describe("división avanzada de cuenta", () => {
  it("conserva centavos al dividir por personas y porcentaje", () => {
    expect(splitPeople(100, 3).reduce((sum, item) => sum + item.total, 0)).toBe(100);
    expect(splitPercentages(100, [30, 70]).map((item) => item.total)).toEqual([30, 70]);
  });
  it("distribuye ajustes del total al separar productos", () => {
    const parts = splitProducts(
      {
        total: 110,
        detalles: [
          { id: 1, cantidad: 1, precioUnitario: 40, subtotal: 40 },
          { id: 2, cantidad: 1, precioUnitario: 60, subtotal: 60 },
        ],
      },
      [1, 2],
    );
    expect(parts.map((item) => item.total)).toEqual([44, 66]);
  });
});
