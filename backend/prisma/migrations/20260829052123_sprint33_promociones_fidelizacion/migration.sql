-- CreateEnum
CREATE TYPE "TipoBeneficioPromocion" AS ENUM ('PORCENTAJE', 'VALOR_FIJO');

-- CreateEnum
CREATE TYPE "TipoMovimientoPuntos" AS ENUM ('ACUMULACION', 'REDENCION', 'AJUSTE', 'REVERSO');

-- CreateEnum
CREATE TYPE "CanalComunicacion" AS ENUM ('EMAIL', 'SMS', 'WHATSAPP');

-- DropForeignKey
ALTER TABLE "DocumentoElectronico" DROP CONSTRAINT "DocumentoElectronico_resolucionId_fkey";

-- DropForeignKey
ALTER TABLE "HistorialDocumentoFiscal" DROP CONSTRAINT "HistorialDocumentoFiscal_documentoId_fkey";

-- DropForeignKey
ALTER TABLE "OutboxFiscal" DROP CONSTRAINT "OutboxFiscal_documentoId_fkey";

-- DropForeignKey
ALTER TABLE "PerfilFiscal" DROP CONSTRAINT "PerfilFiscal_restauranteId_fkey";

-- DropForeignKey
ALTER TABLE "ResolucionNumeracionDian" DROP CONSTRAINT "ResolucionNumeracionDian_restauranteId_fkey";

-- DropForeignKey
ALTER TABLE "ResolucionNumeracionDian" DROP CONSTRAINT "ResolucionNumeracionDian_sucursalId_fkey";

