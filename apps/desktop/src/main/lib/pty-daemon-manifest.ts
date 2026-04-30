import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { SUPERSET_HOME_DIR } from "./app-environment";

/**
 * Manifest for a running pty-daemon instance. Sibling of
 * HostServiceManifest; lives in the same per-organization directory under
 * $SUPERSET_HOME_DIR/host/{organizationId}/. Different lifecycles — the
 * daemon outlives host-service restarts.
 */
export interface PtyDaemonManifest {
	pid: number;
	socketPath: string;
	protocolVersions: number[];
	daemonVersion: string;
	startedAt: number;
	organizationId: string;
}

export function ptyDaemonManifestDir(organizationId: string): string {
	return join(SUPERSET_HOME_DIR, "host", organizationId);
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
			typeof data.daemonVersion !== "string" ||
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
	const hostDir = join(SUPERSET_HOME_DIR, "host");
	if (!existsSync(hostDir)) return [];
	const manifests: PtyDaemonManifest[] = [];
	try {
		for (const entry of readdirSync(hostDir, { withFileTypes: true })) {
			if (!entry.isDirectory()) continue;
			const manifest = readPtyDaemonManifest(entry.name);
			if (manifest) manifests.push(manifest);
		}
	} catch {
		// Best-effort scan.
	}
	return manifests;
}

export function removePtyDaemonManifest(organizationId: string): void {
	const filePath = ptyDaemonManifestPath(organizationId);
	try {
		if (existsSync(filePath)) unlinkSync(filePath);
	} catch {
		// Best-effort removal.
	}
}
