import {
	closeSync,
	mkdirSync,
	openSync,
	readFileSync,
	renameSync,
	rmSync,
	writeFileSync,
	writeSync,
} from "node:fs";
import { dirname } from "node:path";
import { updateLockPath } from "./paths";

export interface UpdateLockRecord {
	pid: number;
	targetVersion: string;
	previousVersion: string;
	startedAt: number;
}

function isPidAlive(pid: number): boolean {
	if (!Number.isInteger(pid) || pid <= 1) return false;
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		return (error as NodeJS.ErrnoException).code === "EPERM";
	}
}

export function readUpdateLock(
	organizationId: string,
	homeDir?: string,
): UpdateLockRecord | null {
	try {
		const parsed = JSON.parse(
			readFileSync(updateLockPath(organizationId, homeDir), "utf8"),
		) as Partial<UpdateLockRecord>;
		if (
			typeof parsed.pid !== "number" ||
			typeof parsed.targetVersion !== "string" ||
			typeof parsed.previousVersion !== "string" ||
			typeof parsed.startedAt !== "number"
		) {
			return null;
		}
		return {
			pid: parsed.pid,
			targetVersion: parsed.targetVersion,
			previousVersion: parsed.previousVersion,
			startedAt: parsed.startedAt,
		};
	} catch {
		return null;
	}
}

export function acquireUpdateLock(options: {
	organizationId: string;
	ownerPid: number;
	targetVersion: string;
	previousVersion: string;
	homeDir?: string;
	now?: number;
	isOwnerAlive?: (pid: number) => boolean;
}):
	| { acquired: true; lock: UpdateLockRecord }
	| { acquired: false; lock: UpdateLockRecord | null } {
	const path = updateLockPath(options.organizationId, options.homeDir);
	const ownerAlive = options.isOwnerAlive ?? isPidAlive;
	const existing = readUpdateLock(options.organizationId, options.homeDir);
	if (existing && ownerAlive(existing.pid)) {
		return { acquired: false, lock: existing };
	}
	if (existing) rmSync(path, { force: true });

	mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
	const lock: UpdateLockRecord = {
		pid: options.ownerPid,
		targetVersion: options.targetVersion,
		previousVersion: options.previousVersion,
		startedAt: options.now ?? Date.now(),
	};

	let descriptor: number;
	try {
		descriptor = openSync(path, "wx", 0o600);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "EEXIST") {
			return {
				acquired: false,
				lock: readUpdateLock(options.organizationId, options.homeDir),
			};
		}
		throw error;
	}
	try {
		writeSync(descriptor, JSON.stringify(lock));
	} finally {
		closeSync(descriptor);
	}
	return { acquired: true, lock };
}

export function transferUpdateLock(options: {
	organizationId: string;
	fromPid: number;
	toPid: number;
	homeDir?: string;
}): UpdateLockRecord {
	const path = updateLockPath(options.organizationId, options.homeDir);
	const current = readUpdateLock(options.organizationId, options.homeDir);
	if (!current || current.pid !== options.fromPid) {
		throw new Error("Update lock ownership changed before supervisor handoff");
	}

	const next = { ...current, pid: options.toPid };
	const temporaryPath = `${path}.${process.pid}.${Date.now()}.tmp`;
	writeFileSync(temporaryPath, JSON.stringify(next), { mode: 0o600 });
	try {
		renameSync(temporaryPath, path);
	} catch (error) {
		rmSync(temporaryPath, { force: true });
		throw error;
	}
	return next;
}

export function releaseUpdateLock(options: {
	organizationId: string;
	ownerPid?: number;
	homeDir?: string;
}): boolean {
	const current = readUpdateLock(options.organizationId, options.homeDir);
	if (options.ownerPid !== undefined && current?.pid !== options.ownerPid) {
		return false;
	}
	rmSync(updateLockPath(options.organizationId, options.homeDir), {
		force: true,
	});
	return true;
}
