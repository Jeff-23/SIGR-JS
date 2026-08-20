import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { UsuarioAutenticado } from '../auth/types/usuario-autenticado.type';
import { ContextoAuditoria } from '../auditoria/auditoria-contexto';
import { AuditoriaService } from '../auditoria/auditoria.service';
import {
  CATALOGO_CONFIGURACION,
  validarConfiguracion,
} from './configuracion.catalogo';

@Injectable()
export class ConfiguracionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
  ) {}

  listarRestaurante(usuario: UsuarioAutenticado) {
    const restauranteId = this.obtenerRestauranteId(usuario);
    return this.prisma.configuracionRestaurante.findMany({
      where: { restauranteId },
      orderBy: { clave: 'asc' },
    });
  }

  async actualizarRestaurante(
    claveRecibida: string,
    valorRecibido: unknown,
    usuario: UsuarioAutenticado,
    contexto: ContextoAuditoria,
  ) {
    const restauranteId = this.obtenerRestauranteId(usuario);
    if (usuario.sucursalId !== null) {
      throw new ForbiddenException(
        'Un usuario limitado a sucursal no puede modificar la configuración del restaurante',
      );
    }
    const { clave, valor } = validarConfiguracion(claveRecibida, valorRecibido);

    return this.prisma.$transaction(async (tx) => {
      const anterior = await tx.configuracionRestaurante.findUnique({
        where: { restauranteId_clave: { restauranteId, clave } },
      });
      const resultado = await tx.configuracionRestaurante.upsert({
        where: { restauranteId_clave: { restauranteId, clave } },
        update: { valor },
        create: { restauranteId, clave, valor },
      });
      await this.auditoria.registrar(
        tx,
        {
          accion: anterior
            ? 'CONFIGURACION_ACTUALIZADA'
            : 'CONFIGURACION_CREADA',
          recurso: 'CONFIGURACION_RESTAURANTE',
          recursoId: resultado.id,
          restauranteId,
          antes: anterior
            ? { clave: anterior.clave, valor: anterior.valor }
            : null,
          despues: { clave: resultado.clave, valor: resultado.valor },
        },
        contexto,
      );
      return resultado;
    });
  }

  async listarSucursal(sucursalId: number, usuario: UsuarioAutenticado) {
    await this.validarSucursal(sucursalId, usuario);
    return this.prisma.configuracionSucursal.findMany({
      where: { sucursalId },
      orderBy: { clave: 'asc' },
    });
  }

  async actualizarSucursal(
    sucursalId: number,
    claveRecibida: string,
    valorRecibido: unknown,
    usuario: UsuarioAutenticado,
    contexto: ContextoAuditoria,
  ) {
    await this.validarSucursal(sucursalId, usuario);
    const { clave, valor } = validarConfiguracion(claveRecibida, valorRecibido);

    return this.prisma.$transaction(async (tx) => {
      const anterior = await tx.configuracionSucursal.findUnique({
        where: { sucursalId_clave: { sucursalId, clave } },
      });
      const resultado = await tx.configuracionSucursal.upsert({
        where: { sucursalId_clave: { sucursalId, clave } },
        update: { valor },
        create: { sucursalId, clave, valor },
      });
      await this.auditoria.registrar(
        tx,
        {
          accion: anterior
            ? 'CONFIGURACION_ACTUALIZADA'
            : 'CONFIGURACION_CREADA',
          recurso: 'CONFIGURACION_SUCURSAL',
          recursoId: resultado.id,
          restauranteId: usuario.restauranteId,
          sucursalId,
          antes: anterior
            ? { clave: anterior.clave, valor: anterior.valor }
            : null,
          despues: { clave: resultado.clave, valor: resultado.valor },
        },
        contexto,
      );
      return resultado;
    });
  }

  async obtenerEfectiva(sucursalId: number, usuario: UsuarioAutenticado) {
    const restauranteId = this.obtenerRestauranteId(usuario);
    await this.validarSucursal(sucursalId, usuario);

    const [restaurante, sucursal] = await Promise.all([
      this.prisma.configuracionRestaurante.findMany({
        where: { restauranteId },
      }),
      this.prisma.configuracionSucursal.findMany({ where: { sucursalId } }),
    ]);

    const valores: Record<string, unknown> = Object.fromEntries(
      Object.entries(CATALOGO_CONFIGURACION).map(([clave, definicion]) => [
        clave,
        definicion.valorPredeterminado,
      ]),
    );
    const origenes: Record<
      string,
      'PREDETERMINADO' | 'RESTAURANTE' | 'SUCURSAL'
    > = Object.fromEntries(
      Object.keys(valores).map((clave) => [clave, 'PREDETERMINADO']),
    );

    for (const item of restaurante) {
      valores[item.clave] = item.valor;
      origenes[item.clave] = 'RESTAURANTE';
    }
    for (const item of sucursal) {
      valores[item.clave] = item.valor;
      origenes[item.clave] = 'SUCURSAL';
    }

    return { restauranteId, sucursalId, valores, origenes };
  }

  private obtenerRestauranteId(usuario: UsuarioAutenticado): number {
    if (usuario.restauranteId === null) {
      throw new ForbiddenException(
        'La configuración requiere un contexto explícito de restaurante',
      );
    }
    return usuario.restauranteId;
  }

  private async validarSucursal(
    sucursalId: number,
    usuario: UsuarioAutenticado,
  ) {
    const restauranteId = this.obtenerRestauranteId(usuario);
    const sucursal = await this.prisma.sucursal.findFirst({
      where: { id: sucursalId, restauranteId },
      select: { id: true },
    });
    if (!sucursal) {
      throw new NotFoundException('Sucursal no encontrada');
    }
    if (usuario.sucursalId !== null && usuario.sucursalId !== sucursalId) {
      throw new ForbiddenException(
        'La sucursal no pertenece al alcance del usuario',
      );
    }
  }
}
