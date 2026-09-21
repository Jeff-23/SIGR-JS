ALTER TABLE "Restaurante"
  ADD COLUMN "razonSocial" VARCHAR(150),
  ADD COLUMN "dv" VARCHAR(1),
  ADD COLUMN "municipio" VARCHAR(100),
  ADD COLUMN "departamento" VARCHAR(100),
  ADD COLUMN "whatsapp" VARCHAR(30);

ALTER TABLE "Sucursal"
  ADD COLUMN "municipio" VARCHAR(100),
  ADD COLUMN "departamento" VARCHAR(100),
  ADD COLUMN "whatsapp" VARCHAR(30),
  ADD COLUMN "correo" VARCHAR(150);
