import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, it, expect, vi } from "vitest";
describe("caché del dispositivo", () => {
  it("no intercepta datos de negocio ni borra cachés de otras aplicaciones", async () => {
    const listeners: Record<string, (event: unknown) => void> = {};
    const remove = vi.fn();
    const cache = {
      keys: async () => ["otra-app", "sigr-shell-v1", "sigr-shell-v2"],
      delete: remove,
    };
    runInNewContext(
      readFileSync(new URL("../../public/sw.js", import.meta.url), "utf8"),
      {
        self: {
          location: { origin: "https://sigr.local" },
          addEventListener: (name: string, cb: (event: unknown) => void) => {
            listeners[name] = cb;
          },
        },
        caches: cache,
        URL,
        Response,
      },
    );
    const respondWith = vi.fn();
    listeners.fetch({
      request: {
        url: "https://sigr.local/ventas",
        method: "GET",
        mode: "cors",
      },
      respondWith,
    });
    listeners.fetch({
      request: {
        url: "https://sigr.local/api/clientes",
        method: "GET",
        mode: "cors",
      },
      respondWith,
    });
    expect(respondWith).not.toHaveBeenCalled();
    let promise: Promise<unknown> | undefined;
    listeners.activate({
      waitUntil: (p: Promise<unknown>) => {
        promise = p;
      },
    });
    await promise;
    expect(remove).toHaveBeenCalledExactlyOnceWith("sigr-shell-v1");
  });
});
