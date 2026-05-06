import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

const SUPERVISOR_BINARY_NAME = "superset-host-supervisor";

/**
 * The host-service runs as `lib/node lib/host-service.js`, so process.execPath
 * is `<install>/lib/node`. Walking up two levels lands at the install root,
 * mirroring `resolveInstallRoot()` in `packages/cli/src/commands/update/command.ts`.
 */
function resolveInstallRoot(): string {
	if (process.env.SUPERSET_INSTALL_ROOT) {
		return process.env.SUPERSET_INSTALL_ROOT;
	}
	return dirname(dirname(process.execPath));
}

/**
 * Locate the supervisor binary that ships in the install root's bin/.
 * Override via SUPERSET_HOST_SUPERVISOR_BIN for dev/test.
 */
export function resolveSupervisorBinary(): string {
	if (process.env.SUPERSET_HOST_SUPERVISOR_BIN) {
		return process.env.SUPERSET_HOST_SUPERVISOR_BIN;
	}
	return join(resolveInstallRoot(), "bin", SUPERVISOR_BINARY_NAME);
}

export interface SpawnSupervisorOptions {
	organizationId: string;
	oldPid: number;
	targetVersion: string | null;
}

export interface SpawnSupervisorResult {
	supervisorPid: number;
	supervisorBinary: string;
}

export function spawnUpdateSupervisor(
	options: SpawnSupervisorOptions,
): SpawnSupervisorResult {
	const supervisorBinary = resolveSupervisorBinary();
	if (!existsSync(supervisorBinary)) {
		throw new Error(
			`superset-host-supervisor binary not found at ${supervisorBinary}. Remote update is unavailable for this install.`,
		);
	}

	const env: Record<string, string> = {
		PATH: process.env.PATH ?? "",
		HOME: process.env.HOME ?? "",
		SUPERSET_HOME_DIR: process.env.SUPERSET_HOME_DIR ?? "",
		SUPERSET_INSTALL_ROOT: resolveInstallRoot(),
		SUPERSET_UPDATE_ORG_ID: options.organizationId,
		SUPERSET_UPDATE_OLD_PID: String(options.oldPid),
		SUPERSET_UPDATE_TARGET_VERSION: options.targetVersion ?? "",
	};

	const child = spawn(supervisorBinary, [], {
		detached: true,
		stdio: "ignore",
		env,
	});
	if (!child.pid) {
		throw new Error("Failed to spawn supervisor process");
	}
	child.unref();
	return { supervisorPid: child.pid, supervisorBinary };
}
