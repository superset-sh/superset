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

## Native self-host KV

`SELF_HOST_KV=1` switches the server's KV clients to Redis or Valkey over TCP.
The default is `0`, which keeps the Upstash HTTP clients. `REDIS_URL` defaults
to `redis://127.0.0.1:6379`; set it to the native service URL when that service
lives elsewhere. Native mode does not require `KV_REST_API_URL` or
`KV_REST_API_TOKEN`. Cloud mode keeps their existing validation and each
caller's existing behavior when optional credentials are absent.

The flags belong in the server environment schemas, both templates, Turbo's
`globalEnv`, and both deployment workflows' environment and passthrough blocks.
They have working defaults, so existing cloud deployments need no new secrets.
Configure the deployment secrets or the self-host runtime only when enabling
native KV. No launcher injects these values, and they are never public variables.


## Native self-host email

`SMTP_URL` opts server-side transactional email into SMTP. Leave it unset or
empty to retain the genuine Resend client and its required `RESEND_API_KEY`.
An SMTP runtime does not need a Resend key. `EMAIL_FROM` optionally overrides
transactional senders in SMTP mode; it stays unset by default.

Use `smtp://user:password@mail.example.com:587` for SMTP with opportunistic
STARTTLS or `smtps://user:password@mail.example.com:465` for implicit TLS.
Percent-encode credentials. URLs accept credentials, host and port only;
transport query options, fragments and paths are rejected. Certificate
verification remains enabled. Connection and greeting waits are limited to ten
seconds and SMTP socket inactivity to thirty seconds. Hosted HTTP(S)
attachments have a ten-second fetch limit; local file attachments are denied.

SMTP sends the existing transactional bodies, including React templates and
attachments. Resend dashboard templates, scheduling, topics, tags, request
options and idempotency have no SMTP equivalent and fail explicitly. A batch
prepares every message before delivery, but SMTP delivery is sequential and
non-atomic: an error can follow earlier accepted messages. Avoid blind batch
retries. SMTP lifecycle events are explicitly skipped with one process-level
notice; welcome/activation campaigns and cancellation-feedback enrollment need
the Resend dashboard and remain unavailable in this mode. The automation sync
utility is Resend-specific and refuses to run while `SMTP_URL` is set.

Both variables belong in all six server schemas, both templates, Turbo's
`globalEnv`, and both deploy workflows' environment and passthrough blocks.
They are optional and need no new secrets for existing cloud deployments. Set
operator-owned runtime values or the two deployment secrets only when enabling
SMTP. Keep credentials out of committed files. No root `.env` or deployed
secrets are changed by the generic SMTP port.


## Native self-host job queue

`SELF_HOST_QUEUE=1` selects the durable native queue for server publication and
job delivery authentication. The default is `0`, retaining genuine QStash SDK
clients, their existing token/base URL choices, signature verification and
development shortcuts. Native mode takes precedence over direct development
fetches and local cloud-workspace timers. Only the native worker secret
authenticates deliveries in this mode, including in development; QStash
signatures do not substitute for that secret.

`SELF_HOST_QUEUE_URL` defaults to `http://127.0.0.1:8789`; set it to the worker's
HTTP(S) root origin where the worker lives elsewhere. Credentials, paths,
queries and fragments are not queue service URL options.
`SELF_HOST_QUEUE_SECRET` is required with at least 32 characters in native
mode and must match the worker's secret. Native mode does not require
`QSTASH_TOKEN`, `QSTASH_URL` or the two signing keys. Cloud mode keeps each
schema's existing requirements for those credentials.

Publication waits up to ten seconds for a durable SQLite acknowledgement.
Delivery is at least once, so handlers must tolerate repeated delivery. Native
batches validate and serialize every item before publication, then wait for
groups of at most 1,000 publications in sequence. A failed group settles all
started requests and stops later groups. Independent publications remain
non-atomic on transport or service errors. A timeout can follow a committed
write; stable deduplication IDs help retries of ambiguous outcomes. A failed
job's callback keeps the original JSON body in base64; callback status `0`
means delivery failed before any HTTP response. Existing automation failure
handlers consume that numeric status without changing their payload schema.

