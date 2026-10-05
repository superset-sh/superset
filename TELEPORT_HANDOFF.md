# Workspace teleport: design summary

Source: `plans/20260925-workspace-teleport.md`

1. A workspace moves between devices (or to a cloud sandbox) by packaging its dirty state as throwaway commits on a hidden ref: a staged-index commit, a working-tree commit on top, plus a side tree of allowlisted precious ignored files like `.env` and a manifest of workspace metadata, terminals, and pane layout.
2. Transport prefers a direct git fetch over the existing relay and host-service; a parked encrypted bundle built against the destination's own tips covers an offline source, and a hidden `refs/superset/teleport/<id>` ref pushed to origin is the transport for cloud sandboxes, with the precious allowlist off.
3. The destination clones or adopts the worktree, reapplies sparse checkout, restores with `read-tree` into the working tree and index, runs setup scripts in a visible terminal, and rebuilds panes by replaying splits with each pane's argv re-targeted (keep model flags, drop session and cwd flags, rewrite paths).
4. Agent sessions move as text, not files: each live agent is asked to write a handoff note that travels in the commit, with the bounded `terminal.transcript` tail as fallback, and the destination relaunches the agent via `agents.run`; a `moved` end reason stops the source from auto-resuming it.
5. The move is a two-phase commit with the source kept as a reclaimable tombstone, preflight refusals for a branch already checked out or a diverged destination tip, a Herdr-style per-pane review plan before anything moves, and phasing P0 (committed state only), P1 (dirty state, relay transport, sessions), P2 (park, continuous handoff, warm standby, cloud both ways).

Under-explained: "Cloud as a destination, as built" — the handoff reduces it to the hidden-ref transport and omits the separate `createCloudTeleportOperations` adapter, sandbox creation via `cloudWorkspace.create` (host `workspaces.create` is machine-only), `cloudWorkspace.access({ wake: true })` polling, the `buildArrivalCommand` restore run through `terminal.launchSession` with the `TELEPORT_RESTORED` marker, and the branch-rename and released-host-service traps that force that transport today.

Newest trap: the dev API cannot provision sandboxes — its `VERCEL_SANDBOX_*` values are placeholders and it hands boxes `SUPERSET_API_URL=http://localhost:3001`, so filming a real cloud arrival from the dev desktop needs the `cloudWorkspace.*` and `environment.list` procedures routed to production with everything else on dev.
late change at 02:21:06
late change at 02:34:34
late change at 02:38:19
