-- =============================================================================
-- Event start date on the catalogue type.
--
-- The platform owner sets when an event kicks off. Used to gate the organiser
-- "Test Event" (test allowed until kickoff) and, later, to trigger auto-results.
-- =============================================================================
alter table sweepstake_type add column starts_at timestamptz;

update sweepstake_type set starts_at = '2026-06-11T16:00:00Z' where name = 'World Cup 2026';
