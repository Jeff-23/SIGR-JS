import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./api";
import { confirmedPost, readAttempt } from "./confirmed-operation";

vi.mock("./api", () => ({ api: { post: vi.fn() } }));
beforeEach(() => {
  const values = new Map<string, string>();
  vi.stubGlobal("sessionStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  });
  vi.stubGlobal("window", new EventTarget());
  vi.mocked(api.post).mockReset();
});
describe("confirmación financiera", () => {
  it("recupera la misma clave y cuerpo después de perder la respuesta", async () => {
    vi.mocked(api.post).mockRejectedValueOnce(new Error("respuesta perdida"));
    await expect(
      confirmedPost("actor-1", "/cajas/abrir", { saldoInicial: 100 }),
    ).rejects.toThrow();
    const attempt = readAttempt("actor-1");
    expect(attempt).not.toBeNull();
    vi.mocked(api.post).mockResolvedValueOnce({ data: { id: 5 } });
    expect(await confirmedPost("actor-1")).toEqual({ id: 5 });
    expect(vi.mocked(api.post).mock.calls[1]).toEqual(
      vi.mocked(api.post).mock.calls[0],
    );
    expect(readAttempt("actor-1")).toBeNull();
  });
  it("bloquea cambios sobre una operación incierta y aísla propietarios", async () => {
    vi.mocked(api.post).mockRejectedValue(new Error("sin red"));
    await expect(
      confirmedPost("actor-1", "/cajas/1/movimientos", { monto: 50 }),
    ).rejects.toThrow();
    await expect(
      confirmedPost("actor-1", "/cajas/1/movimientos", { monto: 60 }),
    ).rejects.toThrow("Primero confirma");
    expect(readAttempt("actor-2")).toBeNull();
    expect(api.post).toHaveBeenCalledTimes(1);
  });
  it("no reproduce rutas arbitrarias ni hace dos envíos simultáneos", async () => {
    await expect(
      confirmedPost("actor-1", "https://otro.test", {}),
    ).rejects.toThrow();
    vi.mocked(api.post).mockResolvedValue({ data: { id: 8 } });
    const results = await Promise.all([
      confirmedPost("actor-1", "/cajas/abrir", { saldoInicial: 0 }),
      confirmedPost("actor-1", "/cajas/abrir", { saldoInicial: 0 }),
    ]);
    expect(results).toEqual([{ id: 8 }, { id: 8 }]);
    expect(api.post).toHaveBeenCalledTimes(1);
  });
});
