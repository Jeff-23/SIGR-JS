export function reportRange(from: string, to: string) {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(from) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(to) ||
    from > to
  )
    throw new Error("Selecciona un rango válido");
  const start = new Date(`${from}T00:00:00-05:00`),
    end = new Date(`${to}T23:59:59.999-05:00`);
  const duration = end.getTime() - start.getTime() + 1;
  return {
    current: { desde: start.toISOString(), hasta: end.toISOString() },
    previous: {
      desde: new Date(start.getTime() - duration).toISOString(),
      hasta: new Date(start.getTime() - 1).toISOString(),
    },
  };
}
export function csvCell(value: unknown) {
  const raw = String(value ?? "");
  const safe = /^[\s]*[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replaceAll('"', '""')}"`;
}
export function downloadCsv(name: string, rows: unknown[][]) {
  const blob = new Blob(
    ["\uFEFF", rows.map((row) => row.map(csvCell).join(",")).join("\r\n")],
    { type: "text/csv;charset=utf-8" },
  );
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
