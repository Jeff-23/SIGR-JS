import { describe, expect, it } from "vitest";
import { commandDestination, elapsedMinutes, urgency, type Command } from "./contracts";
describe("contrato KDS", () => {
  it("clasifica tiempos", () => {
    expect(urgency(4)).toBe("normal"); expect(urgency(10)).toBe("warning"); expect(urgency(20)).toBe("critical");
  });
  it("calcula minutos completos sin negativos", () => {
    expect(elapsedMinutes("2026-08-20T10:00:00.000Z", Date.parse("2026-08-20T10:12:59.000Z"))).toBe(12);
    expect(elapsedMinutes("2026-08-20T11:00:00.000Z", Date.parse("2026-08-20T10:00:00.000Z"))).toBe(0);
  });
  it("identifica destino", () => {
    expect(commandDestination({ pedido: { mesa: { numero: 7 }, tipo: "MESA" } } as Command)).toBe("Mesa 7");
    expect(commandDestination({ pedido: { mesa: null, tipo: "PARA_LLEVAR" } } as Command)).toBe("Para llevar");
  });
});
