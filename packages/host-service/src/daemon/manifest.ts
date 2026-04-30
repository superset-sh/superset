// Manifest for a running pty-daemon instance. Lives under
// $SUPERSET_HOME_DIR/host/{organizationId}/. Different lifecycle from
// host-service's own manifest — the daemon outlives host-service restarts.

import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface PtyDaemonManifest {
	pid: number;
	socketPath: string;
	protocolVersions: number[];
	startedAt: number;
	organizationId: string;
}

function supersetHomeDir(): string {
	return process.env.SUPERSET_HOME_DIR || join(homedir(), ".superset");
}

export function ptyDaemonManifestDir(organizationId: string): string {
	return join(supersetHomeDir(), "host", organizationId);
}

function ptyDaemonManifestPath(organizationId: string): string {
	return join(ptyDaemonManifestDir(organizationId), "pty-daemon-manifest.json");
}

export function writePtyDaemonManifest(manifest: PtyDaemonManifest): void {
	const dir = ptyDaemonManifestDir(manifest.organizationId);
	if (!existsSync(dir)) {
		mkdirSync(dir, { recursive: true, mode: 0o700 });
	}
	writeFileSync(
		ptyDaemonManifestPath(manifest.organizationId),
		JSON.stringify(manifest),
		{ encoding: "utf-8", mode: 0o600 },
	);
}

export function readPtyDaemonManifest(
	organizationId: string,
): PtyDaemonManifest | null {
	const filePath = ptyDaemonManifestPath(organizationId);
	if (!existsSync(filePath)) return null;

	try {
		const raw = readFileSync(filePath, "utf-8");
		const data = JSON.parse(raw);
		if (
			typeof data.pid !== "number" ||
			typeof data.socketPath !== "string" ||
			!Array.isArray(data.protocolVersions) ||
			typeof data.startedAt !== "number" ||
			typeof data.organizationId !== "string"
		) {
			return null;
		}
		return data as PtyDaemonManifest;
	} catch {
		return null;
	}
}

export function listPtyDaemonManifests(): PtyDaemonManifest[] {
	const hostDir = join(supersetHomeDir(), "host");
	if (!existsSync(hostDir)) return [];
	const manifests: PtyDaemonManifest[] = [];
	try {
		for (const entry of readdirSync(hostDir, { withFileTypes: true })) {
			if (!entry.isDirectory()) continue;
			const manifest = readPtyDaemonManifest(entry.name);
			if (manifest) manifests.push(manifest);
		}
	} catch {
		// best-effort
	}
	return manifests;
}

export function removePtyDaemonManifest(organizationId: string): void {
	const filePath = ptyDaemonManifestPath(organizationId);
	try {
		if (existsSync(filePath)) unlinkSync(filePath);
	} catch {
		// best-effort
	}
}

export function isProcessAlive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch (err) {
		return (err as NodeJS.ErrnoException).code === "EPERM";
	}
}
