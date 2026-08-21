import axios, { AxiosError } from "axios";
import { enqueue, pending, removePending } from "./offline";
import { frontendConfig } from "./config";

export const api = axios.create({ baseURL: frontendConfig.apiUrl, timeout: 10000, headers: { Accept: "application/json" } });
export type ApiFailure = { message: string; requestId?: string; status?: number; kind: "unauthorized" | "forbidden" | "unavailable" | "validation" | "unknown" };

function readToken() {
  try { return (JSON.parse(sessionStorage.getItem("sigr-session") ?? "null") as { token?: string } | null)?.token; }
  catch { return undefined; }
}

api.interceptors.request.use((config) => {
  const token = readToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  config.headers["X-Client"] = "SIGR-WEB";
  return config;
});
api.interceptors.response.use(
  (response) => { window.dispatchEvent(new CustomEvent("sigr:service", { detail: { available: true } })); return response; },
  (error: AxiosError) => {
    const status = error.response?.status;
    if (status === 401) window.dispatchEvent(new Event("sigr:unauthorized"));
    if (!error.response) window.dispatchEvent(new CustomEvent("sigr:service", { detail: { available: false } }));
    return Promise.reject(error);
  },
);

export function apiFailure(error: unknown): ApiFailure {
  if (!axios.isAxiosError(error)) return { message: "Ocurrió un error inesperado", kind: "unknown" };
  const status = error.response?.status;
  const requestId = error.response?.headers["x-request-id"] as string | undefined;
  const raw = error.response?.data as { message?: string | string[] } | undefined;
  const provided = Array.isArray(raw?.message) ? raw.message.join(". ") : raw?.message;
  const kind: ApiFailure["kind"] = status === 401 ? "unauthorized" : status === 403 ? "forbidden" : !error.response || (status ?? 0) >= 500 ? "unavailable" : status === 400 || status === 422 ? "validation" : "unknown";
  const fallback = kind === "forbidden" ? "No tienes permiso para realizar esta acción" : kind === "unauthorized" ? "Tu sesión venció. Inicia sesión nuevamente" : kind === "unavailable" ? "El servicio no está disponible temporalmente" : "No fue posible completar la solicitud";
  return { message: provided || fallback, requestId, status, kind };
}
export function errorMessage(error: unknown) {
  const failure = apiFailure(error);
  return `${failure.message}${failure.requestId ? ` · Solicitud ${failure.requestId}` : ""}`;
}
export async function mutation(method: "POST" | "PATCH", path: string, body: unknown) {
  const id = crypto.randomUUID();
  try { return await api.request({ method, url: path, data: body, headers: { "Idempotency-Key": id } }); }
  catch (error) {
    if (!navigator.onLine || !axios.isAxiosError(error) || !error.response) {
      await enqueue({ id, method, path, body, createdAt: new Date().toISOString() });
      return { queued: true as const, id };
    }
    throw error;
  }
}
export async function synchronize() {
  const operations = await pending(); let synced = 0;
  for (const operation of operations) {
    try { await api.request({ method: operation.method, url: operation.path, data: operation.body, headers: { "Idempotency-Key": operation.id } }); await removePending(operation.id); synced++; }
    catch { break; }
  }
  return { synced, remaining: (await pending()).length };
}
