import {
	chmodSync,
	existsSync,
	mkdirSync,
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

function manifestDir(organizationId: string): string {
	return join(SUPERSET_HOME_DIR, "host", organizationId);
}

function manifestPath(organizationId: string): string {
	return join(manifestDir(organizationId), "manifest.json");
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
): HostServiceManifest | null {
	const path = manifestPath(organizationId);
	if (!existsSync(path)) return null;
	try {
		return JSON.parse(readFileSync(path, "utf-8")) as HostServiceManifest;
	} catch {
		return null;
	}
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
