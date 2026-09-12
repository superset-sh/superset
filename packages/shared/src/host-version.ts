import semver from "semver";

/**
 * Minimum host-service version a v2 workspace UI can work with against a
 * **remote** host whose binary we don't control (gates renderer mounting
 * via `useRemoteHostStatus`). For the local host-service we bundle, the
 * desktop coordinator pins to the bundled version exactly (read from
 * `@superset/host-service/package.json`) — this floor does not apply.
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
 *
 * 1.21.0 — session listing consolidated into `terminal.list` (#6341), which
 * every current caller uses; hosts without it render a blank terminal pane
 * with no error (#6525). Host-service versions were unified with the app's
 * at that point, so the jump from the old 0.8.x line is intentional.
 */
export const MIN_HOST_SERVICE_VERSION = "1.21.0";

/**
 * What spawned the host-service, which decides how it can be updated:
 * - `desktop`: `host-service.js` inside the signed app bundle, run by the
 *   desktop's own executable. Only the app's auto-updater can replace it.
 * - `cli`: the standalone install (`bin/superset-host` next to
 *   `bin/superset`). It can replace itself in place.
 * - `dev`: a checkout (`bun run dev`); never updated in place.
 * - `unknown`: a host-service that predates the env var.
 */
export const HOST_INSTALL_SOURCES = [
	"desktop",
	"cli",
	"dev",
	"unknown",
] as const;
export type HostInstallSource = (typeof HOST_INSTALL_SOURCES)[number];

/** Set by whatever spawns a host-service so it can report its install source. */
export const HOST_INSTALL_SOURCE_ENV = "SUPERSET_HOST_INSTALL_SOURCE";

export function parseHostInstallSource(
	value: string | null | undefined,
): HostInstallSource {
	return (HOST_INSTALL_SOURCES as readonly string[]).includes(value ?? "")
		? (value as HostInstallSource)
		: "unknown";
}

/**
 * How a host-service version relates to the client looking at it.
 *
 * - `current`: same version as this client.
 * - `behind`: older than this client but still above the wire floor. Never
 *   blocks anything; the host should be updated.
 * - `incompatible`: below {@link MIN_HOST_SERVICE_VERSION}; workspaces on
 *   the host cannot open.
 * - `ahead`: newer than this client; the client is what needs updating.
 * - `unknown`: no version, or one semver cannot parse. Treated as fine so a
 *   dev build or a host that predates version reporting never shows as
 *   broken.
 */
export type HostVersionState =
	| "current"
	| "behind"
	| "incompatible"
	| "ahead"
	| "unknown";

export function deriveHostVersionState(
	hostVersion: string | null | undefined,
	clientVersion: string | null | undefined,
	minVersion: string = MIN_HOST_SERVICE_VERSION,
): HostVersionState {
	if (hostVersion?.startsWith("0.0.0-")) return "unknown";
	const host = hostVersion ? semver.coerce(hostVersion) : null;
	if (!host) return "unknown";
	if (semver.lt(host, minVersion)) return "incompatible";
	const client = clientVersion ? semver.coerce(clientVersion) : null;
	if (!client) return "unknown";
	const order = semver.compare(host, client);
	if (order === 0) return "current";
	return order < 0 ? "behind" : "ahead";
}

/** States that warrant an update action on the host. */
export function hostNeedsUpdate(state: HostVersionState): boolean {
	return state === "behind" || state === "incompatible";
}

/** Only versioned releases have a matching standalone CLI download. */
export function isHostUpdateTarget(version: string): boolean {
	return /^\d+\.\d+\.\d+$/.test(version) && semver.valid(version) !== null;
}
