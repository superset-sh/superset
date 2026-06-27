import { Buffer } from "node:buffer";
import {
	existsSync,
	mkdirSync,
	readFileSync,
	renameSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { z } from "zod";

export const SIDEBAR_GROUPS_CLI_STATE_VERSION = 1;

const LOCK_WAIT_MS = 5_000;
const LOCK_STALE_MS = 60_000;
const CLAIM_STALE_MS = 60_000;

const sidebarWorkspaceSchema = z.object({
	id: z.string(),
	projectId: z.string(),
	name: z.string(),
	branch: z.string().nullable().optional(),
	sectionId: z.string().nullable(),
	tabOrder: z.number(),
});

const sidebarSectionSchema = z.object({
	id: z.string(),
	projectId: z.string(),
	name: z.string(),
	createdAt: z.string(),
	tabOrder: z.number(),
	isCollapsed: z.boolean(),
	color: z.string().nullable(),
});

export const sidebarGroupsCliSnapshotSchema = z.object({
	updatedAt: z.string(),
	sections: z.array(sidebarSectionSchema),
	workspaces: z.array(sidebarWorkspaceSchema),
});

export const sidebarGroupsCliOperationSchema = z.discriminatedUnion("type", [
	z.object({
		id: z.string(),
		type: z.literal("createSection"),
		createdAt: z.string(),
		sectionId: z.string(),
		projectId: z.string(),
		name: z.string(),
		workspaceIds: z.array(z.string()).default([]),
	}),
	z.object({
		id: z.string(),
		type: z.literal("renameSection"),
		createdAt: z.string(),
		sectionId: z.string(),
		name: z.string(),
	}),
	z.object({
		id: z.string(),
		type: z.literal("deleteSection"),
		createdAt: z.string(),
		sectionId: z.string(),
	}),
	z.object({
		id: z.string(),
		type: z.literal("moveWorkspaces"),
		createdAt: z.string(),
		workspaceIds: z.array(z.string()).min(1),
		sectionId: z.string().nullable(),
	}),
]);

const claimedSidebarGroupsCliOperationSchema = z.object({
	operation: sidebarGroupsCliOperationSchema,
	claimedAt: z.string(),
});

export const sidebarGroupsCliStateSchema = z.object({
	version: z.literal(SIDEBAR_GROUPS_CLI_STATE_VERSION),
	organizationId: z.string(),
	snapshot: sidebarGroupsCliSnapshotSchema.nullable().default(null),
	operations: z.array(sidebarGroupsCliOperationSchema).default([]),
	claimedOperation: claimedSidebarGroupsCliOperationSchema
		.nullable()
		.default(null),
});

export type SidebarGroupsCliWorkspace = z.infer<typeof sidebarWorkspaceSchema>;
export type SidebarGroupsCliSection = z.infer<typeof sidebarSectionSchema>;
export type SidebarGroupsCliSnapshot = z.infer<
	typeof sidebarGroupsCliSnapshotSchema
>;
export type SidebarGroupsCliOperation = z.infer<
	typeof sidebarGroupsCliOperationSchema
>;
export type SidebarGroupsCliState = z.infer<typeof sidebarGroupsCliStateSchema>;

export type SidebarGroupsCliLockOptions = {
	waitMs?: number;
};

export class SidebarGroupsCliStateLockTimeoutError extends Error {
	constructor() {
		super("Timed out waiting for sidebar groups CLI state lock");
		this.name = "SidebarGroupsCliStateLockTimeoutError";
	}
}
function isFileNotFoundError(error: unknown): boolean {
	return (
		typeof error === "object" &&
		error !== null &&
		"code" in error &&
		error.code === "ENOENT"
	);
}

function isFileExistsError(error: unknown): boolean {
	return (
		typeof error === "object" &&
		error !== null &&
		"code" in error &&
		error.code === "EEXIST"
	);
}

function encodeOrganizationId(organizationId: string): string {
	return Buffer.from(organizationId, "utf8").toString("base64url");
}

export function getSidebarGroupsCliStatePath(args: {
	homeDir: string;
	organizationId: string;
}): string {
	return join(
		args.homeDir,
		"sidebar-groups-cli",
		`${encodeOrganizationId(args.organizationId)}.json`,
	);
}

function waitForLockRetry(): void {
	Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25);
}

