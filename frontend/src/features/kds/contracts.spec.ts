import { describe, expect, it } from "vitest";
import {
  commandDestination,
  elapsedMinutes,
  pendingCommandCount,
  servicePromise,
  unseenCommandCount,
  urgency,
  type Command,
} from "./contracts";

describe("contrato KDS", () => {
  it("clasifica la urgencia contra la meta de servicio", () => {
    expect(urgency(4, 15)).toBe("normal");
    expect(urgency(12, 15)).toBe("warning");
    expect(urgency(14, 15)).toBe("critical");
    expect(urgency(20, 15)).toBe("critical");
  });

  it("calcula promesa de servicio y exceso", () => {
    expect(servicePromise(12, 15)).toEqual({ target: 15, elapsed: 12, remaining: 3, risk: "medium" });
    expect(servicePromise(19, 15)).toEqual({ target: 15, elapsed: 19, remaining: -4, risk: "late" });
  });

  it("calcula minutos completos sin negativos", () => {
    expect(elapsedMinutes("2026-08-20T10:00:00.000Z", Date.parse("2026-08-20T10:12:59.000Z"))).toBe(12);
    expect(elapsedMinutes("2026-08-20T11:00:00.000Z", Date.parse("2026-08-20T10:00:00.000Z"))).toBe(0);
  });

  it("identifica destino", () => {
    expect(commandDestination({ pedido: { mesa: { numero: 7 }, tipo: "MESA" } } as Command)).toBe("Mesa 7");
    expect(commandDestination({ pedido: { mesa: null, tipo: "PARA_LLEVAR" } } as Command)).toBe("Para llevar");
  });

  it("cuenta únicamente comandas pendientes por iniciar", () => {
    const commands = [
      { estado: "PENDIENTE" },
      { estado: "EN_PREPARACION" },
      { estado: "PENDIENTE" },
      { estado: "LISTA" },
    ] as Command[];
    expect(pendingCommandCount(commands)).toBe(2);
  });

  it("mantiene como nuevas las comandas sin reconocimiento persistido", () => {
    const commands = [
      { fechaVista: null },
      { fechaVista: "2026-09-02T10:00:00.000Z" },
      {},
    ] as Command[];
    expect(unseenCommandCount(commands)).toBe(2);
  });
});
