export type ArchiveFilters = {
  search: string;
  from: string;
  to: string;
  minimum: string;
  maximum: string;
  origin: string;
};

export function archiveParams(
  filters: ArchiveFilters,
  branchId: number | null,
) {
  return {
    buscar: filters.search.trim() || undefined,
    // Persistencia UTC; los días seleccionados representan el calendario colombiano.
    desde: filters.from ? `${filters.from}T00:00:00-05:00` : undefined,
    hasta: filters.to ? `${filters.to}T23:59:59.999-05:00` : undefined,
    montoDesde: filters.minimum === "" ? undefined : Number(filters.minimum),
    montoHasta: filters.maximum === "" ? undefined : Number(filters.maximum),
    origen: filters.origin || undefined,
    sucursalId: branchId ?? undefined,
  };
}

export function archiveFilterError(filters: ArchiveFilters): string | null {
  if (filters.from && filters.to && filters.from > filters.to)
    return "La fecha inicial no puede ser posterior a la final.";
  for (const value of [filters.minimum, filters.maximum]) {
    if (value !== "" && (!Number.isFinite(Number(value)) || Number(value) < 0))
      return "Los montos deben ser números positivos o cero.";
  }
  if (
    filters.minimum !== "" &&
    filters.maximum !== "" &&
    Number(filters.minimum) > Number(filters.maximum)
  )
    return "El monto mínimo no puede superar al máximo.";
  return null;
}
