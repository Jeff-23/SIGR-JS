/* eslint-disable @typescript-eslint/no-unsafe-assignment -- Jest asymmetric matchers are typed as any. */
import { PrismaService } from '../../prisma/prisma.service';
import { UsuarioAutenticado } from '../auth/types/usuario-autenticado.type';
import { ComandasService } from './comandas.service';
import { MesasService } from '../mesas/mesas.service';
import { ProductosService } from '../productos/productos.service';

describe('Filtros de sucursal no amplían el alcance', () => {
  const usuario: UsuarioAutenticado = {
    id: 1,
    email: 'operador@test.local',
    rolId: 1,
    rol: 'CAJERO',
    restauranteId: 10,
    sucursalId: 20,
    permisos: [],
    capacidades: [],
  };
  it('conserva simultáneamente sede autorizada y sede solicitada en mesas y estaciones', async () => {
    const findMany = jest.fn();
    const prisma = {
      mesa: { findMany },
      estacionPreparacion: { findMany },
    } as unknown as PrismaService;
    await new MesasService(prisma).findAll(usuario, 30);
    expect(findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({
          zona: expect.objectContaining({
            sucursal: {
              AND: [
                expect.objectContaining({ id: 20, restauranteId: 10 }),
                { id: 30 },
              ],
            },
          }),
        }),
      }),
    );
    await new ComandasService(prisma).listarEstaciones(usuario, 30);
    expect(findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({
          sucursal: {
            AND: [
              expect.objectContaining({ id: 20, restauranteId: 10 }),
              { id: 30 },
            ],
          },
        }),
      }),
    );
  });
  it('no sustituye el id autorizado al filtrar productos', async () => {
    const findMany = jest.fn();
    await new ProductosService({
      producto: { findMany },
    } as unknown as PrismaService).findAll(usuario, 30);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          categoria: expect.objectContaining({
            sucursal: expect.objectContaining({
              id: 20,
              restauranteId: 10,
              AND: [{ id: 30 }],
            }),
          }),
        }),
      }),
    );
  });
  it('rechaza creación de estación fuera de alcance', async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    const create = jest.fn();
    const service = new ComandasService({
      sucursal: { findFirst },
      estacionPreparacion: { create },
    } as unknown as PrismaService);
    await expect(
      service.crearEstacion(
        { sucursalId: 30, codigo: 'BAR', nombre: 'Bar', color: '#123456' },
        usuario,
      ),
    ).rejects.toThrow('Sucursal no encontrada');
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { AND: [{ id: 30 }, expect.objectContaining({ id: 20 })] },
      }),
    );
    expect(create).not.toHaveBeenCalled();
  });
});
