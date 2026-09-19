WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY "documentId", "processingVersion"
           ORDER BY "sortOrder", "createdAt"
         ) AS n
  FROM "Question"
)
UPDATE "Question" q
SET "questionNumber" = ranked.n::text,
    "sortOrder" = ranked.n - 1
FROM ranked
WHERE q.id = ranked.id;
