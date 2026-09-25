# Docs site

Everything under `content/` is published at docs.superset.sh, so it documents
only what a customer can run today.

- **CLI reference (`content/docs/cli/cli-reference.mdx`) lists public commands
  only.** A command or group with `audience: "internal"` in its `command.ts` or
  `meta.ts` under `packages/cli/src/commands/` does not appear here, however
  useful it is to us; the desktop's help and `superset --help` are where an
  internal command is discovered. Check the audience before adding an entry,
  and remove the entry in the same change that makes a command internal.
- Features behind a flag or an allowlist (cloud workspaces and everything under
  `environments`, for example) stay out until they ship to everyone.
