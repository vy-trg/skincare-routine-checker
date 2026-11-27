# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Current state

The repo is at an early stage: it contains only `db/schema.sql` and a title-only `README.md`. There is no application code, `package.json`, build, lint, or test setup yet. Update this file as those are added (commands, framework, how to run a single test).

## Database schema (`db/schema.sql`)

PostgreSQL (hosted on Neon). Plain SQL file, no migration tool yet. The domain is a skincare routine checker: users own products (with raw ingredient lists) and arrange them into AM/PM routines.

- `users`: email/password_hash auth; `skin_type` is constrained to a fixed set, with `skin_type_other` as free text for `'other'`.
- `products`: belong to a user; `ingredients_raw` is unparsed text (parsing/normalizing ingredients is application-level work). `opened_on` + `pao_months` (period-after-opening) support expiry checks.
- `routines`: at most one per `(user_id, period)` where period is `'am'` or `'pm'`.
- `routine_items`: join table routines <-> products, ordered by `position`. A product can appear only once per routine (composite PK).
- `"session"`: matches the table layout of `connect-pg-simple` (express-session store), so the backend is expected to be Node/Express with Postgres-backed sessions.
- All user-owned tables cascade on user deletion.

## Notes and limitations

- Schema changes follow the Neon flow: apply to the dev branch first, then production, then merge the PR. Because there is no migration tool, keep `db/schema.sql` as the source of truth and record any `ALTER` statements you run.
- `routine_items` does not enforce that a product belongs to the same user as the routine; the application must check ownership.
- `position` is not unique within a routine, so ordering ties are possible.
