import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EstadoVenta, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { UsuarioAutenticado } from '../auth/types/usuario-autenticado.type';
import {
  AsignarFuncionesDto,
  AsignarUnidadesOperativasDto,
  CrearEmpleadoDto,
  CrearUnidadOperativaDto,
  CrearFuncionDto,
  CrearHorarioDto,
  CrearNovedadDto,
  FiltroProductividadDto,
  MarcacionDto,
  ProgramarSemanaDto,
  CancelarTurnoDto,
  RetirarEmpleadoDto,
  ProgramarTurnoDto,
  SucursalPersonalDto,
} from './dto/personal.dto';

@Injectable()
export class PersonalService {
  constructor(private readonly prisma: PrismaService) {}

  async resumen(filtro: SucursalPersonalDto, usuario: UsuarioAutenticado) {
    const branch = await this.sucursal(filtro.sucursalId, usuario);
    const [empleados, funciones, unidadesOperativas, turnos] =
      await Promise.all([
        this.prisma.empleado.findMany({
          where: { sucursalId: branch.id },
          include: {
            usuario: {
              select: {
                id: true,
                email: true,
                activo: true,
                rol: { select: { nombre: true } },
              },
            },
            funciones: { include: { funcion: true } },
            unidadesOperativas: { include: { unidadOperativa: true } },
            horarios: {
              where: { activo: true },
              orderBy: [{ diaSemana: 'asc' }, { horaInicio: 'asc' }],
            },
            novedades: { orderBy: { fecha: 'desc' }, take: 5 },
          },
          orderBy: [{ activo: 'desc' }, { nombres: 'asc' }],
        }),
        this.prisma.funcionPersonal.findMany({
          where: { restauranteId: branch.restauranteId, activo: true },
          orderBy: { nombre: 'asc' },
        }),
        this.prisma.unidadOperativa.findMany({
          where: { sucursalId: branch.id, activo: true },
          orderBy: [{ orden: 'asc' }, { nombre: 'asc' }],
        }),
        this.prisma.turnoPersonal.findMany({
          where: { sucursalId: branch.id },
          include: {
            empleado: true,
            unidadOperativa: true,
            marcaciones: { orderBy: { fecha: 'asc' } },
            novedades: { orderBy: { fecha: 'desc' } },
          },
          orderBy: { inicioProgramado: 'desc' },
          take: 100,
        }),
      ]);
    return { empleados, funciones, unidadesOperativas, turnos };
  }

  async crearEmpleado(data: CrearEmpleadoDto, usuario: UsuarioAutenticado) {
    const branch = await this.sucursal(data.sucursalId, usuario);
    const unitIds = [...new Set(data.unidadOperativaIds ?? [])];
    if (unitIds.length) {
      const unitCount = await this.prisma.unidadOperativa.count({
        where: { id: { in: unitIds }, sucursalId: branch.id, activo: true },
      });
      if (unitCount !== unitIds.length)
        throw new BadRequestException(
          'Una unidad operativa no pertenece a la sede',
        );
    }
    if (data.usuarioId) {
      const account = await this.prisma.usuario.findFirst({
        where: {
          id: data.usuarioId,
          restauranteId: branch.restauranteId,
          activo: true,
          OR: [{ sucursalId: null }, { sucursalId: branch.id }],
        },
        include: { empleado: { select: { id: true } } },
      });
      if (!account)
        throw new BadRequestException(
          'El usuario no pertenece al restaurante o sede, o está inactivo',
        );
      if (account.empleado)
        throw new BadRequestException(
          'El usuario ya está vinculado a otro empleado',
        );
    }
    return this.prisma.empleado.create({
      data: {
        codigo: data.codigo.trim().toUpperCase(),
        nombres: data.nombres.trim(),
        apellidos: data.apellidos.trim(),
        documento: data.documento?.trim(),
        cargo: data.cargo.trim(),
        usuarioId: data.usuarioId,
        restauranteId: branch.restauranteId,
        sucursalId: branch.id,
        unidadesOperativas: unitIds.length
          ? {
              create: unitIds.map((unidadOperativaId) => ({
                unidadOperativa: { connect: { id: unidadOperativaId } },
              })),
            }
          : undefined,
      },
      include: { unidadesOperativas: { include: { unidadOperativa: true } } },
    });
  }

