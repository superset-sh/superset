import {
	existsSync,
	mkdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { SUPERSET_HOME_DIR } from "../config";

/**
 * Manifest for a running pty-daemon instance. Mirrors
 * packages/host-service/src/daemon/manifest.ts (both clients read each
 * other's manifests) — the daemon lives detached under
 * $SUPERSET_HOME_DIR/host/{organizationId}/ and outlives host-service
 * restarts, so the CLI needs its own copy of the read/kill path to stop
 * it alongside the host service.
 */
export interface PtyDaemonManifest {
	pid: number;
	socketPath: string;
	protocolVersions: number[];
	startedAt: number;
	organizationId: string;
	handoffInProgress?: boolean;
	handoffSnapshotPath?: string;
	handoffSuccessorPid?: number;
}

function ptyDaemonManifestPath(organizationId: string): string {
	return join(
		SUPERSET_HOME_DIR,
		"host",
		organizationId,
		"pty-daemon-manifest.json",
	);
}

export function readPtyDaemonManifest(
	organizationId: string,
): PtyDaemonManifest | null {
	const path = ptyDaemonManifestPath(organizationId);
	if (!existsSync(path)) return null;
	try {
		return JSON.parse(readFileSync(path, "utf-8")) as PtyDaemonManifest;
	} catch {
		return null;
	}
}

export function removePtyDaemonManifest(organizationId: string): void {
	const path = ptyDaemonManifestPath(organizationId);
	if (existsSync(path)) {
		rmSync(path, { force: true });
	}
}

export function writePtyDaemonManifest(manifest: PtyDaemonManifest): void {
	const dir = join(SUPERSET_HOME_DIR, "host", manifest.organizationId);
	if (!existsSync(dir)) {
		mkdirSync(dir, { recursive: true, mode: 0o700 });
	}
	writeFileSync(
		ptyDaemonManifestPath(manifest.organizationId),
		JSON.stringify(manifest),
		{ encoding: "utf-8", mode: 0o600 },
	);
}
