# Fix PR14 worktree Electric proxy startup mismatch

## Goal

Address PR #14 review finding that worktree setup writes Caddy Electric URLs when dev:worktree does not start Caddy.

## Requirements

- Adopt the PR #14 review finding that `dev:worktree:start` can report ready
  while the renderer points at a Caddy Electric HTTPS proxy that the lifecycle
  command does not start.
- Keep the worktree lifecycle simple and deterministic by using the Wrangler
  Electric proxy URL directly for worktree-local renderer env:
  `NEXT_PUBLIC_ELECTRIC_URL=http://localhost:${WRANGLER_PORT}` and
  `NEXT_PUBLIC_ELECTRIC_PROXY_URL=http://localhost:${WRANGLER_PORT}`.
- Do not add Caddy as a worktree tmux service.
- Treat stale worktree `.env` files with Caddy Electric URLs as requiring
  local setup regeneration.
- Keep Caddy config/port output available for manual debugging if useful, but
  it must not be the default frontend URL for `dev:worktree`.

## Acceptance Criteria

- [x] `.superset/setup.local.sh` always writes direct Wrangler Electric public
  URLs for worktree-local setup.
- [x] `worktree_env_requires_local_setup` rejects managed `.env` blocks whose
  `NEXT_PUBLIC_ELECTRIC_URL` or `NEXT_PUBLIC_ELECTRIC_PROXY_URL` points at the
  Caddy port.
- [x] `worktree_assert_current_local_env` rejects runtime env where frontend
  Electric public URLs point at Caddy instead of Wrangler.
- [x] Focused shell tests and root lint pass.

## Notes

- This is a targeted review follow-up for PR #14. The actual startup graph only
  launches `api`, `relay`, `electric-proxy`, and `desktop`, so Wrangler is the
  correct public Electric URL for worktree dev.
