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
  CrearEmpleadoDto,
  CrearFuncionDto,
  CrearHorarioDto,
  CrearNovedadDto,
  FiltroProductividadDto,
  MarcacionDto,
  ProgramarTurnoDto,
  SucursalPersonalDto,
} from './dto/personal.dto';

@Injectable()
export class PersonalService {
  constructor(private readonly prisma: PrismaService) {}

  async resumen(filtro: SucursalPersonalDto, usuario: UsuarioAutenticado) {
    const branch = await this.sucursal(filtro.sucursalId, usuario);
    const [empleados, funciones, turnos] = await Promise.all([
      this.prisma.empleado.findMany({
        where: { sucursalId: branch.id },
        include: {
          usuario: { select: { id: true, email: true } },
          funciones: { include: { funcion: true } },
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
      this.prisma.turnoPersonal.findMany({
        where: { sucursalId: branch.id },
        include: {
          empleado: true,
          marcaciones: { orderBy: { fecha: 'asc' } },
          novedades: { orderBy: { fecha: 'desc' } },
        },
        orderBy: { inicioProgramado: 'desc' },
        take: 100,
      }),
    ]);
    return { empleados, funciones, turnos };
  }

  async crearEmpleado(data: CrearEmpleadoDto, usuario: UsuarioAutenticado) {
    const branch = await this.sucursal(data.sucursalId, usuario);
    if (data.usuarioId) {
      const account = await this.prisma.usuario.findFirst({
        where: {
          id: data.usuarioId,
          restauranteId: branch.restauranteId,
          OR: [{ sucursalId: null }, { sucursalId: branch.id }],
        },
      });
      if (!account)
        throw new BadRequestException(
          'El usuario no pertenece al restaurante o sede',
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
      },
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
    if (data.horaFin <= data.horaInicio)
      throw new BadRequestException(
        'La hora final debe ser posterior a la inicial',
      );
    return this.prisma.horarioEmpleado.create({
      data: { empleadoId: id, ...data },
    });
  }

  async programarTurno(data: ProgramarTurnoDto, usuario: UsuarioAutenticado) {
    const employee = await this.empleado(data.empleadoId, usuario);
    if (employee.sucursalId !== data.sucursalId)
      throw new BadRequestException('El empleado no pertenece a la sede');
    if (data.finProgramado <= data.inicioProgramado)
      throw new BadRequestException('El turno debe tener una duración válida');
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
    return employee;
  }
}
