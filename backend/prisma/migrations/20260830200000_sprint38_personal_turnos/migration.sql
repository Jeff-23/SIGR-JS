CREATE TYPE "EstadoTurnoPersonal" AS ENUM ('PROGRAMADO', 'ABIERTO', 'CERRADO', 'CANCELADO');
CREATE TYPE "TipoMarcacionPersonal" AS ENUM ('ENTRADA', 'SALIDA');

CREATE TABLE "Empleado" (
  "id" SERIAL NOT NULL, "codigo" VARCHAR(30) NOT NULL, "nombres" VARCHAR(100) NOT NULL,
  "apellidos" VARCHAR(100) NOT NULL, "documento" VARCHAR(40), "cargo" VARCHAR(80) NOT NULL,
  "activo" BOOLEAN NOT NULL DEFAULT true, "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "restauranteId" INTEGER NOT NULL, "sucursalId" INTEGER NOT NULL, "usuarioId" INTEGER,
  CONSTRAINT "Empleado_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "FuncionPersonal" (
  "id" SERIAL NOT NULL, "nombre" VARCHAR(80) NOT NULL, "descripcion" VARCHAR(250),
  "activo" BOOLEAN NOT NULL DEFAULT true, "restauranteId" INTEGER NOT NULL,
  CONSTRAINT "FuncionPersonal_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "EmpleadoFuncion" (
  "empleadoId" INTEGER NOT NULL, "funcionId" INTEGER NOT NULL,
  CONSTRAINT "EmpleadoFuncion_pkey" PRIMARY KEY ("empleadoId", "funcionId")
);
CREATE TABLE "HorarioEmpleado" (
  "id" SERIAL NOT NULL, "diaSemana" INTEGER NOT NULL, "horaInicio" VARCHAR(5) NOT NULL,
  "horaFin" VARCHAR(5) NOT NULL, "activo" BOOLEAN NOT NULL DEFAULT true, "empleadoId" INTEGER NOT NULL,
  CONSTRAINT "HorarioEmpleado_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "TurnoPersonal" (
  "id" SERIAL NOT NULL, "inicioProgramado" TIMESTAMP(3) NOT NULL, "finProgramado" TIMESTAMP(3) NOT NULL,
  "entradaEn" TIMESTAMP(3), "salidaEn" TIMESTAMP(3), "estado" "EstadoTurnoPersonal" NOT NULL DEFAULT 'PROGRAMADO',
  "observaciones" VARCHAR(300), "empleadoId" INTEGER NOT NULL, "sucursalId" INTEGER NOT NULL,
  CONSTRAINT "TurnoPersonal_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "MarcacionPersonal" (
  "id" SERIAL NOT NULL, "tipo" "TipoMarcacionPersonal" NOT NULL, "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "observaciones" VARCHAR(250), "turnoId" INTEGER NOT NULL, "registradoPorId" INTEGER NOT NULL,
  CONSTRAINT "MarcacionPersonal_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "NovedadPersonal" (
  "id" SERIAL NOT NULL, "tipo" VARCHAR(60) NOT NULL, "descripcion" VARCHAR(500) NOT NULL,
  "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "empleadoId" INTEGER NOT NULL,
  "turnoId" INTEGER, "registradoPorId" INTEGER NOT NULL,
  CONSTRAINT "NovedadPersonal_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Empleado_usuarioId_key" ON "Empleado"("usuarioId");
CREATE UNIQUE INDEX "Empleado_restauranteId_codigo_key" ON "Empleado"("restauranteId", "codigo");
CREATE INDEX "Empleado_sucursalId_activo_idx" ON "Empleado"("sucursalId", "activo");
CREATE UNIQUE INDEX "FuncionPersonal_restauranteId_nombre_key" ON "FuncionPersonal"("restauranteId", "nombre");
CREATE UNIQUE INDEX "HorarioEmpleado_empleadoId_diaSemana_horaInicio_key" ON "HorarioEmpleado"("empleadoId", "diaSemana", "horaInicio");
CREATE INDEX "HorarioEmpleado_empleadoId_diaSemana_idx" ON "HorarioEmpleado"("empleadoId", "diaSemana");
CREATE INDEX "TurnoPersonal_sucursalId_estado_inicioProgramado_idx" ON "TurnoPersonal"("sucursalId", "estado", "inicioProgramado");
CREATE INDEX "TurnoPersonal_empleadoId_inicioProgramado_idx" ON "TurnoPersonal"("empleadoId", "inicioProgramado");
CREATE INDEX "MarcacionPersonal_turnoId_fecha_idx" ON "MarcacionPersonal"("turnoId", "fecha");
CREATE INDEX "NovedadPersonal_empleadoId_fecha_idx" ON "NovedadPersonal"("empleadoId", "fecha");
CREATE INDEX "NovedadPersonal_turnoId_idx" ON "NovedadPersonal"("turnoId");

ALTER TABLE "Empleado" ADD CONSTRAINT "Empleado_restauranteId_fkey" FOREIGN KEY ("restauranteId") REFERENCES "Restaurante"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Empleado" ADD CONSTRAINT "Empleado_sucursalId_fkey" FOREIGN KEY ("sucursalId") REFERENCES "Sucursal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Empleado" ADD CONSTRAINT "Empleado_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FuncionPersonal" ADD CONSTRAINT "FuncionPersonal_restauranteId_fkey" FOREIGN KEY ("restauranteId") REFERENCES "Restaurante"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmpleadoFuncion" ADD CONSTRAINT "EmpleadoFuncion_empleadoId_fkey" FOREIGN KEY ("empleadoId") REFERENCES "Empleado"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmpleadoFuncion" ADD CONSTRAINT "EmpleadoFuncion_funcionId_fkey" FOREIGN KEY ("funcionId") REFERENCES "FuncionPersonal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HorarioEmpleado" ADD CONSTRAINT "HorarioEmpleado_empleadoId_fkey" FOREIGN KEY ("empleadoId") REFERENCES "Empleado"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TurnoPersonal" ADD CONSTRAINT "TurnoPersonal_empleadoId_fkey" FOREIGN KEY ("empleadoId") REFERENCES "Empleado"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TurnoPersonal" ADD CONSTRAINT "TurnoPersonal_sucursalId_fkey" FOREIGN KEY ("sucursalId") REFERENCES "Sucursal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MarcacionPersonal" ADD CONSTRAINT "MarcacionPersonal_turnoId_fkey" FOREIGN KEY ("turnoId") REFERENCES "TurnoPersonal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MarcacionPersonal" ADD CONSTRAINT "MarcacionPersonal_registradoPorId_fkey" FOREIGN KEY ("registradoPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "NovedadPersonal" ADD CONSTRAINT "NovedadPersonal_empleadoId_fkey" FOREIGN KEY ("empleadoId") REFERENCES "Empleado"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "NovedadPersonal" ADD CONSTRAINT "NovedadPersonal_turnoId_fkey" FOREIGN KEY ("turnoId") REFERENCES "TurnoPersonal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "NovedadPersonal" ADD CONSTRAINT "NovedadPersonal_registradoPorId_fkey" FOREIGN KEY ("registradoPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