The three native variables belong in all six server schemas, both templates,
Turbo's `globalEnv`, and both workflows' environment and quoted passthrough
blocks. Empty optional workflow values retain defaults. Existing cloud
deployments need no new secrets. Set operator-owned runtime values or
deployment secrets when enabling native mode; the local template's example
secret is only a fake development value. This wiring does not modify a root
`.env`, remote secrets, deploys, scheduler or worker image configuration.


## Standalone Next image builds

`NEXT_OUTPUT_STANDALONE=1` opts API, web and docs builds into Next's standalone
Node output with monorepo file tracing. Unset, empty, `0` and other values
retain the existing cloud output. Both templates keep the flag at `0`, and
Turbo hashes it in `globalEnv` so standalone and cloud artifacts do not share
a cache entry. This is a Next configuration build input, not an application
runtime schema value, secret or new self-host mode. Existing cloud workflows
leave it unset and need no new passthrough or deployment secret.

`NEXT_PUBLIC_*` values and Next config origins are baked into the image.
Changing them only in container runtime environment does not update browser
bundles or serialized CSP. The generic image takes public origin arguments and
uses only fake dependency initialization values during the build command;
operator credentials belong in runtime configuration. See
[self-host Next images](self-host/NEXT_IMAGES.md) for the required build inputs,
digest contract and pending platform acceptance.


## Native Worker containers

`REALTIME_PRIVATE_ADDRESSES` and `USERCONTENT_PRIVATE_ADDRESSES` optionally
supply the exact private IP addresses their respective native Worker containers
need for outbound API or S3 requests. Use a comma-separated list of IPv4 or IPv6
addresses. Hostnames, CIDRs and wildcards are rejected. Public outbound addresses
remain available by default. The relay uses its existing
`RELAY2_API_PRIVATE_ADDRESSES` contract.

These inputs belong to the container configuration renderers, outside the
application environment schemas, templates, Turbo and cloud deployments.
Configure them after resolving the intended private endpoints. Each changes
only that container's outbound allowlist; it does not change private network policy or
host firewall rules.

The three Worker Dockerfiles also accept build-only `WORKERD_MINIMUM_VERSION`
and paired `WORKERD_OVERRIDE_VERSION`/`WORKERD_OVERRIDE_SHA512` arguments for
explicit runtime selection. See [Worker runtime selection](self-host/WORKER_RUNTIME.md)
and [native realtime](self-host/REALTIME.md) for artifact, binding and storage
contracts.


## Desktop update feed

`UPDATE_FEED_URL` is an optional URL for a desktop update manifest directory.
The Electron build embeds it in the main process; Turbo includes it in the
build cache key. Configure it when building desktop artifacts. It applies to
both stable and canary builds. Leave it empty to retain the upstream feeds.

Both templates leave this variable empty because local development needs no
custom update service. It is not an API runtime variable or a credential, so
API deployment workflows do not pass it through. The URL must serve manifests
and artifacts compatible with Electron updater.


## CLI build defaults and updates

`SUPERSET_API_URL`, `SUPERSET_WEB_URL` and `RELAY_URL` can supply CLI build
fallbacks. Runtime values still take precedence, including desktop development
shims. Desktop CLI builds map the desktop's `NEXT_PUBLIC_API_URL` and
`NEXT_PUBLIC_WEB_URL` to these defaults. Explicit build environment values keep
precedence over root dotenv values, as they do for the desktop build.

`CLI_UPDATE_BASE_URL` is an optional build input for the directory containing
`cli-latest/version.txt` and release artifact directories. Unlike API addresses,
the update source is fixed in a compiled binary. Both templates leave optional
CLI values empty; unconfigured builds retain upstream defaults. Turbo hashes
these inputs. These are client build settings, so API deploy workflows do not
pass them through. Standalone release builds must set a matching API and update
channel. `superset update` refuses an upstream/custom mismatch before fetching
or installing a replacement. This check does not establish the identity of an
arbitrary custom server or verify downloaded artifacts.

