import {
	existsSync,
	mkdirSync,
	readFileSync,
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
	writeFileSync(
		manifestPath(manifest.organizationId),
		JSON.stringify(manifest),
		{
			encoding: "utf-8",
			mode: 0o600,
		},
	);
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
