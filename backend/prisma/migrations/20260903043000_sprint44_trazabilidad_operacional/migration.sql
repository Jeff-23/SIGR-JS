CREATE TYPE "TipoEventoOperacional" AS ENUM (
  'PEDIDO_CREADO',
  'ENVIADO_ESTACION',
  'PREPARACION_INICIADA',
  'LISTO_ESTACION',
  'RETIRADO_ESTACION',
  'ENTREGADO_CLIENTE',
  'CUENTA_SOLICITADA',
  'PAGO_COMPLETADO'
);

CREATE TABLE "EventoOperacional" (
  "id" SERIAL NOT NULL,
  "tipo" "TipoEventoOperacional" NOT NULL,
  "ocurridoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "metadata" JSONB,
  "sucursalId" INTEGER NOT NULL,
  "pedidoId" INTEGER NOT NULL,
  "comandaId" INTEGER,
  "ventaId" INTEGER,
  "actorId" INTEGER,
  CONSTRAINT "EventoOperacional_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EventoOperacional_sucursalId_ocurridoEn_idx" ON "EventoOperacional"("sucursalId", "ocurridoEn");
CREATE INDEX "EventoOperacional_pedidoId_ocurridoEn_idx" ON "EventoOperacional"("pedidoId", "ocurridoEn");
CREATE INDEX "EventoOperacional_comandaId_ocurridoEn_idx" ON "EventoOperacional"("comandaId", "ocurridoEn");
CREATE INDEX "EventoOperacional_ventaId_ocurridoEn_idx" ON "EventoOperacional"("ventaId", "ocurridoEn");
CREATE INDEX "EventoOperacional_tipo_ocurridoEn_idx" ON "EventoOperacional"("tipo", "ocurridoEn");

ALTER TABLE "EventoOperacional" ADD CONSTRAINT "EventoOperacional_sucursalId_fkey" FOREIGN KEY ("sucursalId") REFERENCES "Sucursal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EventoOperacional" ADD CONSTRAINT "EventoOperacional_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "Pedido"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EventoOperacional" ADD CONSTRAINT "EventoOperacional_comandaId_fkey" FOREIGN KEY ("comandaId") REFERENCES "Comanda"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EventoOperacional" ADD CONSTRAINT "EventoOperacional_ventaId_fkey" FOREIGN KEY ("ventaId") REFERENCES "Venta"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EventoOperacional" ADD CONSTRAINT "EventoOperacional_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
