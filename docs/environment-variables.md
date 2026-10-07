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
does not will read an environment secret as empty. It is also why a one-off
script that needs a production secret has to run as a workflow; see
`docs/deploy-workflows.md`.

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

The fake value must satisfy the schema: a URL for `z.string().url()`, 32+
characters for `.min(32)`. Setup copies it into any worktree `.env` that lacks
the key (see 4), and then loads both schemas against the result, so a value
that fails validation fails setup.

Leave the value **empty** only for a key that should stay unset locally
(`CLOUDFLARE_BROWSER_RENDERING_TOKEN`, the APNs keys). Setup never seeds an
empty value.

## 4. The root `.env`

`setup.local.sh` seeds `.env` from `.env.local.example` only if `.env` does not
exist, and `setup.sh` copies the **root checkout's** `.env` into every new
worktree. Either way, setup then appends every key that has a value in
`.env.local.example` but none in the worktree's `.env`, right after it writes
the port block, and re-running setup without `--force` fills the gaps in an
existing worktree. Existing values are never overwritten; an empty `KEY=`
counts as missing.

So a worktree boots with the fake value until the root `.env`
(`~/code/superset/.env`) carries a real one. Add the key there when the feature
needs the real service locally, and tell the team to do the same.

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
- [ ] `.env.example` empty, `.env.local.example` fake and schema-valid
- [ ] Root `.env` when the feature needs the real value locally, and the team told
- [ ] `deploy-production.yml`: `env:` block **and** `--env`
- [ ] `deploy-preview.yml`: same two

## Launcher-owned runtime values

`SUPERSET_HOST_INSTALL_SOURCE` is set by the desktop coordinator (`desktop`) or standalone CLI spawner (`cli`) on the host child process. A checkout may set `dev`; absent/unrecognized values report `unknown`. This is install provenance, not an API deployment setting: do not put it in shared `.env` templates or deployment secrets. The host ignores login-shell values for this key. In-place updates additionally require a standalone entrypoint and a valid install layout.

`SUPERSET_AGENT_LAUNCH_ID` is set by the outer agent wrapper to a process-and-start-time identifier. Hook children inherit it so a new launch in the same terminal cannot inherit the previous login attribution. It is runtime metadata, not a deployment secret or user setting; it does not belong in `.env` templates or deploy workflows.

`SUPERSET_ACCOUNT_ATTRIBUTION_TOKEN` is issued by the host for each new terminal and authorizes only that terminal’s login-attribution hook metadata. It is not the host authentication token. Tokens expire when the host process restarts; open a new terminal to restore verified login attribution. The host injects it at PTY creation, so it does not belong in deployment configuration.

`SUPERSET_HOST_AUTO_UPDATE` is a standalone host runtime preference, set to `true` by `superset start --auto-update` and `false` otherwise. Direct service launchers may set it explicitly. It defaults to `false`, is excluded from login-shell imports, and is inherited by update/rollback successors. Like install provenance, it does not belong in deployment secrets or shared environment templates.

## GitLab organization connections

`GITLAB_OAUTH_CLIENT_ID` and `GITLAB_OAUTH_CLIENT_SECRET` configure the optional
organization connection app. They are separate from `GITLAB_CLIENT_ID` and
`GITLAB_CLIENT_SECRET`, which configure sign-in. Both apps use the exact
`GITLAB_ISSUER` origin (`https://gitlab.com` when unset). Register each app's
callback on that instance; never reuse client credentials with another issuer.

Leave the organization credentials unset to retain existing cloud defaults and
token-based GitLab connection support. These optional values belong in the API
and tRPC schemas, both templates, Turbo and both API deployment blocks and
passthroughs. Set operator-owned runtime values or deployment secrets when
enabling OAuth. The generic rebuild does not change root `.env` or remote
secrets. Cloud sandbox credentials require HTTPS port 443; server API and OAuth
helpers preserve configured custom HTTPS ports.

`GITLAB_WEBHOOK_ORIGIN` optionally selects a dedicated HTTPS root origin for
GitLab webhook delivery. Credentials, paths, queries and fragments are rejected;
custom HTTPS ports are preserved. Unset or empty uses `NEXT_PUBLIC_API_URL`,
including its existing local development URL. Connect, disconnect, manual hook
registration and periodic reconciliation use the same resolved destination.
GitLab OAuth browser callbacks still use `NEXT_PUBLIC_API_URL`.

This value belongs only in the API schema, both templates, Turbo and both API
deploy blocks and passthroughs. Both templates intentionally leave it empty to
exercise the fallback. Set operator-owned runtime configuration or the optional
deployment secret only when using a separate webhook origin. No root `.env`,
deployment secret or deployed application is changed by this generic port.

## GitLab cloud sandbox proxy

`GITLAB_SANDBOX_OIDC_ISSUER` enables the optional Node GitLab sandbox broker.
Set the exact trusted team issuer `https://oidc.vercel.com/<team-slug>` from
Vercel's team issuer configuration. The team slug is independent of
`VERCEL_SANDBOX_TEAM_ID`; the issuer is never inferred from that ID, a request
URL or a forwarded header. The route also requires the existing sandbox token,
team ID and project ID. Missing or malformed configuration returns a constant
503 before broker loading. The new schema fields stay optional and are
validated when used, so disabled GitLab does not change application startup.
See [Vercel's OIDC issuer reference](https://vercel.com/docs/oidc/reference).

`GITLAB_SANDBOX_PROXY_URL` optionally selects a dedicated canonical HTTPS port
443 endpoint. Credentials, queries, fragments, IP hosts and ambiguous paths are
rejected. Unset or empty uses `NEXT_PUBLIC_API_URL/api/gitlab/proxy`; that API
origin must itself be HTTPS port 443. The configured endpoint is the exact
OIDC audience. The API catchall accepts both SDK base-endpoint and appended
original-path requests and registers GET, HEAD, POST and PUT. OAuth browser
callbacks continue to use the API origin.

Both optional settings belong in the API and tRPC schemas, both templates,
Turbo and both API deploy environment and quoted passthrough blocks. Templates
leave them empty. Supply operator-owned runtime values or optional deployment
secrets when enabling this feature. No root `.env`, remote secrets or deployed
application is changed by this wiring. Central sandbox claim configuration
must use the same resolved endpoint when enabling provider forwarding.

[Vercel Functions limit request and response payloads to 4.5 MB](https://vercel.com/docs/functions/limitations).
A separate Node ingress with sufficient body, response and duration budgets is
required for larger Git/LFS transfers and the broker's full transfer budget;
setting the proxy URL alone does not provision that ingress. Reuse the exported
`createGitlabSandboxBroker` and `resolveGitlabSandboxProxyConfig` there with the
same trusted issuer, audience, current binding/grant access and configured
runtime credentials. Preserve original requests, bodies, signals and Vercel
forwarded metadata. See the [optional standalone Node broker](self-host/GITLAB_PROXY.md)
for its build and runtime instructions. Neither entrypoint provisions public
ingress, deploys a server or bypasses hosting limits.