The shell installer accepts `SUPERSET_CLI_BASE_URL` at invocation time. Set it
to the same download directory used for `CLI_UPDATE_BASE_URL` in the compiled
client. The installer preserves `SUPERSET_VERSION` and the existing rolling
and pinned artifact layouts. This variable is consumed by the installer only;
it is not an app build input or an API deployment setting.


## Owned mobile builds

Mobile config and bundle inputs are build settings, with genuine defaults, not
API runtime schema values. Both templates leave optional identity, EAS and
signing inputs empty. Native identity uses `APPLE_TEAM_ID` and
`EXPO_PUBLIC_IOS_BUNDLE_ID`; unset values retain upstream defaults. These are
separate from server OAuth's `APPLE_CLIENT_ID`, `APPLE_CLIENT_SECRET` and
`APPLE_APP_BUNDLE_IDENTIFIER`. The callback scheme stays `superset`.

`EXPO_PUBLIC_APP_NAME` optionally sets the displayed app name;
`MOBILE_BUILD_NUMBER` optionally sets the iOS build number. Native config loads
the root dotenv file before resolving identity; that file overrides process
values for this config. Keep the same effective identity in the app, widget
entitlements and web build.

`MOBILE_SELF_HOST=1`, a custom native identity, a non-upstream API origin or a
non-upstream EAS project/account selects an owned build. Owned builds disable
OTA updates by default and omit upstream EAS ownership. `EAS_PROJECT_ID` and
`EAS_OWNER` must be supplied together and cannot point to the upstream project
or account in owned mode. To enable owned OTA, set `MOBILE_UPDATES_ENABLED=1`
and supply that owned pair.

With OTA enabled, EAS `preview` and `production` profiles require
`MOBILE_SIGNED_UPDATES=1`. Signed owned OTA additionally requires an explicit
`MOBILE_UPDATES_CERTIFICATE` path to the owned public signing certificate;
it never falls back to the upstream certificate. Signing keys, account
credentials and release profile IDs remain operator-controlled. These checks
do not establish ownership or verify a certificate. `EAS_BUILD_PROFILE` is
launcher-owned EAS metadata, not a template value; The mobile task hashes it because it
changes signed-build validation.

Set `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_WEB_URL` and `EXPO_PUBLIC_RELAY_URL`
to the intended reachable services. HTTPS web URLs supply native associated
domains, and the web origin also supplies fallback workspace share links.
The local template's `http://localhost:3000` web URL is for a plain local copy.
Allocated workspaces and physical devices need the actual reachable web origin;
`setup.local.sh` rewrites the mobile API URL but does not rewrite the mobile web
URL. A phone's localhost points at the phone, not the development machine.

An absent or empty `EXPO_PUBLIC_SENTRY_DSN_MOBILE` disables native Sentry
initialization. `EXPO_PUBLIC_SENTRY_ENVIRONMENT` is optional. `SENTRY_ORG` and
`SENTRY_PROJECT` can select an owned source-map destination; absent values keep
upstream plugin defaults. Upload credentials and automatic upload configuration
remain operator-owned. `EXPO_PUBLIC_AUTH_PROVIDERS` retains the existing provider
selection and determines whether config enables the Apple sign-in capability;
unset, empty or whitespace-only retains Apple, GitHub and Google. An explicit comma-separated list controls both visible social actions and native capabilities; `authentik` alone disables Apple capability and exposes only Authentik. Unknown names never expose an action. Both native configuration and the auth client retain the `superset` callback scheme.

Turbo hashes `EXPO_PUBLIC_*` and the explicit native config inputs above on mobile configuration/build tasks,
including signed-update and EAS profile settings. Unlike server runtime
settings in the general checklist, these inputs do not need API deployment
passthroughs. The web build is a specific exception: its force-static Apple
association response imports the shared App ID. Both actual web build steps in
`deploy-production.yml` and `deploy-preview.yml` read `APPLE_TEAM_ID` and
`EXPO_PUBLIC_IOS_BUNDLE_ID` from same-named environment secrets. They need no
runtime `--env` injection; a changed identity requires a new web build.

