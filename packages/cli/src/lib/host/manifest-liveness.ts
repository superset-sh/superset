import { checkHostHealth } from "./health";
import type { HostServiceManifest } from "./manifest";
import { isProcessAlive } from "./manifest";
import {
	inspectProcessCommand,
	looksLikeHostProcess,
} from "./process-identity";

export interface ManifestOwnerDeps {
	inspectCommand?: (pid: number) => Promise<string | null>;
	probeHealthy?: (endpoint: string, authToken: string) => Promise<boolean>;
}

/**
 * Whether the live process at `manifest.pid` is actually the host-service
 * that wrote the manifest. Callers must already know the pid is alive —
 * OSes recycle pids, so that alone never proves it. Match its command
 * against the host binary first; fall back to an authenticated ping of the
 * manifest's own endpoint when the command can't be read (e.g. Windows).
 */
export async function verifyManifestOwner(
	manifest: HostServiceManifest,
	deps: ManifestOwnerDeps = {},
): Promise<boolean> {
	const inspectCommand = deps.inspectCommand ?? inspectProcessCommand;
	const command = await inspectCommand(manifest.pid);
	if (command !== null) return looksLikeHostProcess(command);

	const probeHealthy =
		deps.probeHealthy ??
		(async (endpoint: string, authToken: string) =>
			(await checkHostHealth(endpoint, authToken)).healthy);
	return probeHealthy(manifest.endpoint, manifest.authToken);
}

export interface ManifestLivenessDeps extends ManifestOwnerDeps {
	isAlive?: (pid: number) => boolean;
}

/** Whether `manifest` still describes a live, genuine host-service instance. */
export async function isManifestLive(
	manifest: HostServiceManifest,
	deps: ManifestLivenessDeps = {},
): Promise<boolean> {
	const isAlive = deps.isAlive ?? isProcessAlive;
	if (!isAlive(manifest.pid)) return false;
	return verifyManifestOwner(manifest, deps);
}
