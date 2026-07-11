import { existsSync } from "node:fs";
import { resolveUpdateSupervisorBinary } from "./paths";

export function supportsRemoteUpdate(options?: {
	environment?: NodeJS.ProcessEnv;
	execPath?: string;
	platform?: NodeJS.Platform;
	pathExists?: (path: string) => boolean;
}): boolean {
	const environment = options?.environment ?? process.env;
	const platform = options?.platform ?? process.platform;
	const pathExists = options?.pathExists ?? existsSync;

	// Desktop owns and restarts its host child. Replacing the standalone CLI
	// install from that child would update the wrong runtime.
	if (environment.HOST_PARENT_PID) return false;
	if (platform === "win32") return false;
	if (environment.SUPERSET_HOST_LIFECYCLE_MODE !== "daemon") return false;
	// The supervisor restarts through the CLI after replacing the install. A
	// transient --api-key override is unavailable to that new process.
	if (!environment.SUPERSET_AUTH_CONFIG_PATH) return false;

	return pathExists(
		resolveUpdateSupervisorBinary(environment, options?.execPath),
	);
}
