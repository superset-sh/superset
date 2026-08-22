import {
	existsSync,
	mkdirSync,
	readFileSync,
	renameSync,
	writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * The manifest is the CLI's routing table: ~/.superset/host/<org>/manifest.json
 * names the live host-service for an organization so the CLI can discover its
 * endpoint and borrow session auth. Format matches the desktop app's
 * HostServiceManifest (apps/desktop/src/main/lib/host-service-manifest.ts) and
 * the CLI's reader (packages/cli/src/lib/host/manifest.ts).
 *
 * The desktop's bundled host-service entry claims the manifest itself; this
 * module gives the standalone entry (serve.ts — CLI-spawned and systemd
 * launches) the same claim behavior, so terminals under a deployed host can
 * resolve auth the same way desktop terminals do.
 */
export interface HostServiceManifest {
	pid: number;
	endpoint: string;
	authToken: string;
	startedAt: number;
	organizationId: string;
}

const RECLAIM_INTERVAL_MS = 15_000;
const HOLDER_PROBE_TIMEOUT_MS = 2_500;
const HOLDER_PROBE_RETRY_MS = 200;

function manifestPath(organizationId: string): string {
	const home = process.env.SUPERSET_HOME_DIR ?? join(homedir(), ".superset");
	return join(home, "host", organizationId, "manifest.json");
}

export function readManifest(
	organizationId: string,
): HostServiceManifest | null {
	const filePath = manifestPath(organizationId);
	if (!existsSync(filePath)) return null;
	try {
		const data = JSON.parse(readFileSync(filePath, "utf-8"));
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

function writeManifest(manifest: HostServiceManifest): void {
	const finalPath = manifestPath(manifest.organizationId);
	const dir = join(finalPath, "..");
	if (!existsSync(dir)) {
		mkdirSync(dir, { recursive: true, mode: 0o700 });
	}
	// Write-then-rename so concurrent readers (the CLI, other instances'
	// claim checks) never see a torn file.
	const tempPath = `${finalPath}.${process.pid}.tmp`;
	writeFileSync(tempPath, JSON.stringify(manifest), {
		encoding: "utf-8",
		mode: 0o600,
	});
	renameSync(tempPath, finalPath);
}

function isProcessAlive(pid: number): boolean {
	if (!Number.isInteger(pid) || pid <= 1) return false;
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}

// Retrying probe, like the desktop's: a holder that is momentarily slow
// (mid-GC, DB migration) must not get its claim taken.
async function probeHealthy(
	endpoint: string,
	authToken: string,
): Promise<boolean> {
	const deadline = Date.now() + HOLDER_PROBE_TIMEOUT_MS;
	while (Date.now() < deadline) {
		try {
			const controller = new AbortController();
			const timeout = setTimeout(
				() => controller.abort(),
				Math.max(HOLDER_PROBE_RETRY_MS, deadline - Date.now()),
			);
			try {
				const response = await fetch(`${endpoint}/trpc/health.check`, {
					signal: controller.signal,
					headers: { Authorization: `Bearer ${authToken}` },
				});
				if (response.ok) return true;
			} finally {
				clearTimeout(timeout);
			}
		} catch {
			// not reachable yet
		}
		await new Promise((r) => setTimeout(r, HOLDER_PROBE_RETRY_MS));
	}
	return false;
}

export async function claimManifest(
	manifest: HostServiceManifest,
): Promise<void> {
	const existing = readManifest(manifest.organizationId);
	if (
		existing &&
		existing.pid !== manifest.pid &&
		isProcessAlive(existing.pid) &&
		(await probeHealthy(existing.endpoint, existing.authToken))
	) {
		console.warn(
			`[host-service] manifest for ${manifest.organizationId} held by live pid ${existing.pid} at ${existing.endpoint}; not claiming`,
		);
		return;
	}
	writeManifest(manifest);
}

/**
 * Claim the manifest now and keep re-claiming whenever another holder dies
 * or quits, so the CLI's routing table always names a live instance.
 */
export function startManifestClaim(options: {
	organizationId: string;
	port: number;
	authToken: string;
}): void {
	const manifest: HostServiceManifest = {
		pid: process.pid,
		endpoint: `http://127.0.0.1:${options.port}`,
		authToken: options.authToken,
		startedAt: Date.now(),
		organizationId: options.organizationId,
	};
	void claimManifest(manifest).catch((error) => {
		console.error("[host-service] Failed to write manifest:", error);
	});
	const timer = setInterval(() => {
		if (readManifest(manifest.organizationId)?.pid === process.pid) return;
		void claimManifest(manifest).catch(() => {});
	}, RECLAIM_INTERVAL_MS);
	timer.unref();
}
