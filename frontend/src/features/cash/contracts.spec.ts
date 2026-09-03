import { describe, expect, it } from "vitest";
import { automaticDiscount, balance, cashChange, cents, clampPaymentAmount, paid, type Sale } from "./contracts";
describe("saldo comercial", () => {
  it("calcula parciales en centavos", () => {
    expect(
      balance({
        total: "100.30",
        pagos: [{ monto: "50.10" }, { monto: "25.10" }],
      } as Sale),
    ).toBe(25.1);
    expect(
      balance({
        total: "0.30",
        pagos: [{ monto: "0.10" }, { monto: "0.20" }],
      } as Sale),
    ).toBe(0);
  });
  it("rechaza importes no finitos", () =>
    expect(() => cents("incorrecto")).toThrow());
  it("calcula pagos netos, cambio y descuento automático", () => {
    const sale = {
      pagos: [
        { monto: "60.00", devoluciones: [{ monto: "10.00" }] },
        { monto: "20.00", devoluciones: [] },
      ],
      aplicacionesDescuento: [
        { monto: "5.00" },
        { monto: "2.50" },
      ],
    } as Sale;
    expect(paid(sale)).toBe(70);
    expect(automaticDiscount(sale)).toBe(7.5);
    expect(cashChange("200", "126")).toBe(74);
  });
  it("limita el monto aplicado al saldo pendiente", () => {
    expect(clampPaymentAmount("100000", 65000)).toBe("65000");
    expect(clampPaymentAmount("20000", 65000)).toBe("20000");
    expect(clampPaymentAmount("", 65000)).toBe("");
  });

});
