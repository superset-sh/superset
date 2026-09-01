# Adding an environment variable

A new variable has to be added in six places. Miss one and the failure is
usually silent, or lands somewhere far from the change: a deploy that boots and
then throws on first use, or a colleague whose `bun run dev` stops working for
reasons that look unrelated.

Work down the list in order.

## 1. Decide secret or variable

A **secret** is anything that grants access: tokens, keys, connection strings,
signing secrets. Once set it cannot be read back, only overwritten.

A **variable** is configuration that would be harmless in a screenshot: bucket
names, hostnames, feature flags, account ids. Prefer a variable when you can,
because you can read it back and diff it against what you expect.

```bash
gh variable set MY_VAR   -R superset-sh/superset --body "value"
gh secret   set MY_TOKEN -R superset-sh/superset --body "value"
```

Both of the above are **repository-level**, which is what you want when
production and preview share a value. When they differ, scope each to its
GitHub environment instead:

```bash
gh variable set MY_VAR -R superset-sh/superset --env Production --body "prod-value"
gh variable set MY_VAR -R superset-sh/superset --env Preview    --body "preview-value"
```

An environment-scoped value overrides a repository-level one of the same name,
so it is safe to set a repo-level default and override only where it differs.

Check what you set landed:

```bash
gh variable list -R superset-sh/superset
gh secret   list -R superset-sh/superset
```

## 2. Add it to the schema

Server variables live in `packages/trpc/src/env.ts`; app-specific ones live in
that app's `src/env.ts`.

Make it **required** unless you have a reason not to:

```ts
MY_VAR: z.string().min(1),
```

Required means a deployment missing it fails at boot, which is a far better
failure than a request that dies on the one code path that reads it.

Two cases justify `.optional()`:

- **It has a correct default.** Not "we can cope without it" — an actual
  derivable or literal fallback the code applies. If the code would throw a
  "not configured" error, the variable should have been required.
- **It is genuinely absent in a whole runtime.** Anything imported by the
  desktop, mobile or CLI bundles is evaluated on machines that have no server
  configuration at all. Check before assuming: most packages import
  `@superset/trpc` for types only, and type-only imports never evaluate
  `env.ts`. The way to find out is to run the thing with the variable unset.

Never pair `.optional()` with a runtime `if (!env.X) throw` guard. That is a
required variable wearing a disguise, and it moves the failure from boot to
whenever someone first hits that path.

## 3. Add it to both templates

- **`.env.example`** — the production template. Add the key with an **empty**
  value; it documents what a real deployment must supply.
- **`.env.local.example`** — the local template. Add a **fake but working**
  value, in the style of `fake-r2-access-key-id` or `superset-private-dev`.
  Local development should boot with no real credentials anywhere.

## 4. Add it to the root `.env` — the step people miss

`.superset/setup.local.sh` copies `.env.local.example` to `.env` **only when
`.env` does not already exist**. Every existing checkout has one, so a new key
in the template reaches nobody who is already set up.

Worse, `.superset/setup.sh` copies the **root checkout's** `.env` into every new
worktree. So the root `.env` — usually `~/code/superset/.env` — is the real
source of truth for local development, and a variable missing there is missing
from every worktree you create afterwards.

Add the key there yourself, and tell anyone else working in the repo to do the
same. Making a variable required without this step breaks `bun run dev` for
everyone whose `.env` predates your change.

## 5. Wire it through both deploy workflows

Two edits per workflow, in `.github/workflows/deploy-production.yml` and
`.github/workflows/deploy-preview.yml`. Missing the second is easy: the value
reaches the job but never reaches the deployed app.

```yaml
# the job's env: block
MY_VAR: ${{ vars.MY_VAR }}        # or ${{ secrets.MY_TOKEN }}
```

```yaml
# and the --env passthrough on the deploy command
--env MY_VAR=$MY_VAR \
```

Preview commonly wants a different value — a `-dev` bucket, a localhost URL —
so check whether it should point somewhere else rather than copying production.

## 6. Verify before you claim it works

```bash
# the schema accepts your local values
set -a; source .env; set +a
bun -e 'import { env } from "./packages/trpc/src/env"; console.log(env.MY_VAR)'

# and the repo agrees
gh variable list -R superset-sh/superset | grep MY_VAR
```

After the deploy, confirm the variable actually arrived rather than assuming the
workflow edit was right — a missing `--env` line produces a running deploy that
fails on the first request touching it.

## Checklist

- [ ] Set as a secret or a variable, scoped to an environment only if the values differ
- [ ] Added to the relevant `env.ts`, required unless it has a real default
- [ ] `.env.example` with an empty value
- [ ] `.env.local.example` with a fake working value
- [ ] Root `.env` (`~/code/superset/.env`) updated, and the team told
- [ ] `deploy-production.yml`: `env:` block **and** `--env` passthrough
- [ ] `deploy-preview.yml`: same two, with a preview-appropriate value
- [ ] Booted locally with the new schema
