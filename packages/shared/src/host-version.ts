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
 */
export const MIN_HOST_SERVICE_VERSION = "0.8.0";

/**
 * Versions accepted by `superset update --version`. Build metadata and
 * hyphens within prerelease identifiers are intentionally unsupported by the
 * CLI download naming scheme.
 */
export const INSTALLABLE_HOST_VERSION_RE =
	/^[0-9]+\.[0-9]+\.[0-9]+(?:-[A-Za-z0-9.]+)?$/;
export const MAX_INSTALLABLE_HOST_VERSION_LENGTH = 64;

export type HostVersionOrder = -1 | 0 | 1;

function normalizeOrder(order: number): HostVersionOrder {
	if (order === 0) return 0;
	return order < 0 ? -1 : 1;
}

function parseInstallableHostVersion(version: string) {
	if (version.length > MAX_INSTALLABLE_HOST_VERSION_LENGTH) return null;
	if (!INSTALLABLE_HOST_VERSION_RE.test(version)) return null;
	return semver.parse(version);
}

export function isInstallableHostVersion(version: string): boolean {
	return parseInstallableHostVersion(version) !== null;
}

type PublicationRelease =
	| { type: "stable" }
	| { type: "numeric-hotfix"; sequence: string };

function getPublicationRelease(
	version: string,
	core: string,
): PublicationRelease | null {
	if (version === core) return { type: "stable" };

	const suffix = version.slice(core.length + 1);
	if (/^(?:0|[1-9][0-9]*)$/.test(suffix)) {
		return { type: "numeric-hotfix", sequence: suffix };
	}
	return null;
}

function compareNumericStrings(left: string, right: string): HostVersionOrder {
	if (left.length !== right.length) {
		return left.length < right.length ? -1 : 1;
	}
	if (left === right) return 0;
	return left < right ? -1 : 1;
}

/**
 * Orders installable host releases by publication sequence. Numeric `-N`
 * releases are CLI/host hotfixes published after the stable version with the
 * same core. Different cores always retain normal SemVer ordering.
 *
 * Returns `null` when either value is not installable by the CLI.
 */
export function compareHostVersions(
	leftVersion: string,
	rightVersion: string,
): HostVersionOrder | null {
	const left = parseInstallableHostVersion(leftVersion);
	const right = parseInstallableHostVersion(rightVersion);
	if (!left || !right) return null;

	for (const key of ["major", "minor", "patch"] as const) {
		if (left[key] !== right[key]) {
			return left[key] < right[key] ? -1 : 1;
		}
	}

	const core = `${left.major}.${left.minor}.${left.patch}`;
	const leftPublication = getPublicationRelease(leftVersion, core);
	const rightPublication = getPublicationRelease(rightVersion, core);
	if (leftPublication && rightPublication) {
		if (leftPublication.type === "stable") {
			return rightPublication.type === "stable" ? 0 : -1;
		}
		if (rightPublication.type === "stable") return 1;
		return compareNumericStrings(
			leftPublication.sequence,
			rightPublication.sequence,
		);
	}

	return normalizeOrder(semver.compare(left, right));
}

export function isHostVersionAtLeast(
	version: string,
	minimumVersion: string,
): boolean {
	const order = compareHostVersions(version, minimumVersion);
	return order !== null && order >= 0;
}