  async retirarEmpleado(
    id: number,
    data: RetirarEmpleadoDto,
    usuario: UsuarioAutenticado,
  ) {
    const employee = await this.empleado(id, usuario);
    if (!employee.activo)
      throw new BadRequestException('El empleado ya está retirado del personal');

    const motivo = data.motivo.trim();
    if (!motivo) throw new BadRequestException('Indica el motivo del retiro');

    const openShift = await this.prisma.turnoPersonal.findFirst({
      where: { empleadoId: employee.id, estado: 'ABIERTO' },
      select: { id: true },
    });
    if (openShift)
      throw new BadRequestException(
        'El empleado tiene un turno abierto. Registra la salida antes de retirarlo',
      );

    return this.prisma.$transaction(async (tx) => {
      await tx.empleado.update({
        where: { id: employee.id },
        data: { activo: false },
      });
      await tx.horarioEmpleado.updateMany({
        where: { empleadoId: employee.id, activo: true },
        data: { activo: false },
      });
      await tx.turnoPersonal.updateMany({
        where: { empleadoId: employee.id, estado: 'PROGRAMADO' },
        data: { estado: 'CANCELADO' },
      });
      if (data.desactivarUsuario && employee.usuarioId) {
        await tx.usuario.update({
          where: { id: employee.usuarioId },
          data: { activo: false },
        });
      }
      await tx.novedadPersonal.create({
        data: {
          empleadoId: employee.id,
          tipo: 'RETIRO_PERSONAL',
          descripcion: data.desactivarUsuario && employee.usuarioId
            ? `${motivo} · Acceso SIGR desactivado`
            : motivo,
          registradoPorId: usuario.id,
        },
      });
      return tx.empleado.findUnique({
        where: { id: employee.id },
        include: { usuario: { select: { id: true, email: true, activo: true } } },
      });
    });
  }

  async crearUnidadOperativa(
    data: CrearUnidadOperativaDto,
    usuario: UsuarioAutenticado,
  ) {
    const branch = await this.sucursal(data.sucursalId, usuario);
    const nombre = data.nombre.trim();
    if (!nombre)
      throw new BadRequestException('Indica el nombre de la unidad operativa');
    return this.prisma.unidadOperativa.create({
      data: {
        nombre,
        descripcion: data.descripcion?.trim() || null,
        orden: data.orden ?? 0,
        sucursalId: branch.id,
      },
    });
  }

  async desactivarUnidadOperativa(
    id: number,
    data: SucursalPersonalDto,
    usuario: UsuarioAutenticado,
  ) {
    const branch = await this.sucursal(data.sucursalId, usuario);
    const unit = await this.prisma.unidadOperativa.findFirst({
      where: { id, sucursalId: branch.id, activo: true },
    });
    if (!unit) throw new NotFoundException('Unidad operativa no encontrada');
    return this.prisma.unidadOperativa.update({
      where: { id },
      data: { activo: false },
    });
  }

  async asignarUnidadesOperativas(
    empleadoId: number,
    data: AsignarUnidadesOperativasDto,
    usuario: UsuarioAutenticado,
  ) {
    const employee = await this.empleado(empleadoId, usuario);
    const ids = [...new Set(data.unidadOperativaIds)];
    const count = await this.prisma.unidadOperativa.count({
      where: {
        id: { in: ids },
        sucursalId: employee.sucursalId,
        activo: true,
      },
    });
    if (count !== ids.length)
      throw new BadRequestException(
        'Una unidad operativa no pertenece a la sede',
      );
    return this.prisma.$transaction(async (tx) => {
      await tx.empleadoUnidadOperativa.deleteMany({ where: { empleadoId } });
      if (ids.length) {
        await tx.empleadoUnidadOperativa.createMany({
          data: ids.map((unidadOperativaId, index) => ({
            empleadoId,
            unidadOperativaId,
            principal: index === 0,
          })),
        });
      }
      return tx.empleado.findUnique({
        where: { id: empleadoId },
        include: { unidadesOperativas: { include: { unidadOperativa: true } } },
      });
    });
  }

