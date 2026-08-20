export async function ejecutarConReintentos<T>(
  operacion: () => Promise<T>,
  maximoIntentos = 3,
): Promise<T> {
  let ultimoError: unknown;
  for (let intento = 1; intento <= maximoIntentos; intento += 1) {
    try {
      return await operacion();
    } catch (error) {
      ultimoError = error;
      if (!esConflictoSerializable(error) || intento === maximoIntentos) {
        throw error;
      }
      await esperar(intento * 25);
    }
  }
  throw ultimoError;
}

export function esConflictoSerializable(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return false;
  }
  if (error.code === 'P2034') return true;
  if (error.code !== 'P2010' || !('meta' in error)) return false;
  const meta = error.meta;
  if (
    typeof meta === 'object' &&
    meta !== null &&
    'code' in meta &&
    meta.code === '40001'
  ) {
    return true;
  }
  return error instanceof Error && error.message.includes('40001');
}

function esperar(milisegundos: number) {
  return new Promise<void>((resolver) => setTimeout(resolver, milisegundos));
}
