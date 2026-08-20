import axios from "axios";
import { enqueue, pending, removePending } from "./offline";

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? "http://localhost:3000",
  timeout: 8000,
});
api.interceptors.request.use((config) => {
  const raw = sessionStorage.getItem("sigr-session");
  if (raw) {
    const token = JSON.parse(raw).token;
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});
export function errorMessage(error: unknown) {
  if (axios.isAxiosError(error))
    return (
      error.response?.data?.message ??
      `No fue posible completar la solicitud${error.response?.headers["x-request-id"] ? ` · ${error.response.headers["x-request-id"]}` : ""}`
    );
  return "No fue posible completar la solicitud";
}
export async function mutation(
  method: "POST" | "PATCH",
  path: string,
  body: unknown,
) {
  const id = crypto.randomUUID();
  try {
    return await api.request({
      method,
      url: path,
      data: body,
      headers: { "Idempotency-Key": id },
    });
  } catch (error) {
    if (!navigator.onLine || !axios.isAxiosError(error) || !error.response) {
      await enqueue({
        id,
        method,
        path,
        body,
        createdAt: new Date().toISOString(),
      });
      return { queued: true, id };
    }
    throw error;
  }
}
export async function synchronize() {
  const operations = await pending();
  let synced = 0;
  for (const operation of operations) {
    try {
      await api.request({
        method: operation.method,
        url: operation.path,
        data: operation.body,
        headers: { "Idempotency-Key": operation.id },
      });
      await removePending(operation.id);
      synced++;
    } catch {
      break;
    }
  }
  return { synced, remaining: (await pending()).length };
}
