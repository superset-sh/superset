import {
	existsSync,
	mkdirSync,
	readFileSync,
	renameSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { SUPERSET_HOME_DIR } from "./app-environment";

export interface HostServiceManifest {
	pid: number;
	endpoint: string;
	authToken: string;
	startedAt: number;
	organizationId: string;
}

export function manifestDir(organizationId: string): string {
	return join(SUPERSET_HOME_DIR, "host", organizationId);
}

function manifestPath(organizationId: string): string {
	return join(manifestDir(organizationId), "manifest.json");
}

export function writeManifest(manifest: HostServiceManifest): void {
	const dir = manifestDir(manifest.organizationId);
	if (!existsSync(dir)) {
		mkdirSync(dir, { recursive: true, mode: 0o700 });
	}
	// Write-then-rename so concurrent readers (the CLI, other instances'
	// claim/ownership checks) never see a torn file — a torn read parses as
	// null, which callers must not mistake for "no claim".
	const finalPath = manifestPath(manifest.organizationId);
	const tempPath = `${finalPath}.${process.pid}.tmp`;
	writeFileSync(tempPath, JSON.stringify(manifest), {
		encoding: "utf-8",
		mode: 0o600,
	});
	renameSync(tempPath, finalPath);
}

export function readManifest(
	organizationId: string,
): HostServiceManifest | null {
	const filePath = manifestPath(organizationId);
	if (!existsSync(filePath)) return null;

	try {
		const raw = readFileSync(filePath, "utf-8");
		const data = JSON.parse(raw);

		if (
			typeof data.pid !== "number" ||
			typeof data.endpoint !== "string" ||
			typeof data.authToken !== "string" ||
			typeof data.startedAt !== "number" ||
			typeof data.organizationId !== "string"
		) {
			return null;
		}

		return data as HostServiceManifest;
	} catch {
		return null;
	}
}

/**
 * Whether a booting host-service must leave the manifest alone. The manifest
 * is the CLI's routing table; stealing it from a live, healthy instance
 * routes CLI writes to a host-service the desktop renderer isn't listening
 * to — its broadcasts become invisible and CLI-created workspaces render
 * "not found" until a fallback refetch. A dead or unhealthy holder forfeits
 * its claim.
 */
export async function shouldYieldManifest(
	existing: HostServiceManifest | null,
	selfPid: number,
	deps: {
		isAlive: (pid: number) => boolean;
		probeHealthy: (endpoint: string, authToken: string) => Promise<boolean>;
	},
): Promise<boolean> {
	if (!existing || existing.pid === selfPid) return false;
	if (!deps.isAlive(existing.pid)) return false;
	return deps.probeHealthy(existing.endpoint, existing.authToken);
}

export function removeManifest(organizationId: string): void {
	const filePath = manifestPath(organizationId);
	try {
		if (existsSync(filePath)) {
			unlinkSync(filePath);
		}
	} catch {
		// Best-effort removal
	}
}

/** Check whether a process with the given PID is alive. */
export function isProcessAlive(pid: number): boolean {
	if (!isSignalablePid(pid)) return false;

	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}

export function killProcess(
	pid: number,
	signal: NodeJS.Signals | number,
): void {
	if (!isSignalablePid(pid)) {
		throw new Error(`Refusing to signal invalid pid: ${pid}`);
	}

	process.kill(pid, signal);
}

function isSignalablePid(pid: number): boolean {
	return Number.isInteger(pid) && Number.isFinite(pid) && pid > 1;
}
