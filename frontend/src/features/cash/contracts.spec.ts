import { describe, expect, it } from "vitest";
import { balance, cents, type Sale } from "./contracts";
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
});
