import { ejecutarConReintentos } from './transacciones';

describe('ejecutarConReintentos', () => {
  it('reintenta conflictos serializables y retorna el resultado', async () => {
    const operacion = jest
      .fn<Promise<string>, []>()
      .mockRejectedValueOnce({ code: 'P2034' })
      .mockRejectedValueOnce({ code: 'P2034' })
      .mockResolvedValue('ok');

    await expect(ejecutarConReintentos(operacion)).resolves.toBe('ok');
    expect(operacion).toHaveBeenCalledTimes(3);
  });

  it('no reintenta errores funcionales', async () => {
    const error = new Error('regla de negocio');
    const operacion = jest.fn<Promise<void>, []>().mockRejectedValue(error);

    await expect(ejecutarConReintentos(operacion)).rejects.toBe(error);
    expect(operacion).toHaveBeenCalledTimes(1);
  });

  it('respeta el maximo de intentos', async () => {
    const error = { code: 'P2034' };
    const operacion = jest.fn<Promise<void>, []>().mockRejectedValue(error);

    await expect(ejecutarConReintentos(operacion, 2)).rejects.toBe(error);
    expect(operacion).toHaveBeenCalledTimes(2);
  });

  it('reconoce SQLSTATE 40001 encapsulado por una consulta raw', async () => {
    const operacion = jest
      .fn<Promise<string>, []>()
      .mockRejectedValueOnce({ code: 'P2010', meta: { code: '40001' } })
      .mockResolvedValue('recuperada');

    await expect(ejecutarConReintentos(operacion)).resolves.toBe('recuperada');
    expect(operacion).toHaveBeenCalledTimes(2);
  });
});
