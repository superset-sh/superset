import {
	existsSync,
	mkdirSync,
	readFileSync,
	renameSync,
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
		const raw = readFileSync(path, "utf-8");
		const data = JSON.parse(raw) as Record<string, unknown>;
		if (
			typeof data.pid !== "number" ||
			typeof data.socketPath !== "string" ||
			!Array.isArray(data.protocolVersions) ||
			typeof data.startedAt !== "number" ||
			typeof data.organizationId !== "string"
		) {
			return null;
		}
		// Phase 2 (handoff) fields are optional advisory state; validate their
		// shape if present but never reject the whole manifest for garbage.
		const out: PtyDaemonManifest = {
			pid: data.pid,
			socketPath: data.socketPath,
			protocolVersions: data.protocolVersions,
			startedAt: data.startedAt,
			organizationId: data.organizationId,
		};
		if (typeof data.handoffInProgress === "boolean") {
			out.handoffInProgress = data.handoffInProgress;
		}
		if (typeof data.handoffSnapshotPath === "string") {
			out.handoffSnapshotPath = data.handoffSnapshotPath;
		}
		if (typeof data.handoffSuccessorPid === "number") {
			out.handoffSuccessorPid = data.handoffSuccessorPid;
		}
		return out;
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
	// Atomic replace: write a temp file in the same directory, then rename
	// over the manifest. A concurrent reader never sees truncated JSON
	// (writeFileSync truncates before writing), which previously made
	// readPtyDaemonManifest return null and skip daemon shutdown/cleanup.
	const tmpPath = `${ptyDaemonManifestPath(manifest.organizationId)}.tmp`;
	writeFileSync(tmpPath, JSON.stringify(manifest), {
		encoding: "utf-8",
		mode: 0o600,
	});
	renameSync(tmpPath, ptyDaemonManifestPath(manifest.organizationId));
}
