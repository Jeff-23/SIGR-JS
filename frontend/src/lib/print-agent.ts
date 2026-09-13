export const PRINT_AGENT_URL = "http://127.0.0.1:38475";

export type LocalPrinter = {
  name: string;
  default: boolean;
  network: boolean;
  workOffline: boolean;
  printerStatus: number;
  detectedErrorState: number;
  available: boolean;
  message: string;
};

type PrintAgentHealth = {
  ok: boolean;
  service: string;
  version: string;
  platform: string;
};

type PrintAgentResult = {
  ok: boolean;
  status: "completed" | "offline" | "timeout" | "error" | "invalid";
  error?: string;
  printer?: string | LocalPrinter;
  jobName?: string;
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${PRINT_AGENT_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-SIGR-Print-Agent": "1",
      ...(init?.headers ?? {}),
    },
  });
  const body = (await response.json().catch(() => null)) as T | null;
  if (!response.ok) {
    const detail = body as { error?: string } | null;
    throw new Error(detail?.error || `El agente de impresión respondió con estado ${response.status}`);
  }
  if (!body) throw new Error("El agente de impresión no devolvió una respuesta válida");
  return body;
}

export function printAgentHealth(signal?: AbortSignal) {
  return request<PrintAgentHealth>("/v1/health", { signal });
}

export async function listLocalPrinters(signal?: AbortSignal) {
  const result = await request<{ ok: true; printers: LocalPrinter[] }>(
    "/v1/printers",
    { signal },
  );
  return result.printers;
}

export function printWithLocalAgent(input: {
  printerName: string;
  jobName: string;
  content: string;
  widthMm: 58 | 80;
}) {
  return request<PrintAgentResult>("/v1/print", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function printerSelectionStorageKey(branchId: number) {
  return `sigr-print-agent:branch:${branchId}:stations`;
}

export function readStationPrinterMap(branchId: number) {
  try {
    const raw = window.localStorage.getItem(printerSelectionStorageKey(branchId));
    if (!raw) return {} as Record<number, string>;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const result: Record<number, string> = {};
    for (const [key, value] of Object.entries(parsed)) {
      const id = Number(key);
      if (Number.isInteger(id) && typeof value === "string" && value.trim()) {
        result[id] = value;
      }
    }
    return result;
  } catch {
    return {} as Record<number, string>;
  }
}

export function saveStationPrinterMap(
  branchId: number,
  value: Record<number, string>,
) {
  window.localStorage.setItem(
    printerSelectionStorageKey(branchId),
    JSON.stringify(value),
  );
}
