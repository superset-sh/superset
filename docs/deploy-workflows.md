# Writing deploy workflows

Four things about `.github/workflows/` that surprised us during the 17 September 2026 outage and
its follow-through. Migration safety itself is in `.agents/skills/db-migrations/SKILL.md`; adding
a variable to the deploys is in `docs/environment-variables.md`.

## A piped `run:` step hides failures

| The step sets | GitHub runs it with | `cmd \| tee log` returns |
| --- | --- | --- |
| nothing (the default) | `bash -e {0}` | tee's status, so always success |
| `shell: bash` | `bash --noprofile --norc -eo pipefail {0}` | `cmd`'s status |

On 2026-09-19 this reported a failed production migration as a success and let the app deploys
start against an unmigrated database.

- Put `set -o pipefail` at the top of any `run:` block that pipes.
- When testing a step locally, copy the `shell:` line from a real run log. Do not assume
  `pipefail`.
- Where a false success is expensive, check the outcome as well as the exit code.
  `packages/db/src/verify-migrations-applied.ts` does this for migrations.

## Production secrets exist only in GitHub

Secrets such as `SECRETS_ENCRYPTION_KEY` and `DATABASE_URL` live only as GitHub `production`
environment secrets. The deploy injects them into Vercel with `--env`; the Vercel project env is
nearly empty.

Anything that needs a production secret must run as an Actions workflow with
`environment: production`. `.github/workflows/backfill-connections.yml` is the pattern: manual
dispatch, dry run by default, writes only when the `apply` input is checked.

## One run shows about ten deployment rows

Every job that declares `environment: production` creates its own row on the GitHub Deployments
page. That is cosmetic.

## Wait after `gh workflow enable`

Dispatching a workflow within a second of `gh workflow enable` produced a run stuck "queued" with
zero jobs. It could not be cancelled, force-cancelled or deleted. Wait about 20 seconds after
enabling before you dispatch.
