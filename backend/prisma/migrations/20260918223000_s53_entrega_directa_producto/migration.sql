-- Sprint 53: distinguir productos que requieren preparación de los de entrega directa.
-- Todos los productos existentes conservan el comportamiento anterior.
ALTER TABLE "Producto"
ADD COLUMN "requierePreparacion" BOOLEAN NOT NULL DEFAULT true;
