import {
	closeSync,
	mkdirSync,
	openSync,
	readFileSync,
	unlinkSync,
	writeSync,
} from "node:fs";
import { join } from "node:path";
import { getHostId } from "@superset/shared/host-info";
import { isProcessAlive, manifestDir } from "./host-service-manifest";

/**
 * Cross-instance spawn lock for a per-org host-service.
 *
 * Multiple Superset app instances share one `$SUPERSET_HOME_DIR`, so their
 * in-process `pendingStarts` maps can't stop two instances from spawning the
 * same org's host-service at once. This atomic exclusive-create lockfile
 * single-flights the spawn+health-check critical section across processes.
 *
 * The lock records the *app instance's* pid (Electron main), not the child's —
 * its liveness tracks the spawner so a crashed instance's lock can be stolen.
 */
export interface SpawnLock {
	ownerPid: number;
	machineId: string;
	acquiredAt: number;
}

export interface SpawnLockHandle {
	release(): void;
}

function lockPath(organizationId: string): string {
	return join(manifestDir(organizationId), "spawn.lock");
}

export function readSpawnLock(organizationId: string): SpawnLock | null {
	try {
		const raw = readFileSync(lockPath(organizationId), "utf-8");
		const data = JSON.parse(raw);
		if (
			typeof data.ownerPid !== "number" ||
			typeof data.machineId !== "string" ||
			typeof data.acquiredAt !== "number"
		) {
			return null;
		}
		return data as SpawnLock;
	} catch {
		return null;
	}
}

function removeLock(organizationId: string): void {
	try {
		unlinkSync(lockPath(organizationId));
	} catch {
		// Already gone — fine.
	}
}

function tryCreateLock(organizationId: string): SpawnLockHandle | null {
	const path = lockPath(organizationId);
	try {
		mkdirSync(manifestDir(organizationId), { recursive: true, mode: 0o700 });
	} catch {
		// Best-effort; openSync below surfaces a real failure.
	}

	let fd: number;
	try {
		// "wx" = O_CREAT | O_EXCL: atomic exclusive create on POSIX and Windows.
		fd = openSync(path, "wx", 0o600);
	} catch {
		return null;
	}

	try {
		const lock: SpawnLock = {
			ownerPid: process.pid,
			machineId: getHostId(),
			acquiredAt: Date.now(),
		};
		writeSync(fd, JSON.stringify(lock));
	} finally {
		try {
			// Best-effort close; the lock's existence, not the fd, is what matters.
			closeSync(fd);
		} catch {}
	}

	return {
		release() {
			removeLock(organizationId);
		},
	};
}

/**
 * Acquire the per-org spawn lock, stealing it when the current holder has
 * crashed or wedged. Returns a handle on success, or `null` when a live
 * instance is legitimately mid-spawn (the caller should wait and retry).
 */
export function acquireSpawnLock(
	organizationId: string,
	{ staleMs }: { staleMs: number },
): SpawnLockHandle | null {
	const handle = tryCreateLock(organizationId);
	if (handle) return handle;

	// Lock exists — decide whether the holder is dead/wedged and stealable.
	const existing = readSpawnLock(organizationId);
	const stealable =
		!existing || // garbage / partial write
		!isProcessAlive(existing.ownerPid) || // owner crashed mid-spawn
		Date.now() - existing.acquiredAt > staleMs; // owner wedged

	if (!stealable) return null;

	removeLock(organizationId);
	// One retry after stealing; if a third party grabbed it first, back off.
	return tryCreateLock(organizationId);
}
