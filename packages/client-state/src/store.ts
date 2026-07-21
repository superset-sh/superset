import { randomUUID } from "node:crypto";
import {
	chmod,
	mkdir,
	readFile,
	rename,
	rm,
	stat,
	writeFile,
} from "node:fs/promises";
import { dirname, join } from "node:path";
import {
	EMPTY_SIDEBAR_STATE,
	type SidebarCommand,
	type SidebarStateDocument,
	type SidebarStateReadResult,
	type SidebarStateScope,
	type SidebarStateSnapshot,
	sidebarStateDocumentSchema,
	sidebarStateSnapshotSchema,
} from "./schema";
import { applySidebarCommand } from "./sidebar";

const LOCK_TIMEOUT_MS = 2_000;
const STALE_LOCK_MS = 30_000;

function safeSegment(value: string): string {
	return encodeURIComponent(value);
}

export function sidebarStatePath(
	homeDir: string,
	scope: SidebarStateScope,
): string {
	return join(
		homeDir,
		"client-state",
		safeSegment(scope.organizationId),
		safeSegment(scope.userId),
		"sidebar.json",
	);
}

function emptyDocument(): SidebarStateDocument {
	return {
		version: 1,
		revision: 0,
		updatedAt: 0,
		rendererMigrated: false,
		state: structuredClone(EMPTY_SIDEBAR_STATE),
	};
}

function mergeById<T extends { id: string }>(base: T[], overrides: T[]): T[] {
	const entries = new Map(base.map((entry) => [entry.id, entry]));
	for (const entry of overrides) entries.set(entry.id, entry);
	return [...entries.values()];
}

function mergeRendererMigration(
	rendererState: SidebarStateSnapshot,
	storedState: SidebarStateSnapshot,
): SidebarStateSnapshot {
	return {
		projects: mergeById(rendererState.projects, storedState.projects),
		groups: mergeById(rendererState.groups, storedState.groups),
		workspaces: mergeById(rendererState.workspaces, storedState.workspaces),
	};
}

export async function readSidebarState(
	homeDir: string,
	scope: SidebarStateScope,
): Promise<SidebarStateReadResult> {
	const path = sidebarStatePath(homeDir, scope);
	try {
		const parsed = sidebarStateDocumentSchema.safeParse(
			JSON.parse(await readFile(path, "utf8")),
		);
		if (!parsed.success) {
			throw new Error(`Invalid client sidebar state at ${path}`);
		}
		return { initialized: true, document: parsed.data };
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") {
			return { initialized: false, document: emptyDocument() };
		}
		throw error;
	}
}

async function acquireLock(path: string): Promise<() => Promise<void>> {
	const lockPath = `${path}.lock`;
	const deadline = Date.now() + LOCK_TIMEOUT_MS;
	while (true) {
		try {
			await mkdir(lockPath);
			return () => rm(lockPath, { recursive: true, force: true });
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
			try {
				const lockStat = await stat(lockPath);
				if (Date.now() - lockStat.mtimeMs > STALE_LOCK_MS) {
					await rm(lockPath, { recursive: true, force: true });
					continue;
				}
			} catch (statError) {
				if ((statError as NodeJS.ErrnoException).code === "ENOENT") continue;
				throw statError;
			}
			if (Date.now() >= deadline) {
				throw new Error(
					`Timed out waiting for client sidebar state lock: ${path}`,
				);
			}
			await new Promise((resolve) => setTimeout(resolve, 25));
		}
	}
}

async function writeDocument(
	path: string,
	document: SidebarStateDocument,
): Promise<void> {
	const directory = dirname(path);
	await mkdir(directory, { recursive: true, mode: 0o700 });
	const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
	await writeFile(temporaryPath, `${JSON.stringify(document, null, 2)}\n`, {
		mode: 0o600,
	});
	await chmod(temporaryPath, 0o600);
	try {
		await rename(temporaryPath, path);
	} catch (error) {
		await rm(temporaryPath, { force: true });
		throw error;
	}
	await chmod(path, 0o600);
}

async function updateSidebarState(
	homeDir: string,
	scope: SidebarStateScope,
	update: (current: SidebarStateReadResult) => {
		state: SidebarStateSnapshot;
		rendererMigrated?: boolean;
	} | null,
): Promise<SidebarStateReadResult> {
	const path = sidebarStatePath(homeDir, scope);
	await mkdir(dirname(path), { recursive: true, mode: 0o700 });
	const release = await acquireLock(path);
	try {
		const current = await readSidebarState(homeDir, scope);
		const next = update(current);
		if (next === null) return current;
		const document: SidebarStateDocument = {
			version: 1,
			revision: current.document.revision + 1,
			updatedAt: Date.now(),
			rendererMigrated:
				next.rendererMigrated ?? current.document.rendererMigrated,
			state: sidebarStateSnapshotSchema.parse(next.state),
		};
		await writeDocument(path, document);
		return { initialized: true, document };
	} finally {
		await release();
	}
}

export function initializeSidebarState(
	homeDir: string,
	scope: SidebarStateScope,
	state: SidebarStateSnapshot,
): Promise<SidebarStateReadResult> {
	return updateSidebarState(homeDir, scope, (current) => {
		if (current.document.rendererMigrated) return null;
		return {
			state: mergeRendererMigration(state, current.document.state),
			rendererMigrated: true,
		};
	});
}

export interface ReplaceSidebarStateOptions {
	expectedRevision?: number;
}

export async function replaceSidebarState(
	homeDir: string,
	scope: SidebarStateScope,
	state: SidebarStateSnapshot,
	options: ReplaceSidebarStateOptions = {},
): Promise<SidebarStateReadResult & { conflict: boolean }> {
	let conflict = false;
	const result = await updateSidebarState(homeDir, scope, (current) => {
		if (
			options.expectedRevision !== undefined &&
			current.document.revision !== options.expectedRevision
		) {
			conflict = true;
			return null;
		}
		return { state, rendererMigrated: true };
	});
	return { ...result, conflict };
}

export async function executeSidebarCommand(
	homeDir: string,
	scope: SidebarStateScope,
	command: SidebarCommand,
): Promise<SidebarStateReadResult> {
	if (command.action === "list") return readSidebarState(homeDir, scope);
	return updateSidebarState(homeDir, scope, (current) => ({
		state: applySidebarCommand(current.document.state, command),
	}));
}

export async function watchSidebarState(
	homeDir: string,
	scope: SidebarStateScope,
	onChange: (result: SidebarStateReadResult) => void,
): Promise<() => void> {
	const { watch } = await import("node:fs");
	const path = sidebarStatePath(homeDir, scope);
	const directory = dirname(path);
	await mkdir(directory, { recursive: true, mode: 0o700 });
	let timer: ReturnType<typeof setTimeout> | undefined;
	const watcher = watch(directory, (_event, filename) => {
		if (filename !== "sidebar.json") return;
		if (timer) clearTimeout(timer);
		timer = setTimeout(() => {
			void readSidebarState(homeDir, scope)
				.then(onChange)
				.catch(() => {});
		}, 20);
	});
	return () => {
		if (timer) clearTimeout(timer);
		watcher.close();
	};
}
