-- Migration 11 is intentionally empty (no-op)
-- The terminal_persistence column was removed due to idempotency issues
-- See migration 0012 for the replacement column: persist_terminal
SELECT 1;
