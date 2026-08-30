CREATE TYPE "IndicadorMetaOperativa" AS ENUM ('VENTAS_MONTO', 'VENTAS_CANTIDAD', 'TICKET_PROMEDIO');

ALTER TABLE "Articulo" ADD COLUMN "stockMinimo" DECIMAL(14,4) NOT NULL DEFAULT 0,
ADD COLUMN "diasAnticipacion" INTEGER NOT NULL DEFAULT 3;

CREATE TABLE "MetaOperativa" (
  "id" SERIAL NOT NULL,
  "indicador" "IndicadorMetaOperativa" NOT NULL,
  "objetivo" DECIMAL(14,2) NOT NULL,
  "desde" DATE NOT NULL,
  "hasta" DATE NOT NULL,
  "descripcion" VARCHAR(200),
  "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sucursalId" INTEGER NOT NULL,
  CONSTRAINT "MetaOperativa_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "MetaOperativa_sucursalId_desde_hasta_idx" ON "MetaOperativa"("sucursalId", "desde", "hasta");
ALTER TABLE "MetaOperativa" ADD CONSTRAINT "MetaOperativa_sucursalId_fkey" FOREIGN KEY ("sucursalId") REFERENCES "Sucursal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
