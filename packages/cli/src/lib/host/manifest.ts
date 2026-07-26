import {
	chmodSync,
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { SUPERSET_HOME_DIR } from "../config";

/**
 * Manifest format matches the desktop app's HostServiceManifest
 * (apps/desktop/src/main/lib/host-service-manifest.ts) so both clients
 * can read each other's manifests.
 */
export interface HostServiceManifest {
	pid: number;
	endpoint: string;
	authToken: string;
	startedAt: number;
	organizationId: string;
}

/** Resolve the per-organization host runtime directory. */
function manifestDir(
	organizationId: string,
	supersetHomeDir = SUPERSET_HOME_DIR,
): string {
	return join(supersetHomeDir, "host", organizationId);
}

/** Resolve the per-organization host manifest path. */
function manifestPath(
	organizationId: string,
	supersetHomeDir = SUPERSET_HOME_DIR,
): string {
	return join(manifestDir(organizationId, supersetHomeDir), "manifest.json");
}

export function ensureManifestDir(organizationId: string): string {
	const dir = manifestDir(organizationId);
	if (!existsSync(dir)) {
		mkdirSync(dir, { recursive: true, mode: 0o700 });
	}
	return dir;
}

export function writeManifest(manifest: HostServiceManifest): void {
	ensureManifestDir(manifest.organizationId);
	const path = manifestPath(manifest.organizationId);
	writeFileSync(path, JSON.stringify(manifest, null, 2), { mode: 0o600 });
	chmodSync(path, 0o600);
}

export function readManifest(
	organizationId: string,
	supersetHomeDir = SUPERSET_HOME_DIR,
): HostServiceManifest | null {
	const path = manifestPath(organizationId, supersetHomeDir);
	if (!existsSync(path)) return null;
	try {
		return JSON.parse(readFileSync(path, "utf-8")) as HostServiceManifest;
	} catch {
		return null;
	}
}

/** Read every valid host-service manifest under the Superset home directory. */
export function listManifests(
	supersetHomeDir = SUPERSET_HOME_DIR,
): HostServiceManifest[] {
	const hostDir = join(supersetHomeDir, "host");
	if (!existsSync(hostDir)) return [];

	return readdirSync(hostDir, { withFileTypes: true }).flatMap((entry) => {
		if (!entry.isDirectory()) return [];
		const manifest = readManifest(entry.name, supersetHomeDir);
		return manifest ? [manifest] : [];
	});
}

export function removeManifest(organizationId: string): void {
	const path = manifestPath(organizationId);
	if (existsSync(path)) rmSync(path);
}

export function isProcessAlive(pid: number): boolean {
	if (!pid) return false;
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}

export function hostDbPath(organizationId: string): string {
	return join(manifestDir(organizationId), "host.db");
}