  async crearFuncion(data: CrearFuncionDto, usuario: UsuarioAutenticado) {
    return this.prisma.funcionPersonal.create({
      data: {
        nombre: data.nombre.trim(),
        descripcion: data.descripcion,
        restauranteId: this.restaurante(usuario),
      },
    });
  }

  async asignarFunciones(
    id: number,
    data: AsignarFuncionesDto,
    usuario: UsuarioAutenticado,
  ) {
    const employee = await this.empleado(id, usuario);
    const count = await this.prisma.funcionPersonal.count({
      where: {
        id: { in: data.funcionIds },
        restauranteId: employee.restauranteId,
        activo: true,
      },
    });
    if (count !== new Set(data.funcionIds).size)
      throw new BadRequestException('Una función no pertenece al restaurante');
    return this.prisma.$transaction(async (tx) => {
      await tx.empleadoFuncion.deleteMany({ where: { empleadoId: id } });
      if (data.funcionIds.length)
        await tx.empleadoFuncion.createMany({
          data: [...new Set(data.funcionIds)].map((funcionId) => ({
            empleadoId: id,
            funcionId,
          })),
        });
      return tx.empleado.findUnique({
        where: { id },
        include: { funciones: { include: { funcion: true } } },
      });
    });
  }

  async crearHorario(
    id: number,
    data: CrearHorarioDto,
    usuario: UsuarioAutenticado,
  ) {
    await this.empleado(id, usuario);
    if (data.horaFin === data.horaInicio)
      throw new BadRequestException(
        'La hora de inicio y la hora final no pueden ser iguales',
      );

    return this.prisma.$transaction(async (tx) => {
      // Un empleado mantiene un único horario habitual activo por día.
      // Si la hora final es menor que la inicial, el turno termina al día siguiente.
      await tx.horarioEmpleado.updateMany({
        where: { empleadoId: id, diaSemana: data.diaSemana, activo: true },
        data: { activo: false },
      });

      return tx.horarioEmpleado.upsert({
        where: {
          empleadoId_diaSemana_horaInicio: {
            empleadoId: id,
            diaSemana: data.diaSemana,
            horaInicio: data.horaInicio,
          },
        },
        update: { horaFin: data.horaFin, activo: true },
        create: { empleadoId: id, ...data },
      });
    });
  }

  async desactivarHorario(
    empleadoId: number,
    horarioId: number,
    usuario: UsuarioAutenticado,
  ) {
    await this.empleado(empleadoId, usuario);
    const schedule = await this.prisma.horarioEmpleado.findFirst({
      where: { id: horarioId, empleadoId, activo: true },
    });
    if (!schedule)
      throw new NotFoundException('Horario habitual no encontrado');
    return this.prisma.horarioEmpleado.update({
      where: { id: horarioId },
      data: { activo: false },
    });
  }

  async programarSemana(data: ProgramarSemanaDto, usuario: UsuarioAutenticado) {
    const employee = await this.empleado(data.empleadoId, usuario);
    if (employee.sucursalId !== data.sucursalId)
      throw new BadRequestException('El empleado no pertenece a la sede');
    if (data.unidadOperativaId) {
      const assigned = await this.prisma.empleadoUnidadOperativa.findFirst({
        where: {
          empleadoId: employee.id,
          unidadOperativaId: data.unidadOperativaId,
          unidadOperativa: { sucursalId: data.sucursalId, activo: true },
        },
      });
      if (!assigned)
        throw new BadRequestException(
          'El empleado no está asignado a esa unidad operativa',
        );
    }

    const weekStart = new Date(data.semanaInicio);
    const weekEnd = new Date(weekStart);
    weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);
    for (const shift of data.turnos) {
      if (
        shift.inicioProgramado < weekStart ||
        shift.inicioProgramado >= weekEnd
      )
        throw new BadRequestException(
          'Hay un turno fuera de la semana seleccionada',
        );
      if (shift.finProgramado <= shift.inicioProgramado)
        throw new BadRequestException('Hay un turno con duración inválida');
      if (
        shift.finProgramado.getTime() - shift.inicioProgramado.getTime() >
        24 * 3600000
      )
        throw new BadRequestException('Un turno no puede superar 24 horas');
    }

