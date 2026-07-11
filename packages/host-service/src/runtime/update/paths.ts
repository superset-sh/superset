import { homedir } from "node:os";
import { dirname, join } from "node:path";

export const UPDATE_SUPERVISOR_BINARY_NAME = "superset-host-supervisor";

export function resolveSupersetHomeDir(
	environment: NodeJS.ProcessEnv = process.env,
): string {
	return environment.SUPERSET_HOME_DIR || join(homedir(), ".superset");
}

export function resolveUpdateInstallRoot(
	environment: NodeJS.ProcessEnv = process.env,
	execPath = process.execPath,
): string {
	return environment.SUPERSET_INSTALL_ROOT || dirname(dirname(execPath));
}

export function resolveUpdateSupervisorBinary(
	environment: NodeJS.ProcessEnv = process.env,
	execPath = process.execPath,
): string {
	return (
		environment.SUPERSET_HOST_SUPERVISOR_BIN ||
		join(
			resolveUpdateInstallRoot(environment, execPath),
			"bin",
			UPDATE_SUPERVISOR_BINARY_NAME,
		)
	);
}

export function hostUpdateDirectory(
	organizationId: string,
	homeDir = resolveSupersetHomeDir(),
): string {
	return join(homeDir, "host", organizationId);
}

export function updateLockPath(
	organizationId: string,
	homeDir = resolveSupersetHomeDir(),
): string {
	return join(hostUpdateDirectory(organizationId, homeDir), "update.lock");
}

export function updateResultPath(
	organizationId: string,
	homeDir = resolveSupersetHomeDir(),
): string {
	return join(hostUpdateDirectory(organizationId, homeDir), "last-update.json");
}

export function updateLogPath(
	organizationId: string,
	homeDir = resolveSupersetHomeDir(),
): string {
	return join(hostUpdateDirectory(organizationId, homeDir), "update.log");
}
