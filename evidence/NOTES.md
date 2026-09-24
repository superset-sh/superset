# GHSA-2cp5-f6gg-w5fp — OAuth state is not bound to the browser

Branch: `superset/p0-2-oauth-state-binding-fix-499ab9f8`
Drive run: 2026-09-24, against a local web+API dev stack in a Superset cloud workspace.

## The finding, confirmed

`createSignedState` (`apps/api/src/lib/oauth-state.ts`) signs
`{ organizationId, userId, timestamp }` and binds it to nothing else.
`resolveCallback` took the identity straight out of that state and only checked
that the named user was still a member of the named org — a fact that is true
for the attacker's *own* state. So the browser completing a flow never had to
be the browser that started it.

Seven routes were unbound: `github`, and `integrations/{google, linear, notion,
slack, microsoft-teams, microsoft-teams/identity}`. Two were already bound:
`connectors/callback/[connector]` and `integrations/sentry`.

## What the live drive shows

`before-installation-owner.txt` — two synthetic accounts in two separate Chrome
profiles. A hits `/api/integrations/notion/connect?organizationId=<A's org>`,
the response carries **no state cookie at all**, and the signed state is
captured out of the redirect to the provider. B — a different account, a
different cookie jar — then completes
`/api/integrations/notion/callback?code=…&state=<A's state>`. The callback
accepted it and wrote a `connections` row with
`organization_id = A's org, connected_by_user_id = A's user`. B approved; A owns
the connection.

`after-installation-blocked.txt` — same drive against the fix. A's connect
response now sets `notion_oauth_state` (HttpOnly, SameSite=Lax,
Path=/api/integrations/notion) holding exactly the state it handed the
provider. B carries no such cookie, the callback refuses with
`?error=invalid_state`, and no row is written.

`after-normal-flow-ok.txt` — A starts *and* finishes in one browser: connected,
to A's own org.

`regression-test-red-green.txt` — the co-located tests fail against the pre-fix
state handling and pass against the fix.

Screenshots: `{before,after}-session-{a,b}.png` are the two signed-in sessions;
`*-victim-completes-callback.png` is where B lands. The dev web build has no
`/integrations/notion` page, so that landing renders the app's 404 shell — the
authoritative signals are the URL's `error` param and the `connections` rows,
both in the text files.

## How the drive was set up (all synthetic)

- A **throwaway Neon project** (`p0-2-oauth-state-ghsa-2cp5`, created empty and
  migrated from scratch), never the workspace's or production's database. It is
  deleted after the run.
- `.env` rebuilt from `.env.local.example`, whose third-party credentials are
  fake placeholders, plus that DATABASE_URL and a synthetic Notion client
  id/secret. The workspace's own `.env` — which holds real provider secrets —
  was backed up and restored afterwards, and was never pointed at by the stack.
- A **local stand-in for `api.notion.com`** on 127.0.0.1:443 with a throwaway
  CA, so the token exchange the callback performs resolves without any real
  provider secret. Notion is the one flow whose DB write needs a single
  provider call, which is why it is the one driven live; the vulnerable code
  path (`resolveCallback`) is identical for all seven.
- Two accounts signed up through the app's own dev email/password endpoint,
  each auto-getting a personal org.

## Cloud-sandbox limitations hit (for `docs/cloud-sandbox-mismatches.md`)

1. **No Docker daemon.** `./.superset/setup.local.sh`'s local Postgres +
   neon-proxy + Redis stack cannot come up, so the documented zero-credential
   local path is unavailable. Worked around with a throwaway Neon project.
2. **No outbound TCP:5432.** `bun run db:migrate` (drizzle-kit, node-postgres)
   fails against Neon with `password authentication failed`; the same
   credentials work over Neon's HTTP and WebSocket drivers. Migrations were
   applied with `evidence/tools/migrate.ts` over the WebSocket driver. The HTTP
   driver alone is not enough — it cannot run drizzle's multi-statement
   migration transaction.
3. **`/etc/hosts` is read-only** even under sudo, so a hostname cannot be
   redirected the usual way. Node was pointed at the stand-in with a
   `--require` preload patching `dns.lookup`, and Chrome with
   `--host-resolver-rules`.

## Reproducing

```bash
cd evidence/tools && bun install
DATABASE_URL=<throwaway> bun run migrate.ts     # fresh Neon project
DATABASE_URL=<throwaway> bun run drive.ts after # or `before` on vulnerable code
```
