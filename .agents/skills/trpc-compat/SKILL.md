---
name: trpc-compat
description: Check that a tRPC change is safe for released desktop, mobile, CLI, and SDK builds, pick the compatible pattern, and decide when a deprecated procedure can be removed. Use when changing, renaming, or removing an existing procedure, input field, or output field in packages/trpc or packages/host-service, when reviewing such a PR, or when a deploy broke released clients.
---

# tRPC compatibility

On 2026-09-23, #7726 changed `page.list` from a bare array to `{ items, nextCursor }`. It
updated every caller on main, so typecheck and tests passed. Desktop 1.30.0–1.30.2 still called
`.map` on the result, and every workspace view crashed (SEV1, 337 Sentry events, postmortem
"page.list response change crashed released desktop apps"). CI only sees main. This skill is how
you check the builds CI cannot see.

## 1. Find released callers

Search the release tags, not main. Run `git fetch --tags` first in a fresh clone.

```bash
PROC='page\.list(?!Paginated)'   # the procedure path; exclude longer names that share the prefix
FLOOR=1.29.0                     # MINIMUM_DESKTOP_VERSION in apps/api/src/app/api/desktop/version/route.ts
for v in $({ echo "$FLOOR"; git tag -l 'desktop-v*' | sed 's/^desktop-v//'; } | awk '!/-/' | sort -uV | sed -n "/^$FLOOR\$/,\$p"); do
  git rev-parse -q --verify "refs/tags/desktop-v$v" >/dev/null || continue
  git grep -q -P "$PROC" "desktop-v$v" -- apps/desktop && echo "desktop-v$v calls it"
done
```

- **Desktop**: every `desktop-v*` tag at or above the floor is live.
- **CLI**: same loop with `cli-v*` tags and `-- packages/cli`. The CLI has no floor, so check
  every tag you can; old installs stay in use.
- **Mobile**: no tags, and `MINIMUM_MOBILE_VERSION` is `1.0.0`. If `apps/mobile` on main calls it,
  or `git log -S` shows it ever did, treat it as called by a live build.
- **SDK**: `packages/sdk` calls procedures by string (`/api/trpc/<procedure>`). Search main and
  `git log -S` the same way.
- **host-service** procedures: callers are desktop, CLI, and mobile, and the host can be older or
  newer than the client. See `packages/host-service/AGENTS.md`.

Any hit means the procedure is live. Its input and output are frozen.

## 2. Check usage data

The API samples 1% of calls into the PostHog event `api_procedure_called`. Run this in the
PostHog SQL editor or through the PostHog MCP:

```sql
SELECT properties.client_product AS product, properties.client_version AS version,
       count() * 100 AS est_calls, max(timestamp) AS last_seen
FROM events
WHERE event = 'api_procedure_called' AND properties.procedure = 'page.list'
  AND timestamp > now() - INTERVAL 30 DAY
GROUP BY product, version ORDER BY product, version
```

Zero rows is weak evidence for a rarely called procedure: 1% of a small number rounds to zero.
Calls from web and from builds older than the `x-superset-client` header are not recorded.

## 3. Pick the pattern

| You want to | Do this | Example |
| --- | --- | --- |
| Change an output shape | New procedure; old one keeps its shape | `page.list` + `page.listPaginated` (#7756) |
| Add an input | New optional field, default in the handler (safe: old clients do not send it) | |
| Accept a new input shape | Accept both, convert server-side | `rrule` + `triggers` in `automation/schema.ts` |
| Rename a procedure | New name; old name stays as a `@deprecated` alias | `task.all` → `task.list` in `task/task.ts` |
| Drop an input | Keep accepting it and ignore it | `branch` in `task/schema.ts` |
| Drop an output field | Keep sending it until removal is allowed | the plugins catalog field that #7317 removed crashed old desktops |
| Drop or rename a DB column | Pick the procedure's output columns first, keep the old field | `db.query.*.find*` without `columns` returns every column |
| Make an input stricter | Only on a new input or procedure | `publishPageSchema` is `.strict()` from the start, so a newer CLI fails loudly on an older server |
| Change an error code, default, or sort order | New procedure, or a new optional input that opts in (absent keeps the old behavior) | desktop branches on `NOT_FOUND` and `CONFLICT` |
| Call a new procedure from a client | Merge the API first, then the client after the API is live | #7317's API deploy stalled two days behind migration 0119 |

To check the API is live, the latest `Deploy Production` run after your API merge must have
passed: `gh run list --workflow deploy-production.yml --branch main --limit 5`.

In client code, expect the unknown: guard new optional fields, handle enum values the client has
not seen, and keep a failing widget from taking its parent view down with it. #7726 crashed the
whole workspace view from one menu.

Keep the schema migration in its own PR. #7726 had a migration inside it, so the bad API change
could not be reverted.

## 4. Remove a deprecated procedure or field

Only when both are true:

- Step 1 finds no call in a live desktop tag and no call from mobile, CLI, or SDK.
- Step 2 shows no calls from a live version over the last 30 days.

If a live desktop build still calls it, the only path is to raise `MINIMUM_DESKTOP_VERSION`. That
is a product decision; ask, do not do it in a cleanup PR. Put the evidence in the PR description,
as `d1aee0922f` did for `device.heartbeat`.

## 5. If released clients are already broken

1. Confirm with Sentry: a new desktop issue that starts at the API deploy time.
2. Does the PR that broke it include a migration that production already applied?
   - **No**: revert the PR. The API redeploys on merge.
   - **Yes**: write a forward fix that restores the old contract and moves the new shape to a new
     procedure, as #7756 did. Do not roll back the migration.
3. Tell affected users to reload (Cmd+R). Some needed to restart the app or the terminal daemon.

## Checklist

- [ ] Step 1 run for every procedure whose input or output changed, with the result in the PR
- [ ] No existing input field is new-required, renamed, retyped, or more strictly validated
- [ ] No existing output field is removed, renamed, retyped, wrapped, or newly nullable,
      including through a DB column change on a `find*` without `columns`
- [ ] No change to an existing error code, default limit, sort order, or meaning of `null`
- [ ] No change to a procedure's type (query, mutation, subscription), the link, or the transformer
- [ ] No new required header or stricter auth on an existing procedure
- [ ] Client code that needs a new procedure merges after the API is live in production
- [ ] Every new input field is optional with a server-side default
- [ ] A replaced procedure is kept as a `@deprecated` alias
- [ ] No schema migration in the same PR as the contract change
- [ ] Removals: step 1 and step 2 evidence is in the PR
