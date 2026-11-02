-- Starting the next capital cycle: requests that came in from the earlier import and were never funded
-- become drafts, so each department finds its prior work waiting to revise and resubmit.
-- Only untouched imported requests are changed (never submitted by a department, never funded).
UPDATE "CapitalProject"
SET "requestStatus" = 'draft'
WHERE "requestStatus" IN ('not_funded', 'submitted')
  AND "submittedAt" IS NULL
  AND "createdByName" LIKE 'Imported by %'
  AND NOT EXISTS (
    SELECT 1 FROM "CapitalProjectYear" y
    WHERE y."projectId" = "CapitalProject"."id" AND y."approvedAmount" IS NOT NULL
  );
