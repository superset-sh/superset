#!/bin/sh
# git credential helper for a sandbox: brokers a credential from host-service
# for each git operation instead of holding one.
#
# Registered scoped to https://github.com so it is never asked about, and never
# answers for, any other host. Codespaces shipped an unscoped helper that handed
# the GitHub token to whatever host served the repo (Clone2Leak); Gitpod's was
# host-aware but, unscoped, aborted git for every unrelated host instead of
# declining. Scoping in the config avoids the first; exiting 0 for a foreign
# host avoids the second. The host is checked again inside because git does
# not verify that a helper's answer matches its question.
#
# Only `get` is implemented. `store`/`erase` are no-ops on purpose: nothing is
# stored, so there is nothing to erase. Every git operation asks again — that
# is the design, and it is what keeps the credential from outliving the git
# process that requested it. One call answers both username and password,
# which is why this costs one broker round-trip per operation where an
# askpass-based design pays two.
[ "$1" = "get" ] || exit 0

input=$(cat)
host=$(printf '%s\n' "$input" | sed -n 's/^host=//p' | head -1)
[ "$host" = "github.com" ] || exit 0

# Push scope hint: git tells the helper which URL it is about to hit but not
# which branch or even whether this is a push, so the checked-out branch is
# sent as a best guess and the API refuses a default-branch push from a
# workspace created elsewhere. That is an accident guard, not a boundary —
# `git push origin HEAD:main` sends the same hint and lands on main. What
# actually keeps a prompt-injected agent off the default branch is branch
# protection on the repo. Sent anyway because it stops the honest mistake.
branch=$(git -C "${GIT_WORK_TREE:-$PWD}" rev-parse --abbrev-ref HEAD 2>/dev/null || true)

printf '%s\n%s\n' "$input" "branch=$branch" |
  curl -sS -f -m 20 -X POST --data-binary @- \
    "http://127.0.0.1:${SUPERSET_SANDBOX_HOST_PORT:-4879}/git-credential" 2>/dev/null