The standalone web image accepts the same two optional public build arguments;
see [self-host Next images](self-host/NEXT_IMAGES.md). Other native/signing
inputs do not belong in that image. This wiring does not set root `.env`,
create deployment secrets, deploy services or verify an archive, certificate,
physical-device login or associated-domain response.


## Desktop download links

`NEXT_PUBLIC_DOWNLOAD_URL` optionally selects the directory containing the
existing macOS and Linux desktop assets. Unset or empty values preserve the
upstream download links. The web, marketing and docs URL schemas accept this
optional input; both templates leave it empty. Turbo hashes it through the
existing `NEXT_PUBLIC_*` entry. Configure it in the build environment of all
three consumers and rebuild to change their links. Both deployment workflows
read the same-named secret in those build steps. The standalone Next image
also accepts it as a public build argument; it needs no API runtime injection.

This directory serves download assets. Configure `UPDATE_FEED_URL` separately
for desktop updater manifests and `CLI_UPDATE_BASE_URL` for CLI releases.


## Selected client build profile

`SUPERSET_BUILD_ENV_FILE` is an optional launcher-only absolute dotenv file path
for desktop Vite, the bundled CLI builder and Expo config. The generic
[client packaging launchers](self-host/CLIENT_RELEASE.md) set it from their
explicit `--env-file` input. Unset or empty values preserve each entrypoint's
existing root `.env` fallback. Vite and Expo retain `override: true`; bundled
CLI retains `override: false`. The selector does not alter any runtime origin,
server schema or API deployment passthrough, and is not an application setting.
Keep only public build/native config inputs in the selected profile; deployment
and upload secrets remain separate operator inputs. Direct upstream commands
retain their original behavior when the selector is absent.

## Optional Authentik sign-in and analytics

`AUTHENTIK_ISSUER`, `AUTHENTIK_CLIENT_ID` and `AUTHENTIK_CLIENT_SECRET` enable
Authentik through the existing Better Auth generic OAuth plugin. All three
must be configured together. The issuer retains its application path and is
used for OpenID discovery; PKCE and the `openid`, `profile`, and `email` scopes
are enabled. Register `/api/auth/oauth2/callback/authentik` on the API origin as
the application redirect URI. Keep the client secret in server configuration.

Set `NEXT_PUBLIC_AUTH_PROVIDERS=authentik` for web and desktop builds, and
`EXPO_PUBLIC_AUTH_PROVIDERS=authentik` for mobile builds, to expose the optional
button. Unset flags retain existing sign-in choices. These are build inputs;
changing server configuration does not update an existing client build.
Mobile unset, empty or whitespace-only provider selection defaults to Apple,
GitHub and Google. Explicit selections expose only supported names; an
unknown-only selection exposes no action. Apple capability and visible actions
use the same selection, with the existing `superset` callback scheme.

Unset or blank `NEXT_PUBLIC_POSTHOG_KEY` and `EXPO_PUBLIC_POSTHOG_KEY` disable
the corresponding analytics SDK. The existing fake build/development keys also
remain disabled. Configured keys retain the existing SDK behavior. Native
backing services and client origins are independent of analytics configuration.
Cloud workspace UI still follows its existing feature-flag gate. With analytics
disabled there is no flag source, so the flag remains unknown and that UI stays
off; disabling telemetry does not enable cloud provisioning. A configured SDK
with the cloud flag enabled preserves the existing cloud actions.

Native runtime credentials (Authentik, S3 access keys, SMTP and queue credentials) pass through Turbo without changing unrelated task hashes. Public storage endpoints and native adapter selectors remain hashed. Web builds hash the Apple team and iOS bundle identity used in the static association response. Root dotenv files remain build inputs, so changes to those files still invalidate their consumers.
