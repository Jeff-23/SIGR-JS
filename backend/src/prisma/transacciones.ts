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
    }
  }
  throw ultimoError;
}

export function esConflictoSerializable(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'P2034'
  );
}
