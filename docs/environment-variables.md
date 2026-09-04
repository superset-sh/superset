# Adding an environment variable

Five places. Miss one and it fails silently, or far from the change.

## 1. Set the secret

```bash
gh secret set MY_VAR -R superset-sh/superset --body "value"
```

Always a secret, never a repo variable, even for something as unsecret as a
bucket name — one mechanism means one place to look when a value goes missing.

Add `--env Production` / `--env Preview` only when the two need different
values. Without it, both environments get the same one. Scoping works because
every deploy job declares `environment: production` / `preview`; a job that
does not will read an environment secret as empty.

Give both environments the **same name** and different values. A separate
`MY_VAR_DEV` variable is easy to reference in a workflow and forget to create,
and it fails as an empty string at boot rather than as a missing key.

## 2. Add it to the schema

`packages/trpc/src/env.ts`, or the app's own `src/env.ts`.

```ts
MY_VAR: z.string().min(1),
```

Required by default — a deployment missing it should fail at boot, not on the
first request that reads it. `.optional()` is for a variable with a real
fallback, or one a whole runtime genuinely lacks (desktop, mobile, CLI). Never
pair `.optional()` with an `if (!env.X) throw`: that is required in disguise.

## 3. Both templates

- `.env.example` — empty value, documents what production needs.
- `.env.local.example` — fake working value (`fake-r2-access-key-id`,
  `superset-private-dev`). Local should boot with no real credentials.

## 4. The root `.env`

`setup.local.sh` seeds `.env` from `.env.local.example` **only if `.env` does
not exist**, and `setup.sh` copies the **root checkout's** `.env` into every new
worktree. So the root `.env` (`~/code/superset/.env`) is the source of truth for
local dev, and a template-only change reaches nobody already set up.

Add the key there, and tell the team to do the same.

## 5. Both deploy workflows

Two edits each, in `deploy-production.yml` and `deploy-preview.yml`. With only
the first, the value reaches the runner and never reaches the app.

```yaml
MY_VAR: ${{ secrets.MY_VAR }}     # the job's env: block
```
```yaml
--env MY_VAR=$MY_VAR \            # the deploy command's passthrough
```

Both reference `${{ secrets.MY_VAR }}`; the environment picks the value.

A reusable workflow (`on: workflow_call`, e.g. `build-cli.yml`) inherits `vars`
automatically but **not** `secrets` — the caller must pass `secrets: inherit`,
or the value arrives empty.

## Checklist

- [ ] `gh secret set`
- [ ] Schema, required unless it has a real fallback
- [ ] `.env.example` empty, `.env.local.example` fake
- [ ] Root `.env`, and the team told
- [ ] `deploy-production.yml`: `env:` block **and** `--env`
- [ ] `deploy-preview.yml`: same two
