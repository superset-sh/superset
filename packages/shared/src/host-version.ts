/**
 * Canonical version of host-service in this checkout. Reported by
 * `host.info` at runtime, and bundled into the desktop main process as
 * the version the Electron build expects to run against. Bump on every
 * host-service change shipping a new build.
 *
 * The desktop coordinator pins adoption to this exact value: if a running
 * host-service reports a different version (older or newer), it is killed
 * and respawned from the bundled binary. Pty-daemon — which holds durable
 * session state — has its own manifest + supervisor and survives the swap.
 */
export const HOST_SERVICE_VERSION = "0.8.0";

/**
 * Minimum host-service version a v2 workspace UI can work with against a
 * **remote** host whose binary we don't control (gates renderer mounting
 * via `useRemoteHostStatus`). For the local host-service we bundle, the
 * desktop coordinator pins to `HOST_SERVICE_VERSION` exactly — this floor
 * does not apply.
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
 * expose it.
 *
 * 0.7.0 — canonical `workspaces.create` flow + `settings.hostAgentConfigs`
 * router (PR1, #3893). Older 0.6.x host-services don't expose either.
 *
 * 0.8.0 — v2 terminal creation moved to `terminal.createSession`; the
 * WebSocket route is attach-only by `terminalId`.
 */
export const MIN_HOST_SERVICE_VERSION = "0.8.0";
