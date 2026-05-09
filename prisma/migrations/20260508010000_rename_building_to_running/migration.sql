-- Rename the display name of the "building" status to "Running".
-- The key stays "building" so application logic referencing the key continues to work.
UPDATE "Status" SET "name" = 'Running' WHERE "key" = 'building' AND "name" = 'Building';
