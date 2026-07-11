import { spawn } from "node:child_process";
import {
	resolveSupersetHomeDir,
	resolveUpdateInstallRoot,
	resolveUpdateSupervisorBinary,
} from "./paths";

export interface SpawnUpdateSupervisorOptions {
	organizationId: string;
	oldPid: number;
	targetVersion: string;
	environment?: NodeJS.ProcessEnv;
	execPath?: string;
	spawnProcess?: typeof spawn;
	onSpawnError?: (error: Error) => void;
}

export interface SpawnUpdateSupervisorResult {
	supervisorPid: number;
	supervisorBinary: string;
}

export function spawnUpdateSupervisor(
	options: SpawnUpdateSupervisorOptions,
): SpawnUpdateSupervisorResult {
	const environment = options.environment ?? process.env;
	const supervisorBinary = resolveUpdateSupervisorBinary(
		environment,
		options.execPath,
	);
	const spawnProcess = options.spawnProcess ?? spawn;
	const child = spawnProcess(supervisorBinary, [], {
		detached: true,
		stdio: "ignore",
		env: {
			PATH: environment.PATH ?? "",
			HOME: environment.HOME ?? "",
			SUPERSET_HOME_DIR: resolveSupersetHomeDir(environment),
			...(environment.SUPERSET_AUTH_CONFIG_PATH
				? {
						SUPERSET_AUTH_CONFIG_PATH: environment.SUPERSET_AUTH_CONFIG_PATH,
					}
				: {}),
			SUPERSET_INSTALL_ROOT: resolveUpdateInstallRoot(
				environment,
				options.execPath,
			),
			SUPERSET_UPDATE_ORG_ID: options.organizationId,
			SUPERSET_UPDATE_OLD_PID: String(options.oldPid),
			SUPERSET_UPDATE_TARGET_VERSION: options.targetVersion,
		},
	});

	child.once("error", (error) => {
		if (options.onSpawnError) {
			options.onSpawnError(error);
			return;
		}
		console.error("[host-update] update supervisor process failed:", error);
	});
	if (!child.pid) {
		throw new Error("Failed to spawn update supervisor");
	}
	child.unref();
	return { supervisorPid: child.pid, supervisorBinary };
}

export function terminateUpdateSupervisor(
	supervisorPid: number,
	signal: NodeJS.Signals = "SIGTERM",
): void {
	try {
		process.kill(supervisorPid, signal);
	} catch {
		// The supervisor may already have exited.
	}
}
