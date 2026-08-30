import { isAxiosError } from "axios";
import { api } from "./api";

type Attempt = { id: string; path: string; body: Record<string, unknown> };
const allowed =
  /^\/(?:cajas\/(?:abrir|\d+\/(?:movimientos|cerrar))|ventas\/(?:directa|manual)|registros-factura)$/;
export function readAttempt(scope: string): Attempt | null {
  const raw = sessionStorage.getItem(`sigr-confirmed:${scope}`);
  if (!raw) return null;
  const parsed: unknown = JSON.parse(raw);
  if (
    !parsed ||
    typeof parsed !== "object" ||
    !("id" in parsed) ||
    typeof parsed.id !== "string" ||
    !("path" in parsed) ||
    typeof parsed.path !== "string" ||
    !allowed.test(parsed.path) ||
    !("body" in parsed) ||
    !parsed.body ||
    typeof parsed.body !== "object"
  )
    throw new Error(
      "El intento pendiente no tiene un formato válido; requiere revisión",
    );
  return parsed as Attempt;
}
const inflight = new Map<string, Promise<unknown>>();
export async function confirmedPost<T>(
  scope: string,
  path?: string,
  body?: Record<string, unknown>,
): Promise<T> {
  const previous = readAttempt(scope);
  if (path && !allowed.test(path)) throw new Error("Operación no admitida");
  if (
    previous &&
    path &&
    (previous.path !== path ||
      JSON.stringify(previous.body) !== JSON.stringify(body))
  )
    throw new Error(
      "Primero confirma la operación pendiente; no cambies sus datos ni la repitas como nueva",
    );
  const attempt =
    previous ?? (path && body ? { id: crypto.randomUUID(), path, body } : null);
  if (!attempt) throw new Error("No hay una operación pendiente");
  if (inflight.has(scope)) return inflight.get(scope) as Promise<T>;
  const operation = (async () => {
    const key = `sigr-confirmed:${scope}`;
    sessionStorage.setItem(key, JSON.stringify(attempt));
    window.dispatchEvent(new Event("sigr:financial-attempt"));
    try {
      const { data } = await api.post<T>(attempt.path, attempt.body, {
        headers: { "Idempotency-Key": attempt.id },
      });
      sessionStorage.removeItem(key);
      return data;
    } catch (error) {
      if (
        !previous &&
        isAxiosError(error) &&
        error.response &&
        error.response.status >= 400 &&
        error.response.status < 500
      )
        sessionStorage.removeItem(key);
      throw error;
    } finally {
      inflight.delete(scope);
      window.dispatchEvent(new Event("sigr:financial-attempt"));
    }
  })();
  inflight.set(scope, operation);
  return operation;
}
