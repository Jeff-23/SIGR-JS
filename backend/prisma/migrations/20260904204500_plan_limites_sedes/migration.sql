-- Estrategia comercial de sedes por plan.
ALTER TABLE "Plan"
ADD COLUMN "sedesIncluidas" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "maxSedes" INTEGER NOT NULL DEFAULT 1;

UPDATE "Plan" SET "sedesIncluidas" = 1, "maxSedes" = 1 WHERE "codigo" = 'BASICO';
UPDATE "Plan" SET "sedesIncluidas" = 2, "maxSedes" = 2 WHERE "codigo" = 'MEDIO';
UPDATE "Plan" SET "sedesIncluidas" = 3, "maxSedes" = 10 WHERE "codigo" = 'PRO';
