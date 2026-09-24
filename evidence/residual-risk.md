# P1-C — residual risk after the fix

The trust boundary governs **who may declare** a lifecycle command. It does not, and cannot on its
own, govern **what a declared command does when it runs**.

## Not closed: branch-controlled script bodies

`setup.ts:14-16` documents the intended pattern:

    "setup": ["./.superset/setup.sh"]

That command string lives in the trusted main-repo config, so the boundary admits it. But lifecycle
commands execute with `cwd: worktreePath` (`teardown.ts:62`; setup is typed into a PTY rooted in the
worktree), so `./.superset/setup.sh` resolves to **the branch's copy** of that script. A pull request
that rewrites `setup.sh` — without touching `config.json` at all — still gets code execution against
a victim who opens or deletes that workspace.

The same holds for any command that executes repo content indirectly: `make`, `npm install`
(lifecycle scripts), `docker compose up`, `./gradlew`, and so on. This is the same trust model as
running a build in an untrusted checkout.

**Why it is out of scope here:** closing it requires asking the user to consent before running
lifecycle commands in a workspace whose branch content they have not vouched for — a UI flow
(dialog, remembered per project/branch, plus a headless policy for `superset ws create --agent`),
not a change to the resolver. Shipping a half-version of that silently would be worse than not
shipping it.

**What the fix does give that flow:** `resolveLifecycleConfig()` already returns a `rejected[]`
describing exactly what an untrusted source tried to contribute, and emits a `[lifecycle-trust]`
warning per field. A consent UI can be built on that signal without re-plumbing the resolver.

## Accepted as trusted

- `<mainRepoPath>/.superset/config.json` — the checkout the user themselves added as a project, and
  the file the in-app setup-script editor writes to (`routers/config/config.ts:479-503`). Treating
  it as untrusted would break every first-party flow. Note this means a user who clones a hostile
  repository and adds it as a project is still exposed; that is the "you ran a repo's build" model,
  and it is the case the consent flow above would also cover.
- `~/.superset/projects/<projectId>/config.json` and the main repo's `config.local.json` — outside
  any branch, writable only locally.

## Deliberate behaviour change

A branch can no longer change its own setup/teardown/run commands or `cwd`. Legitimate uses:

- permanent change → land it on the default branch, where the main-repo config picks it up;
- machine-local change → `.superset/config.local.json` in the main repo (gitignored, trusted).

Three existing tests asserted the old worktree-wins precedence and were rewritten to assert the
boundary instead — see the diff of `setup.test.ts`.
