CREATE TYPE "EstadoReserva" AS ENUM ('PENDIENTE', 'CONFIRMADA', 'EN_ESPERA', 'SENTADA', 'CANCELADA', 'NO_ASISTIO', 'COMPLETADA');
CREATE TYPE "EstadoEspera" AS ENUM ('ESPERANDO', 'AVISADO', 'SENTADO', 'CANCELADO');

ALTER TABLE "Pedido" ADD COLUMN "meseroId" INTEGER;
ALTER TABLE "Pago" ADD COLUMN "divisionCuentaId" INTEGER;

CREATE TABLE "Reserva" (
  "id" SERIAL NOT NULL,
  "nombreCliente" VARCHAR(160) NOT NULL,
  "telefono" VARCHAR(30) NOT NULL,
  "correo" VARCHAR(150),
  "personas" INTEGER NOT NULL,
  "fechaHora" TIMESTAMP(3) NOT NULL,
  "duracionMinutos" INTEGER NOT NULL DEFAULT 90,
  "estado" "EstadoReserva" NOT NULL DEFAULT 'PENDIENTE',
  "observaciones" VARCHAR(500),
  "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "actualizadoEn" TIMESTAMP(3) NOT NULL,
  "sucursalId" INTEGER NOT NULL,
  "mesaId" INTEGER,
  "creadoPorId" INTEGER NOT NULL,
  CONSTRAINT "Reserva_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EntradaListaEspera" (
  "id" SERIAL NOT NULL,
  "nombreCliente" VARCHAR(160) NOT NULL,
  "telefono" VARCHAR(30),
  "personas" INTEGER NOT NULL,
  "estado" "EstadoEspera" NOT NULL DEFAULT 'ESPERANDO',
  "llegadaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "avisadoEn" TIMESTAMP(3),
  "sentadoEn" TIMESTAMP(3),
  "observaciones" VARCHAR(500),
  "sucursalId" INTEGER NOT NULL,
  "mesaId" INTEGER,
  "creadoPorId" INTEGER NOT NULL,
  CONSTRAINT "EntradaListaEspera_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PedidoMesa" (
  "pedidoId" INTEGER NOT NULL,
  "mesaId" INTEGER NOT NULL,
  "principal" BOOLEAN NOT NULL DEFAULT false,
  "vinculadaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PedidoMesa_pkey" PRIMARY KEY ("pedidoId", "mesaId")
);

CREATE TABLE "DivisionCuenta" (
  "id" SERIAL NOT NULL,
  "nombre" VARCHAR(80) NOT NULL,
  "modo" VARCHAR(20) NOT NULL,
  "total" DECIMAL(12,2) NOT NULL,
  "detalles" JSONB,
  "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "ventaId" INTEGER NOT NULL,
  CONSTRAINT "DivisionCuenta_pkey" PRIMARY KEY ("id")
);

INSERT INTO "PedidoMesa" ("pedidoId", "mesaId", "principal")
SELECT "id", "mesaId", true FROM "Pedido" WHERE "mesaId" IS NOT NULL
ON CONFLICT DO NOTHING;
UPDATE "Pedido" SET "meseroId" = "usuarioId" WHERE "meseroId" IS NULL;

CREATE INDEX "Reserva_sucursalId_fechaHora_idx" ON "Reserva"("sucursalId", "fechaHora");
CREATE INDEX "Reserva_mesaId_fechaHora_idx" ON "Reserva"("mesaId", "fechaHora");
CREATE INDEX "Reserva_estado_idx" ON "Reserva"("estado");
CREATE INDEX "EntradaListaEspera_sucursalId_estado_llegadaEn_idx" ON "EntradaListaEspera"("sucursalId", "estado", "llegadaEn");
CREATE INDEX "EntradaListaEspera_mesaId_idx" ON "EntradaListaEspera"("mesaId");
CREATE INDEX "PedidoMesa_mesaId_idx" ON "PedidoMesa"("mesaId");
CREATE UNIQUE INDEX "DivisionCuenta_ventaId_nombre_key" ON "DivisionCuenta"("ventaId", "nombre");
CREATE INDEX "DivisionCuenta_ventaId_idx" ON "DivisionCuenta"("ventaId");
CREATE INDEX "Pago_divisionCuentaId_idx" ON "Pago"("divisionCuentaId");

ALTER TABLE "Pedido" ADD CONSTRAINT "Pedido_meseroId_fkey" FOREIGN KEY ("meseroId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Reserva" ADD CONSTRAINT "Reserva_sucursalId_fkey" FOREIGN KEY ("sucursalId") REFERENCES "Sucursal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Reserva" ADD CONSTRAINT "Reserva_mesaId_fkey" FOREIGN KEY ("mesaId") REFERENCES "Mesa"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Reserva" ADD CONSTRAINT "Reserva_creadoPorId_fkey" FOREIGN KEY ("creadoPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EntradaListaEspera" ADD CONSTRAINT "EntradaListaEspera_sucursalId_fkey" FOREIGN KEY ("sucursalId") REFERENCES "Sucursal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EntradaListaEspera" ADD CONSTRAINT "EntradaListaEspera_mesaId_fkey" FOREIGN KEY ("mesaId") REFERENCES "Mesa"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EntradaListaEspera" ADD CONSTRAINT "EntradaListaEspera_creadoPorId_fkey" FOREIGN KEY ("creadoPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PedidoMesa" ADD CONSTRAINT "PedidoMesa_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "Pedido"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PedidoMesa" ADD CONSTRAINT "PedidoMesa_mesaId_fkey" FOREIGN KEY ("mesaId") REFERENCES "Mesa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DivisionCuenta" ADD CONSTRAINT "DivisionCuenta_ventaId_fkey" FOREIGN KEY ("ventaId") REFERENCES "Venta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Pago" ADD CONSTRAINT "Pago_divisionCuentaId_fkey" FOREIGN KEY ("divisionCuentaId") REFERENCES "DivisionCuenta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
