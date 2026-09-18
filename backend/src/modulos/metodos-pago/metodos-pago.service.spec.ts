import { MetodosPagoService } from './metodos-pago.service';

describe('MetodosPagoService', () => {
  it('solo consulta métodos activos para la operación de Caja', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const prisma = { metodoPago: { findMany } };
    const service = new MetodosPagoService(prisma as never);

    await service.findAll();

    expect(findMany).toHaveBeenCalledWith({
      where: { activo: true },
      orderBy: [{ tipo: 'asc' }, { nombre: 'asc' }],
    });
  });
});
