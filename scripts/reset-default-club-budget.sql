-- Reset default club budget targets to 0
-- Run: clears leftover development test values (800/600/600) from the default club.
-- Executed: 2026-04-15 as part of Task #7 (Fix AI toggle + remove budget from Settings)
-- Budget is now set only from the Daily Log inline editor (SalesInput), not Settings.

UPDATE clubs
SET budget_food_sales  = '0',
    budget_bar_sales   = '0',
    budget_gaming_sales = '0'
WHERE id = 'default';