-- CreateTable
CREATE TABLE "Promocion" (
    "id" SERIAL NOT NULL,
    "nombre" VARCHAR(120) NOT NULL,
    "descripcion" VARCHAR(500),
    "tipo" "TipoBeneficioPromocion" NOT NULL,
    "valor" DECIMAL(12,2) NOT NULL,
    "compraMinima" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "fechaInicio" TIMESTAMP(3) NOT NULL,
    "fechaFin" TIMESTAMP(3) NOT NULL,
    "diasSemana" INTEGER[],
    "horaInicio" VARCHAR(5),
    "horaFin" VARCHAR(5),
    "requiereCupon" BOOLEAN NOT NULL DEFAULT false,
    "combinable" BOOLEAN NOT NULL DEFAULT false,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,
    "restauranteId" INTEGER NOT NULL,
    "sucursalId" INTEGER,

    CONSTRAINT "Promocion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromocionProducto" (
    "promocionId" INTEGER NOT NULL,
    "productoId" INTEGER NOT NULL,

    CONSTRAINT "PromocionProducto_pkey" PRIMARY KEY ("promocionId","productoId")
);

-- CreateTable
CREATE TABLE "Cupon" (
    "id" SERIAL NOT NULL,
    "codigo" VARCHAR(50) NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "usosMaximos" INTEGER,
    "usosActuales" INTEGER NOT NULL DEFAULT 0,
    "validoDesde" TIMESTAMP(3),
    "validoHasta" TIMESTAMP(3),
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "restauranteId" INTEGER NOT NULL,
    "promocionId" INTEGER NOT NULL,
    "clienteId" INTEGER,

    CONSTRAINT "Cupon_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AplicacionDescuento" (
    "id" SERIAL NOT NULL,
    "origen" VARCHAR(20) NOT NULL,
    "nombre" VARCHAR(120) NOT NULL,
    "monto" DECIMAL(12,2) NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ventaId" INTEGER NOT NULL,
    "promocionId" INTEGER,
    "cuponId" INTEGER,

    CONSTRAINT "AplicacionDescuento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NivelFidelizacion" (
    "id" SERIAL NOT NULL,
    "nombre" VARCHAR(80) NOT NULL,
    "puntosMinimos" INTEGER NOT NULL,
    "multiplicador" DECIMAL(6,2) NOT NULL DEFAULT 1,
    "beneficios" JSONB,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "restauranteId" INTEGER NOT NULL,

    CONSTRAINT "NivelFidelizacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CuentaFidelizacion" (
    "id" SERIAL NOT NULL,
    "saldoPuntos" INTEGER NOT NULL DEFAULT 0,
    "puntosHistoricos" INTEGER NOT NULL DEFAULT 0,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,
    "clienteId" INTEGER NOT NULL,
    "nivelId" INTEGER,

    CONSTRAINT "CuentaFidelizacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MovimientoPuntos" (
    "id" SERIAL NOT NULL,
    "tipo" "TipoMovimientoPuntos" NOT NULL,
    "puntos" INTEGER NOT NULL,
    "saldoPosterior" INTEGER NOT NULL,
    "motivo" VARCHAR(250) NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cuentaId" INTEGER NOT NULL,
    "ventaId" INTEGER,
    "usuarioId" INTEGER,

    CONSTRAINT "MovimientoPuntos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsentimientoCliente" (
    "id" SERIAL NOT NULL,
    "canal" "CanalComunicacion" NOT NULL,
    "otorgado" BOOLEAN NOT NULL,
    "fuente" VARCHAR(80) NOT NULL,
    "registradoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revocadoEn" TIMESTAMP(3),
    "clienteId" INTEGER NOT NULL,
    "usuarioId" INTEGER NOT NULL,

    CONSTRAINT "ConsentimientoCliente_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Promocion_restauranteId_activa_fechaInicio_fechaFin_idx" ON "Promocion"("restauranteId", "activa", "fechaInicio", "fechaFin");

-- CreateIndex
CREATE INDEX "Promocion_sucursalId_idx" ON "Promocion"("sucursalId");

-- CreateIndex
CREATE INDEX "PromocionProducto_productoId_idx" ON "PromocionProducto"("productoId");

-- CreateIndex
CREATE INDEX "Cupon_promocionId_idx" ON "Cupon"("promocionId");

-- CreateIndex
CREATE INDEX "Cupon_clienteId_idx" ON "Cupon"("clienteId");

-- CreateIndex
CREATE UNIQUE INDEX "Cupon_restauranteId_codigo_key" ON "Cupon"("restauranteId", "codigo");

-- CreateIndex
CREATE INDEX "AplicacionDescuento_ventaId_idx" ON "AplicacionDescuento"("ventaId");

-- CreateIndex
CREATE INDEX "AplicacionDescuento_promocionId_idx" ON "AplicacionDescuento"("promocionId");

-- CreateIndex
CREATE INDEX "AplicacionDescuento_cuponId_idx" ON "AplicacionDescuento"("cuponId");

-- CreateIndex
CREATE INDEX "NivelFidelizacion_restauranteId_puntosMinimos_idx" ON "NivelFidelizacion"("restauranteId", "puntosMinimos");

-- CreateIndex
CREATE UNIQUE INDEX "NivelFidelizacion_restauranteId_nombre_key" ON "NivelFidelizacion"("restauranteId", "nombre");

-- CreateIndex
CREATE UNIQUE INDEX "CuentaFidelizacion_clienteId_key" ON "CuentaFidelizacion"("clienteId");

-- CreateIndex
CREATE INDEX "CuentaFidelizacion_nivelId_idx" ON "CuentaFidelizacion"("nivelId");

-- CreateIndex
CREATE INDEX "MovimientoPuntos_cuentaId_creadoEn_idx" ON "MovimientoPuntos"("cuentaId", "creadoEn");

-- CreateIndex
CREATE INDEX "MovimientoPuntos_ventaId_idx" ON "MovimientoPuntos"("ventaId");

-- CreateIndex
CREATE INDEX "ConsentimientoCliente_usuarioId_idx" ON "ConsentimientoCliente"("usuarioId");

-- CreateIndex
CREATE UNIQUE INDEX "ConsentimientoCliente_clienteId_canal_key" ON "ConsentimientoCliente"("clienteId", "canal");

-- AddForeignKey
ALTER TABLE "Promocion" ADD CONSTRAINT "Promocion_restauranteId_fkey" FOREIGN KEY ("restauranteId") REFERENCES "Restaurante"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Promocion" ADD CONSTRAINT "Promocion_sucursalId_fkey" FOREIGN KEY ("sucursalId") REFERENCES "Sucursal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromocionProducto" ADD CONSTRAINT "PromocionProducto_promocionId_fkey" FOREIGN KEY ("promocionId") REFERENCES "Promocion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromocionProducto" ADD CONSTRAINT "PromocionProducto_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "Producto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cupon" ADD CONSTRAINT "Cupon_restauranteId_fkey" FOREIGN KEY ("restauranteId") REFERENCES "Restaurante"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cupon" ADD CONSTRAINT "Cupon_promocionId_fkey" FOREIGN KEY ("promocionId") REFERENCES "Promocion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cupon" ADD CONSTRAINT "Cupon_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AplicacionDescuento" ADD CONSTRAINT "AplicacionDescuento_ventaId_fkey" FOREIGN KEY ("ventaId") REFERENCES "Venta"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AplicacionDescuento" ADD CONSTRAINT "AplicacionDescuento_promocionId_fkey" FOREIGN KEY ("promocionId") REFERENCES "Promocion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AplicacionDescuento" ADD CONSTRAINT "AplicacionDescuento_cuponId_fkey" FOREIGN KEY ("cuponId") REFERENCES "Cupon"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NivelFidelizacion" ADD CONSTRAINT "NivelFidelizacion_restauranteId_fkey" FOREIGN KEY ("restauranteId") REFERENCES "Restaurante"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CuentaFidelizacion" ADD CONSTRAINT "CuentaFidelizacion_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CuentaFidelizacion" ADD CONSTRAINT "CuentaFidelizacion_nivelId_fkey" FOREIGN KEY ("nivelId") REFERENCES "NivelFidelizacion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimientoPuntos" ADD CONSTRAINT "MovimientoPuntos_cuentaId_fkey" FOREIGN KEY ("cuentaId") REFERENCES "CuentaFidelizacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimientoPuntos" ADD CONSTRAINT "MovimientoPuntos_ventaId_fkey" FOREIGN KEY ("ventaId") REFERENCES "Venta"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimientoPuntos" ADD CONSTRAINT "MovimientoPuntos_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentimientoCliente" ADD CONSTRAINT "ConsentimientoCliente_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentimientoCliente" ADD CONSTRAINT "ConsentimientoCliente_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentoElectronico" ADD CONSTRAINT "DocumentoElectronico_resolucionId_fkey" FOREIGN KEY ("resolucionId") REFERENCES "ResolucionNumeracionDian"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerfilFiscal" ADD CONSTRAINT "PerfilFiscal_restauranteId_fkey" FOREIGN KEY ("restauranteId") REFERENCES "Restaurante"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResolucionNumeracionDian" ADD CONSTRAINT "ResolucionNumeracionDian_restauranteId_fkey" FOREIGN KEY ("restauranteId") REFERENCES "Restaurante"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResolucionNumeracionDian" ADD CONSTRAINT "ResolucionNumeracionDian_sucursalId_fkey" FOREIGN KEY ("sucursalId") REFERENCES "Sucursal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutboxFiscal" ADD CONSTRAINT "OutboxFiscal_documentoId_fkey" FOREIGN KEY ("documentoId") REFERENCES "DocumentoElectronico"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HistorialDocumentoFiscal" ADD CONSTRAINT "HistorialDocumentoFiscal_documentoId_fkey" FOREIGN KEY ("documentoId") REFERENCES "DocumentoElectronico"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "ResolucionNumeracionDian_restauranteId_prefijo_numeroResolucion" RENAME TO "ResolucionNumeracionDian_restauranteId_prefijo_numeroResolu_key";
