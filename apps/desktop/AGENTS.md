
## Server-driven announcements (desktop notices)

To show an announcement/warning popup in the app without shipping a release, insert a row in the `desktop_notices` table (served by `GET /api/desktop/version`). Authoring guide — markdown-only body, severities, triggers, targeting, QA previews: `docs/DESKTOP_NOTICES.md`.

## Persisted renderer state (localStorage) policy

Renderer localStorage has one ~10 MB quota, loads synchronously at boot, and keys outlive the code that wrote them — unbounded growth has frozen the renderer before (23.7 MB profile, GH #5496). Every writer must be allowlisted in `src/renderer/lib/persisted-keys/persisted-key-registry.test-data.ts` (CI fails on unregistered writers), and code review must answer three questions:

1. **What bounds it?** A cap/LRU, a TTL, reconciliation against an owning entity, or "fixed-size singleton". "It's small per write" is not a bound.
2. **Who deletes it?** New entity-keyed data belongs in SQLite; existing stores must document their deletion path or sunset plan because deletes from CLIs or other machines can bypass UI cleanup. One-shot payloads must be cleared by their consumer. Deleting a map entry means removing the key, never writing `null`.
3. **What happens when the feature dies?** Move the keys to `DEAD_KEYS` in the same PR that removes the writer; the boot sweep cleans existing profiles. Deleting the writer without registering the key strands it on user profiles forever.

Guardrail: localStorage is for small singleton UI state. Anything entity-scoped with unbounded cardinality, or payloads beyond a few KB, belongs in host-side SQLite (`@superset/local-db` schema, reached over `electronTrpc`) — localStorage collections re-serialize the whole org blob on every mutation. Since #6328 removed SQLite-backed collection persistence, every TanStack DB collection in `CollectionsProvider` is localStorage-backed, so the ~10 MB quota is shared by all of them; `withQuotaGuard`, `notifyQuotaExhausted`, and `evictInactiveOrgs` exist to absorb that pressure and are not a licence to store more.

## Verifying renderer changes via CDP

Read `.agents/skills/cdp-verification/SKILL.md`: attaching to the right renderer, repairing auth, and what counts as end-to-end evidence.
