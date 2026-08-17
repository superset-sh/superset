#!/bin/sh
# Supplies the clone credential from the environment for the length of a git
# invocation. Deliberately not `git config credential.helper`: that persists the
# token into .git/config, where anything with a shell in the sandbox — including
# an agent following a prompt injection — can read it afterwards.
case "$1" in
  Username*) printf 'x-access-token' ;;
  Password*) printf '%s' "${SUPERSET_SANDBOX_GIT_TOKEN:-}" ;;
esac