    return this.prisma.transaccionSerializable(async (tx) => {
      const protectedShifts = await tx.turnoPersonal.findMany({
        where: {
          empleadoId: employee.id,
          sucursalId: data.sucursalId,
          estado: { in: ['ABIERTO', 'CERRADO'] },
          unidadOperativaId: data.unidadOperativaId ?? null,
          inicioProgramado: { lt: weekEnd },
          finProgramado: { gt: weekStart },
        },
      });

      const existingPlanned = await tx.turnoPersonal.findMany({
        where: {
          empleadoId: employee.id,
          sucursalId: data.sucursalId,
          estado: 'PROGRAMADO',
          unidadOperativaId: data.unidadOperativaId ?? null,
          inicioProgramado: { gte: weekStart, lt: weekEnd },
        },
      });
      const otherUnitShifts = await tx.turnoPersonal.findMany({
        where: {
          empleadoId: employee.id,
          sucursalId: data.sucursalId,
          estado: { not: 'CANCELADO' },
          unidadOperativaId: data.unidadOperativaId
            ? { not: data.unidadOperativaId }
            : { not: null },
          inicioProgramado: { lt: weekEnd },
          finProgramado: { gt: weekStart },
        },
      });
      const samePlannedShift = (
        current: (typeof existingPlanned)[number],
        incoming: ProgramarSemanaDto['turnos'][number],
      ) => {
        const currentPlanning = current as typeof current & {
          etiqueta?: string | null;
          minutosPausa?: number;
        };
        return (
          current.inicioProgramado.getTime() ===
            incoming.inicioProgramado.getTime() &&
          current.finProgramado.getTime() ===
            incoming.finProgramado.getTime() &&
          (currentPlanning.etiqueta ?? '') ===
            (incoming.etiqueta?.trim() ?? '') &&
          (currentPlanning.minutosPausa ?? 0) === (incoming.minutosPausa ?? 0)
        );
      };

      for (const current of existingPlanned) {
        if (data.turnos.some((incoming) => samePlannedShift(current, incoming)))
          continue;
        await tx.turnoPersonal.update({
          where: { id: current.id },
          data: {
            estado: 'CANCELADO',
            observaciones: 'Reprogramado desde planificación semanal',
          },
        });
      }

      for (const shift of data.turnos) {
        if (existingPlanned.some((current) => samePlannedShift(current, shift)))
          continue;
        const otherUnitOverlap = otherUnitShifts.find(
          (current) =>
            current.inicioProgramado < shift.finProgramado &&
            current.finProgramado > shift.inicioProgramado,
        );
        if (otherUnitOverlap)
          throw new BadRequestException(
            'El empleado ya tiene un turno en otra unidad operativa durante ese horario',
          );
        const protectedOverlap = protectedShifts.find(
          (current) =>
            current.inicioProgramado < shift.finProgramado &&
            current.finProgramado > shift.inicioProgramado,
        );
        if (protectedOverlap) {
          const sameShift =
            protectedOverlap.inicioProgramado.getTime() ===
              shift.inicioProgramado.getTime() &&
            protectedOverlap.finProgramado.getTime() ===
              shift.finProgramado.getTime();
          if (sameShift) continue;
          throw new BadRequestException(
            'Un turno ya abierto o cerrado se cruza con la nueva programación',
          );
        }
        await tx.turnoPersonal.create({
          data: {
            empleadoId: employee.id,
            sucursalId: data.sucursalId,
            inicioProgramado: shift.inicioProgramado,
            finProgramado: shift.finProgramado,
            observaciones: shift.observaciones,
            etiqueta: shift.etiqueta?.trim() || null,
            minutosPausa: shift.minutosPausa ?? 0,
            unidadOperativaId:
              data.unidadOperativaId ?? shift.unidadOperativaId ?? null,
          } as Prisma.TurnoPersonalUncheckedCreateInput,
        });
      }

      return tx.turnoPersonal.findMany({
        where: {
          empleadoId: employee.id,
          sucursalId: data.sucursalId,
          estado: 'PROGRAMADO',
          unidadOperativaId: data.unidadOperativaId ?? null,
          inicioProgramado: { gte: weekStart, lt: weekEnd },
        },
        orderBy: { inicioProgramado: 'asc' },
      });
    });
  }

  async programarTurno(data: ProgramarTurnoDto, usuario: UsuarioAutenticado) {
    const employee = await this.empleado(data.empleadoId, usuario);
    if (employee.sucursalId !== data.sucursalId)
      throw new BadRequestException('El empleado no pertenece a la sede');
    if (data.finProgramado <= data.inicioProgramado)
      throw new BadRequestException('El turno debe tener una duración válida');
    if (data.unidadOperativaId) {
      const assigned = await this.prisma.empleadoUnidadOperativa.findFirst({
        where: {
          empleadoId: employee.id,
          unidadOperativaId: data.unidadOperativaId,
          unidadOperativa: { sucursalId: data.sucursalId, activo: true },
        },
      });
      if (!assigned)
        throw new BadRequestException(
          'El empleado no está asignado a esa unidad operativa',
        );
    }
    const overlap = await this.prisma.turnoPersonal.findFirst({
      where: {
        empleadoId: employee.id,
        estado: { not: 'CANCELADO' },
        inicioProgramado: { lt: data.finProgramado },
        finProgramado: { gt: data.inicioProgramado },
      },
    });
    if (overlap)
      throw new BadRequestException(
        'El empleado ya tiene un turno en ese horario',
      );
    return this.prisma.turnoPersonal.create({ data });
  }

  async cancelarTurno(
    id: number,
    data: CancelarTurnoDto,
    usuario: UsuarioAutenticado,
  ) {
    const shift = await this.prisma.turnoPersonal.findUnique({
      where: { id },
      include: { empleado: true },
    });
    if (!shift) throw new NotFoundException('Turno no encontrado');
    this.alcance(shift.empleado.restauranteId, shift.sucursalId, usuario);
    if (shift.estado !== 'PROGRAMADO')
      throw new BadRequestException(
        'Sólo puede cancelarse un turno programado',
      );
    const reason = data.motivo.trim();
    if (!reason)
      throw new BadRequestException('Indica el motivo de cancelación');
    return this.prisma.turnoPersonal.update({
      where: { id },
      data: {
        estado: 'CANCELADO',
        observaciones: reason,
      },
      include: { empleado: true },
    });
  }

  async marcar(
    id: number,
    tipo: 'ENTRADA' | 'SALIDA',
    data: MarcacionDto,
    usuario: UsuarioAutenticado,
  ) {
    return this.prisma.transaccionSerializable(async (tx) => {
      const shift = await tx.turnoPersonal.findUnique({
        where: { id },
        include: { empleado: true },
      });
      if (!shift) throw new NotFoundException('Turno no encontrado');
      this.alcance(shift.empleado.restauranteId, shift.sucursalId, usuario);
      if (tipo === 'ENTRADA' && shift.estado !== 'PROGRAMADO')
        throw new BadRequestException(
          'El turno no admite marcación de entrada',
        );
      if (tipo === 'SALIDA' && shift.estado !== 'ABIERTO')
        throw new BadRequestException('El turno no admite marcación de salida');
      const now = new Date();
      await tx.marcacionPersonal.create({
        data: {
          turnoId: id,
          registradoPorId: usuario.id,
          tipo,
          fecha: now,
          observaciones: data.observaciones,
        },
      });
      return tx.turnoPersonal.update({
        where: { id },
        data:
          tipo === 'ENTRADA'
            ? { estado: 'ABIERTO', entradaEn: now }
            : { estado: 'CERRADO', salidaEn: now },
        include: { empleado: true, marcaciones: true },
      });
    });
  }

  async novedad(data: CrearNovedadDto, usuario: UsuarioAutenticado) {
    const employee = await this.empleado(data.empleadoId, usuario);
    if (data.turnoId) {
      const shift = await this.prisma.turnoPersonal.findFirst({
        where: { id: data.turnoId, empleadoId: employee.id },
      });
      if (!shift)
        throw new BadRequestException('El turno no corresponde al empleado');
    }
    return this.prisma.novedadPersonal.create({
      data: {
        ...data,
        tipo: data.tipo.trim().toUpperCase(),
        registradoPorId: usuario.id,
      },
    });
  }

  async productividad(
    filtro: FiltroProductividadDto,
    usuario: UsuarioAutenticado,
  ) {
    const branch = await this.sucursal(filtro.sucursalId, usuario);
    if (filtro.desde > filtro.hasta)
      throw new BadRequestException('Periodo inválido');
    const end = new Date(filtro.hasta);
    end.setUTCDate(end.getUTCDate() + 1);
    const employees = await this.prisma.empleado.findMany({
      where: { sucursalId: branch.id, activo: true },
      include: {
        turnos: {
          where: {
            entradaEn: { gte: filtro.desde, lt: end },
            estado: 'CERRADO',
          },
        },
      },
    });
    return Promise.all(
      employees.map(async (employee) => {
        const [orders, sales] = employee.usuarioId
          ? await Promise.all([
              this.prisma.pedido.count({
                where: {
                  sucursalId: branch.id,
                  OR: [
                    { usuarioId: employee.usuarioId },
                    { meseroId: employee.usuarioId },
                  ],
                  creadoEn: { gte: filtro.desde, lt: end },
                },
              }),
              this.prisma.venta.aggregate({
                where: {
                  sucursalId: branch.id,
                  usuarioId: employee.usuarioId,
                  estado: { not: EstadoVenta.ANULADA },
                  fechaOperacion: { gte: filtro.desde, lt: end },
                },
                _sum: { total: true },
              }),
            ])
          : [0, { _sum: { total: new Prisma.Decimal(0) } }];
        const hours = employee.turnos.reduce(
          (sum, shift) =>
            sum +
            ((shift.salidaEn?.getTime() ?? 0) -
              (shift.entradaEn?.getTime() ?? 0)) /
              3600000,
          0,
        );
        return {
          empleadoId: employee.id,
          empleado: `${employee.nombres} ${employee.apellidos}`,
          cargo: employee.cargo,
          horas: Math.max(0, hours),
          pedidos: orders,
          ventas: sales._sum.total ?? 0,
          pedidosPorHora: hours > 0 ? orders / hours : 0,
        };
      }),
    );
  }

  private restaurante(usuario: UsuarioAutenticado) {
    if (usuario.restauranteId === null)
      throw new ForbiddenException('Se requiere contexto de restaurante');
    return usuario.restauranteId;
  }
  private alcance(
    restauranteId: number,
    sucursalId: number,
    usuario: UsuarioAutenticado,
  ) {
    if (
      this.restaurante(usuario) !== restauranteId ||
      (usuario.sucursalId !== null && usuario.sucursalId !== sucursalId)
    )
      throw new ForbiddenException('Recurso fuera del alcance');
  }
  private async sucursal(id: number, usuario: UsuarioAutenticado) {
    const branch = await this.prisma.sucursal.findFirst({
      where: {
        id,
        restauranteId: this.restaurante(usuario),
        ...(usuario.sucursalId ? { id: usuario.sucursalId } : {}),
      },
    });
    if (!branch) throw new NotFoundException('Sucursal no encontrada');
    return branch;
  }
  private async empleado(id: number, usuario: UsuarioAutenticado) {
    const employee = await this.prisma.empleado.findUnique({ where: { id } });
    if (!employee) throw new NotFoundException('Empleado no encontrado');
    this.alcance(employee.restauranteId, employee.sucursalId, usuario);
    if (!employee.activo)
      throw new BadRequestException('El empleado está retirado del personal');
    return employee;
  }
}
