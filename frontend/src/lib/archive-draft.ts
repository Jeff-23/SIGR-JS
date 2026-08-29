export type PaperDraft = {
  number: string;
  command: string;
  support: string;
  date: string;
  taxes: number;
  discounts: number;
  tip: number;
  delivery: number;
  payment: string;
  lines: { nombre: string; cantidad: number; precioUnitario: number }[];
  requestKey: string;
  savedId: number | null;
};
export function parseArchiveDraft(raw: string | null): Partial<PaperDraft> {
  if (!raw) return {};
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== "object") throw new Error("Borrador inválido");
  const row = value as Record<string, unknown>;
  for (const key of [
    "number",
    "command",
    "support",
    "date",
    "payment",
    "requestKey",
  ])
    if (typeof row[key] !== "string") throw new Error("Borrador inválido");
  for (const key of ["taxes", "discounts", "tip", "delivery"])
    if (
      typeof row[key] !== "number" ||
      !Number.isFinite(row[key]) ||
      Number(row[key]) < 0
    )
      throw new Error("Borrador inválido");
  if (
    !Array.isArray(row.lines) ||
    !row.lines.length ||
    row.lines.length > 500 ||
    row.lines.some(
      (v) =>
        !v ||
        typeof v.nombre !== "string" ||
        typeof v.cantidad !== "number" ||
        !Number.isFinite(v.cantidad) ||
        typeof v.precioUnitario !== "number" ||
        !Number.isFinite(v.precioUnitario),
    )
  )
    throw new Error("Líneas de borrador inválidas");
  if (
    row.savedId !== null &&
    (!Number.isInteger(row.savedId) || Number(row.savedId) < 1)
  )
    throw new Error("Registro de borrador inválido");
  return row as PaperDraft;
}
