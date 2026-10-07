import { randomUUID } from "node:crypto";
import { readFileSync, unlinkSync, writeFileSync } from "node:fs";

const ANCIENT_LOCK_MS = 24 * 60 * 60 * 1000;

export type RunLockAcquireResult =
	| { acquired: true; token: string }
	| { acquired: false };

export interface RunLock {
	acquire(): RunLockAcquireResult;
	release(token?: string): boolean;
}

function isProcessAlive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}

// Windows of one app share the pid, so the file alone can't tell two of our
// own holders apart: the in-memory hold does.
export function createRunLock({
	path,
	pid = process.pid,
	now = Date.now,
	isAlive = isProcessAlive,
}: {
	path: string;
	pid?: number;
	now?: () => number;
	isAlive?: (pid: number) => boolean;
}): RunLock {
	let heldToken: string | null = null;

	const tryExclusiveWrite = () => {
		try {
			writeFileSync(path, JSON.stringify({ pid, at: now() }), { flag: "wx" });
			return true;
		} catch {
			return false;
		}
	};

	const ownerIsLive = () => {
		try {
			const lock = JSON.parse(readFileSync(path, "utf8")) as {
				pid: number;
				at: number;
			};
			// Our pid without an in-memory hold is a reused pid from a dead run.
			return (
				lock.pid !== pid &&
				isAlive(lock.pid) &&
				now() - lock.at <= ANCIENT_LOCK_MS
			);
		} catch {
			return false;
		}
	};

	return {
		acquire() {
			if (heldToken) return { acquired: false };
			if (!tryExclusiveWrite()) {
				if (ownerIsLive()) return { acquired: false };
				try {
					unlinkSync(path);
				} catch {}
				if (!tryExclusiveWrite()) return { acquired: false };
			}
			heldToken = randomUUID();
			return { acquired: true, token: heldToken };
		},
		release(token) {
			if (!heldToken) return false;
			if (token !== undefined && token !== heldToken) return false;
			heldToken = null;
			try {
				unlinkSync(path);
			} catch {}
			return true;
		},
	};
}
