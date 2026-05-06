import {
	closeSync,
	existsSync,
	openSync,
	readFileSync,
	rmSync,
	writeSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

interface LockPayload {
	pid: number;
	startedAt: number;
}

function supersetHomeDir(): string {
	return process.env.SUPERSET_HOME_DIR || join(homedir(), ".superset");
}

export function updateLockPath(organizationId: string): string {
	return join(supersetHomeDir(), "host", organizationId, "update.lock");
}

function isPidAlive(pid: number): boolean {
	if (!pid) return false;
	try {
		process.kill(pid, 0);
		return true;
	} catch (err) {
		return (err as NodeJS.ErrnoException).code === "EPERM";
	}
}

function readLock(path: string): LockPayload | null {
	try {
		const raw = readFileSync(path, "utf-8");
		const parsed = JSON.parse(raw) as Partial<LockPayload>;
		if (
			typeof parsed.pid !== "number" ||
			typeof parsed.startedAt !== "number"
		) {
			return null;
		}
		return { pid: parsed.pid, startedAt: parsed.startedAt };
	} catch {
		return null;
	}
}

/**
 * PID-based exclusive lock for the update supervisor. If a stale lock points
 * at a dead PID, we reclaim it. Otherwise the caller should refuse to start
 * a second update.
 */
export function acquireUpdateLock(
	organizationId: string,
	pid: number,
): { acquired: true } | { acquired: false; heldBy: number } {
	const path = updateLockPath(organizationId);

	if (existsSync(path)) {
		const existing = readLock(path);
		if (existing && isPidAlive(existing.pid)) {
			return { acquired: false, heldBy: existing.pid };
		}
		// Stale — clear and reacquire.
		rmSync(path, { force: true });
	}

	let fd: number;
	try {
		fd = openSync(path, "wx", 0o600);
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code === "EEXIST") {
			const existing = readLock(path);
			return { acquired: false, heldBy: existing?.pid ?? 0 };
		}
		throw err;
	}
	try {
		const payload: LockPayload = { pid, startedAt: Date.now() };
		writeSync(fd, JSON.stringify(payload));
	} finally {
		closeSync(fd);
	}
	return { acquired: true };
}

export function releaseUpdateLock(organizationId: string): void {
	const path = updateLockPath(organizationId);
	if (existsSync(path)) {
		rmSync(path, { force: true });
	}
}
