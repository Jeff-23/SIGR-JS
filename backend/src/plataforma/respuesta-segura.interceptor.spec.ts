import { sanitizarSalida } from './respuesta-segura.interceptor';

describe('sanitizarSalida', () => {
  it('elimina control interno incluso en relaciones anidadas', () => {
    expect(
      sanitizarSalida({
        id: 1,
        idempotenciaClave: 'interna',
        pagos: [{ id: 2, idempotenciaHash: 'hash', monto: '10.00' }],
      }),
    ).toEqual({ id: 1, pagos: [{ id: 2, monto: '10.00' }] });
  });
});
