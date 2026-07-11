import {
	mkdirSync,
	readFileSync,
	renameSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { dirname } from "node:path";
import { readUpdateLock, releaseUpdateLock } from "./lock";
import { updateResultPath } from "./paths";

const MAX_UPDATE_ERROR_LENGTH = 1_000;

export interface UpdateResult {
	status: "succeeded" | "failed";
	targetVersion: string;
	previousVersion: string;
	finalVersion?: string;
	error?: string;
	completedAt: number;
}

export type HostUpdateStatus =
	| { status: "idle" }
	| {
			status: "updating";
			targetVersion: string;
			previousVersion: string;
			startedAt: number;
	  }
	| UpdateResult;

function isPidAlive(pid: number): boolean {
	if (!Number.isInteger(pid) || pid <= 1) return false;
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		return (error as NodeJS.ErrnoException).code === "EPERM";
	}
}

export function clearUpdateResult(
	organizationId: string,
	homeDir?: string,
): void {
	rmSync(updateResultPath(organizationId, homeDir), { force: true });
}

export function writeUpdateResult(
	organizationId: string,
	result: UpdateResult,
	homeDir?: string,
): void {
	const path = updateResultPath(organizationId, homeDir);
	mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
	const normalized: UpdateResult = {
		...result,
		...(result.error
			? { error: result.error.slice(0, MAX_UPDATE_ERROR_LENGTH) }
			: {}),
	};
	const temporaryPath = `${path}.${process.pid}.${Date.now()}.tmp`;
	writeFileSync(temporaryPath, JSON.stringify(normalized), { mode: 0o600 });
	try {
		renameSync(temporaryPath, path);
	} catch (error) {
		rmSync(temporaryPath, { force: true });
		throw error;
	}
}

export function readUpdateResult(
	organizationId: string,
	homeDir?: string,
): UpdateResult | null {
	try {
		const parsed = JSON.parse(
			readFileSync(updateResultPath(organizationId, homeDir), "utf8"),
		) as Partial<UpdateResult>;
		if (
			(parsed.status !== "succeeded" && parsed.status !== "failed") ||
			typeof parsed.targetVersion !== "string" ||
			typeof parsed.previousVersion !== "string" ||
			typeof parsed.completedAt !== "number" ||
			(parsed.finalVersion !== undefined &&
				typeof parsed.finalVersion !== "string") ||
			(parsed.error !== undefined && typeof parsed.error !== "string")
		) {
			return null;
		}
		return {
			status: parsed.status,
			targetVersion: parsed.targetVersion,
			previousVersion: parsed.previousVersion,
			...(parsed.finalVersion ? { finalVersion: parsed.finalVersion } : {}),
			...(parsed.error ? { error: parsed.error } : {}),
			completedAt: parsed.completedAt,
		};
	} catch {
		return null;
	}
}

export function getHostUpdateStatus(options: {
	organizationId: string;
	homeDir?: string;
	now?: number;
	isOwnerAlive?: (pid: number) => boolean;
}): HostUpdateStatus {
	const lock = readUpdateLock(options.organizationId, options.homeDir);
	if (lock) {
		const ownerAlive = options.isOwnerAlive ?? isPidAlive;
		if (ownerAlive(lock.pid)) {
			return {
				status: "updating",
				targetVersion: lock.targetVersion,
				previousVersion: lock.previousVersion,
				startedAt: lock.startedAt,
			};
		}

		releaseUpdateLock({
			organizationId: options.organizationId,
			ownerPid: lock.pid,
			homeDir: options.homeDir,
		});
		if (!readUpdateResult(options.organizationId, options.homeDir)) {
			writeUpdateResult(
				options.organizationId,
				{
					status: "failed",
					targetVersion: lock.targetVersion,
					previousVersion: lock.previousVersion,
					error: "Update supervisor exited before reporting a result",
					completedAt: options.now ?? Date.now(),
				},
				options.homeDir,
			);
		}
	}

	return (
		readUpdateResult(options.organizationId, options.homeDir) ?? {
			status: "idle",
		}
	);
}
