BEGIN;

ALTER TABLE "Issue" ADD COLUMN "editionNumber" INTEGER;

WITH numbered AS (
  SELECT "id", ROW_NUMBER() OVER (ORDER BY "publishedAt", "editionDate", "id")::INTEGER AS number
  FROM "Issue"
  WHERE "publishedAt" IS NOT NULL
)
UPDATE "Issue" SET "editionNumber" = numbered.number
FROM numbered WHERE "Issue"."id" = numbered."id";

CREATE UNIQUE INDEX "Issue_editionNumber_key" ON "Issue"("editionNumber");
ALTER TABLE "Issue" ADD CONSTRAINT "Issue_editionNumber_positive" CHECK ("editionNumber" IS NULL OR "editionNumber" > 0);

COMMIT;
