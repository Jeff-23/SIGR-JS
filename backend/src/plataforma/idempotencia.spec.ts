import {
  hashSolicitud,
  normalizarClaveIdempotencia,
  validarReplayIdempotente,
} from './idempotencia';

describe('idempotencia', () => {
  it('produce el mismo hash sin depender del orden de propiedades', () => {
    expect(hashSolicitud({ b: 2, a: { z: 1, y: 0 } })).toBe(
      hashSolicitud({ a: { y: 0, z: 1 }, b: 2 }),
    );
  });

  it('valida y normaliza claves', () => {
    expect(normalizarClaveIdempotencia(' venta-001 ')).toBe('venta-001');
    expect(() => normalizarClaveIdempotencia('corta')).toThrow(
      'Idempotency-Key es obligatorio',
    );
  });

  it('rechaza reutilizar una clave con otro contenido', () => {
    expect(() => validarReplayIdempotente('hash-a', 'hash-b')).toThrow(
      'solicitud diferente',
    );
  });
});