function withSidebarGroupsCliStateLock<T>(
	args: { homeDir: string; organizationId: string },
	callback: () => T,
	options: SidebarGroupsCliLockOptions = {},
): T {
	const statePath = getSidebarGroupsCliStatePath(args);
	mkdirSync(dirname(statePath), { recursive: true, mode: 0o700 });
	const lockPath = `${statePath}.lock`;
	const waitMs = options.waitMs ?? LOCK_WAIT_MS;
	const startedAt = Date.now();

	while (true) {
		try {
			mkdirSync(lockPath, { mode: 0o700 });
			break;
		} catch (error) {
			if (!isFileExistsError(error)) {
				throw error;
			}

			try {
				const lockStats = statSync(lockPath);
				if (Date.now() - lockStats.mtimeMs > LOCK_STALE_MS) {
					rmSync(lockPath, { recursive: true, force: true });
					continue;
				}
			} catch (statError) {
				if (isFileNotFoundError(statError)) continue;
				throw statError;
			}

			if (waitMs === 0 || Date.now() - startedAt > waitMs) {
				throw new SidebarGroupsCliStateLockTimeoutError();
			}
			waitForLockRetry();
		}
	}

	try {
		return callback();
	} finally {
		rmSync(lockPath, { recursive: true, force: true });
	}
}

export function createEmptySidebarGroupsCliState(
	organizationId: string,
): SidebarGroupsCliState {
	return {
		version: SIDEBAR_GROUPS_CLI_STATE_VERSION,
		organizationId,
		snapshot: null,
		operations: [],
		claimedOperation: null,
	};
}

function readSidebarGroupsCliStateUnlocked(args: {
	homeDir: string;
	organizationId: string;
}): SidebarGroupsCliState {
	const path = getSidebarGroupsCliStatePath(args);
	if (!existsSync(path)) {
		return createEmptySidebarGroupsCliState(args.organizationId);
	}

	let raw: unknown;
	try {
		raw = JSON.parse(readFileSync(path, "utf8"));
	} catch {
		return createEmptySidebarGroupsCliState(args.organizationId);
	}

	const parsed = sidebarGroupsCliStateSchema.safeParse(raw);
	if (!parsed.success || parsed.data.organizationId !== args.organizationId) {
		return createEmptySidebarGroupsCliState(args.organizationId);
	}
	return parsed.data;
}

export function readSidebarGroupsCliState(
	args: {
		homeDir: string;
		organizationId: string;
	},
	options: SidebarGroupsCliLockOptions = {},
): SidebarGroupsCliState {
	return withSidebarGroupsCliStateLock(
		args,
		() => readSidebarGroupsCliStateUnlocked(args),
		options,
	);
}

function writeSidebarGroupsCliStateUnlocked(
	args: {
		homeDir: string;
		organizationId: string;
	},
	state: SidebarGroupsCliState,
): SidebarGroupsCliState {
	const parsed = sidebarGroupsCliStateSchema.safeParse(state);
	if (!parsed.success || parsed.data.organizationId !== args.organizationId) {
		throw new Error("Invalid sidebar groups CLI state");
	}

	const path = getSidebarGroupsCliStatePath(args);
	mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
	const tmpPath = `${path}.${process.pid}.${Date.now()}.${crypto.randomUUID()}.tmp`;
	writeFileSync(tmpPath, `${JSON.stringify(parsed.data, null, "\t")}\n`, {
		mode: 0o600,
	});
	renameSync(tmpPath, path);
	return parsed.data;
}

