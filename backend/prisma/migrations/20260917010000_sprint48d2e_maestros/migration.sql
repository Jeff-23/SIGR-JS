ALTER TABLE "Zona" ADD COLUMN IF NOT EXISTS "globalId" UUID;
UPDATE "Zona" SET "globalId" = gen_random_uuid() WHERE "globalId" IS NULL;
ALTER TABLE "Zona" ALTER COLUMN "globalId" SET DEFAULT gen_random_uuid();
ALTER TABLE "Zona" ALTER COLUMN "globalId" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "Zona_globalId_key" ON "Zona"("globalId");
