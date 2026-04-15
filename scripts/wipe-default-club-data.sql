-- ONE-TIME SCRIPT: Wipe test data for the default development club
-- Run against DATABASE_URL before publishing to clear test entries.
-- Safe: scoped strictly to club_id = 'default'. Real club data is
-- isolated by their own clubId and is not affected.
--
-- Executed: 2026-04-15 (pre-publish cleanup)
-- Result: 5 manager_logs deleted (cascade-deleted maintenance_items,
--         log_maintenance_snapshots, note_photos); running_maintenance_list
--         and prep_checklist_items also cleared for default club.

-- manager_logs cascade-deletes: maintenance_items, log_maintenance_snapshots, note_photos
DELETE FROM note_photos
  WHERE log_id IN (SELECT id FROM manager_logs WHERE club_id = 'default');

DELETE FROM log_maintenance_snapshots
  WHERE log_id IN (SELECT id FROM manager_logs WHERE club_id = 'default');

DELETE FROM manager_logs WHERE club_id = 'default';

-- Standalone tables also scoped to club_id
DELETE FROM running_maintenance_list WHERE club_id = 'default';
DELETE FROM running_maintenance_snapshots WHERE club_id = 'default';
DELETE FROM prep_checklist_items WHERE club_id = 'default';

-- Verify
SELECT 'manager_logs' AS tbl, COUNT(*) AS remaining FROM manager_logs WHERE club_id = 'default'
UNION ALL
SELECT 'running_maintenance_list', COUNT(*) FROM running_maintenance_list WHERE club_id = 'default';
-- Expected: 0, 0
