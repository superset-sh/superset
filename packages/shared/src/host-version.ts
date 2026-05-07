/**
 * Minimum host-service version this app can work with. Bumping this forces
 * the desktop coordinator to kill + respawn any adopted local service older
 * than this, and gates v2 workspace UIs from mounting against a remote host
 * whose CLI is still on an older version.
 *
 * 0.4.0: terminal launch moved from `terminal.ensureSession` to
 * `terminal.launchSession` plus WebSocket attach params.
 * 0.3.0: host-service registers via cloud `host.ensure` (was
 * `device.ensureV2Host`); v2_hosts/v2_users_hosts/v2_workspaces use
 * machineId text instead of uuid surrogates.
 * 0.2.0: `workspaceCreation.adopt` gained optional `worktreePath`.
 *
 * 0.5.0 — pty-daemon supervision migrated into host-service. New
 * `terminal.daemon` tRPC namespace; older 0.4.x host-services don't
 * expose it. Adopting one in place would leave the new desktop
 * talking to old code: Settings → Manage daemon would silently
 * fail, and the v2 PTY survival promise is broken.
 *
 * 0.7.0 — canonical `workspaces.create` flow + `settings.hostAgentConfigs`
 * router (PR1, #3893). Older 0.6.x host-services don't expose either,
 * so adopting one in place would break new-project creation and the
 * agent-config settings UI.
 *
 * 0.8.0 — v2 terminal creation moved to `terminal.createSession`; the
 * WebSocket route is attach-only by `terminalId`. Older host-services would
 * reject the renderer's creation call and still expect socket-side startup.
 */
export const MIN_HOST_SERVICE_VERSION = "0.8.0";
