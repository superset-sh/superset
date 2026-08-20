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
import { join, resolve } from "node:path";

export interface PtyDaemonManifest {
	pid: number;
	socketPath: string;
	protocolVersions: number[];
	startedAt: number;
	organizationId: string;
	// ----- Phase 2 (daemon-binary upgrade fd-handoff) -----
	// All present only during the brief handoff window. Older host-service
	// builds that don't know these fields ignore them harmlessly.
	/** True between predecessor's snapshot-write and successor's bind. */
	handoffInProgress?: boolean;
	/** Path of the on-disk handoff snapshot the successor will read. */
	handoffSnapshotPath?: string;
	/** PID of the spawned successor; pre-bind, supervisor uses this to track. */
	handoffSuccessorPid?: number;
}

/**
 * True when running under a test runner: `bun test` sets NODE_ENV=test,
 * `node --test` marks its spawned test processes with NODE_TEST_CONTEXT.
 */
export function isTestRunnerContext(
	env: NodeJS.ProcessEnv = process.env,
): boolean {
	return env.NODE_ENV === "test" || env.NODE_TEST_CONTEXT !== undefined;
}

/**
 * Tests must never resolve the REAL daemon namespace (`~/.superset`
 * manifests, org-keyed sockets): a test that reads a real manifest or
 * dials a real socket can adopt, reap, or kill daemons and shells that
 * belong to running desktop instances — this has killed live dev stacks
 * and their agents' terminals. Fail loudly instead: every test that
 * touches the daemon layer must point SUPERSET_HOME_DIR at an isolated
 * temp dir (and usually SUPERSET_PTY_DAEMON_SOCKET at a temp socket).
 */
export function assertIsolatedDaemonNamespaceInTests(
	env: NodeJS.ProcessEnv = process.env,
): void {
	if (!isTestRunnerContext(env)) return;
	const home = env.SUPERSET_HOME_DIR;
	const defaultHome = join(homedir(), ".superset");
	// Resolve before comparing: a trailing-slash or relative alias of the
	// default home must not slip past the guard.
	if (!home || resolve(home) === resolve(defaultHome)) {
		throw new Error(
			"refusing to touch the default ~/.superset daemon namespace from a " +
				"test: set SUPERSET_HOME_DIR to an isolated temp dir (and " +
				"SUPERSET_PTY_DAEMON_SOCKET to a temp socket) before using the " +
				"daemon layer.",
		);
	}
}

function supersetHomeDir(): string {
	assertIsolatedDaemonNamespaceInTests();
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
		// Phase 2 fields are optional. If present, they must have the right
		// shape; otherwise drop them silently rather than rejecting the whole
		// manifest — these fields are advisory state and missing/garbage
		// values shouldn't make the daemon unrecoverable.
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