export function mutateSidebarGroupsCliState(
	args: {
		homeDir: string;
		organizationId: string;
	},
	mutate: (state: SidebarGroupsCliState) => SidebarGroupsCliState,
	options: SidebarGroupsCliLockOptions = {},
): SidebarGroupsCliState {
	return withSidebarGroupsCliStateLock(
		args,
		() => {
			const state = readSidebarGroupsCliStateUnlocked(args);
			const nextState = writeSidebarGroupsCliStateUnlocked(args, mutate(state));
			return nextState;
		},
		options,
	);
}

export function writeSidebarGroupsCliState(
	args: {
		homeDir: string;
		organizationId: string;
	},
	state: SidebarGroupsCliState,
	options: SidebarGroupsCliLockOptions = {},
): void {
	mutateSidebarGroupsCliState(args, () => state, options);
}

export function enqueueSidebarGroupsCliOperation(
	args: {
		homeDir: string;
		organizationId: string;
	},
	operation: SidebarGroupsCliOperation,
	options: SidebarGroupsCliLockOptions = {},
): SidebarGroupsCliState {
	return mutateSidebarGroupsCliState(
		args,
		(state) => ({
			...state,
			operations: [...state.operations, operation],
		}),
		options,
	);
}

export function writeSidebarGroupsCliSnapshot(
	args: {
		homeDir: string;
		organizationId: string;
	},
	snapshot: SidebarGroupsCliSnapshot,
	options: SidebarGroupsCliLockOptions = {},
): SidebarGroupsCliState {
	return mutateSidebarGroupsCliState(
		args,
		(state) => ({
			...state,
			snapshot,
		}),
		options,
	);
}

export function readNextSidebarGroupsCliOperation(
	args: {
		homeDir: string;
		organizationId: string;
	},
	options: SidebarGroupsCliLockOptions = {},
): SidebarGroupsCliOperation | null {
	let claimedOperation: SidebarGroupsCliOperation | null = null;
	mutateSidebarGroupsCliState(
		args,
		(state) => {
			let nextState = state;
			if (state.claimedOperation) {
				const claimedAtMs = Date.parse(state.claimedOperation.claimedAt);
				if (
					Number.isNaN(claimedAtMs) ||
					Date.now() - claimedAtMs <= CLAIM_STALE_MS
				) {
					return state;
				}

				nextState = {
					...state,
					operations: [state.claimedOperation.operation, ...state.operations],
					claimedOperation: null,
				};
			}

			const [operation, ...operations] = nextState.operations;
			if (!operation) {
				return nextState;
			}

			claimedOperation = operation;
			return {
				...nextState,
				operations,
				claimedOperation: {
					operation,
					claimedAt: new Date().toISOString(),
				},
			};
		},
		options,
	);
	return claimedOperation;
}

export function acknowledgeSidebarGroupsCliOperation(
	args: {
		homeDir: string;
		organizationId: string;
	},
	operationId: string,
	options: SidebarGroupsCliLockOptions = {},
): boolean {
	let acknowledged = false;
	mutateSidebarGroupsCliState(
		args,
		(state) => {
			if (state.claimedOperation?.operation.id !== operationId) {
				return state;
			}
			acknowledged = true;
			return { ...state, claimedOperation: null };
		},
		options,
	);
	return acknowledged;
}

export function releaseSidebarGroupsCliOperation(
	args: {
		homeDir: string;
		organizationId: string;
	},
	operationId: string,
	options: SidebarGroupsCliLockOptions = {},
): boolean {
	let released = false;
	mutateSidebarGroupsCliState(
		args,
		(state) => {
			if (state.claimedOperation?.operation.id !== operationId) {
				return state;
			}
			released = true;
			return {
				...state,
				operations: [state.claimedOperation.operation, ...state.operations],
				claimedOperation: null,
			};
		},
		options,
	);
	return released;
}
