import type { Sale } from "./contracts";

export type AccountPart = {
  nombre: string;
  total: number;
  detalles?: unknown;
};

function allocateCents(total: number, weights: number[]) {
  const cents = Math.round(total * 100);
  const sum = weights.reduce((value, item) => value + item, 0);
  if (!(sum > 0)) throw new Error("La distribución debe tener valores positivos");
  let assigned = 0;
  return weights.map((weight, index) => {
    const value =
      index === weights.length - 1
        ? cents - assigned
        : Math.round((cents * weight) / sum);
    assigned += value;
    return value / 100;
  });
}

export function splitPeople(total: number, count: number): AccountPart[] {
  if (!Number.isInteger(count) || count < 2 || count > 50)
    throw new Error("La cantidad de personas debe estar entre 2 y 50");
  return allocateCents(total, Array(count).fill(1)).map((value, index) => ({
    nombre: `Persona ${index + 1}`,
    total: value,
  }));
}

export function splitPercentages(
  total: number,
  percentages: number[],
): AccountPart[] {
  if (
    percentages.length < 2 ||
    percentages.some((value) => !(value > 0)) ||
    Math.abs(percentages.reduce((sum, value) => sum + value, 0) - 100) > 0.001
  )
    throw new Error("Los porcentajes positivos deben sumar exactamente 100");
  return allocateCents(total, percentages).map((value, index) => ({
    nombre: `Parte ${index + 1} (${percentages[index]}%)`,
    total: value,
  }));
}

export function splitProducts(
  sale: Pick<Sale, "total" | "detalles">,
  assignments: number[],
): AccountPart[] {
  if (assignments.length !== sale.detalles.length)
    throw new Error("Cada producto debe asignarse a una cuenta");
  const groups = [...new Set(assignments)].sort((a, b) => a - b);
  if (groups.length < 2 || groups.some((value) => !Number.isInteger(value) || value < 1))
    throw new Error("Se requieren al menos dos grupos válidos");
  const weights = groups.map((group) =>
    sale.detalles.reduce(
      (sum, detail, index) =>
        sum + (assignments[index] === group ? Number(detail.subtotal) : 0),
      0,
    ),
  );
  const totals = allocateCents(Number(sale.total), weights);
  return groups.map((group, index) => ({
    nombre: `Cuenta ${group}`,
    total: totals[index],
    detalles: sale.detalles
      .filter((_, position) => assignments[position] === group)
      .map((detail) => ({ detalleVentaId: detail.id, cantidad: detail.cantidad })),
  }));
}
