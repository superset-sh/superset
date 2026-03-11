import {
	type Dirent,
	existsSync,
	readdirSync,
	readFileSync,
	realpathSync,
	statSync,
} from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import {
	projects,
	type SelectWorktree,
	worktrees,
} from "@superset/local-db/schema";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { localDb } from "main/lib/local-db";
import { getBranchWorktreePath, repairWorktreeRegistration } from "./git";

export type ResolveTrackedWorktreePathResult =
	| {
			status: "resolved";
			path: string;
	  }
	| {
			status: "git_repair_required";
			branch: string;
			mainRepoPath: string;
			registeredPath: string;
			storedPath: string;
	  }
	| {
			status: "missing";
	  };

export type TrackedWorktreeRepairState =
	| "ok"
	| "missing"
	| "repair_required"
	| "repairing";

export interface TrackedWorktreeDisplayState {
	existsOnDisk: boolean;
	repairCommand: string | null;
	repairMessage: string | null;
	repairState: TrackedWorktreeRepairState;
	storedPath: string;
	worktreePath: string | null;
}

interface TrackedWorktreeContext {
	mainRepoPath: string;
	worktree: SelectWorktree;
}

interface RepairWorktreePathDeps {
	eq: typeof eq;
	getBranchWorktreePath: typeof getBranchWorktreePath;
	localDb: typeof localDb;
	projects: typeof projects;
	repairWorktreeRegistration: typeof repairWorktreeRegistration;
	worktrees: typeof worktrees;
}

interface ResolveTrackedWorktreePathWithMetadataResult {
	pathChanged: boolean;
	resolution: ResolveTrackedWorktreePathResult;
}

interface CachedRepairFailure {
	recordedAt: number;
	resolution: Exclude<ResolveTrackedWorktreePathResult, { status: "resolved" }>;
}

export const __testOnlyRepairWorktreePathDeps: RepairWorktreePathDeps = {
	eq,
	getBranchWorktreePath,
	localDb,
	projects,
	repairWorktreeRegistration,
	worktrees,
};

function buildResolvedResult(path: string): ResolveTrackedWorktreePathResult {
	return {
		status: "resolved",
		path,
	};
}

function buildMissingResolutionResult(): Extract<
	ResolveTrackedWorktreePathResult,
	{ status: "missing" }
> {
	return { status: "missing" };
}

function buildGitRepairRequiredResolution(
	context: TrackedWorktreeContext,
	registeredPath: string,
): Extract<
	ResolveTrackedWorktreePathResult,
	{ status: "git_repair_required" }
> {
	return {
		status: "git_repair_required",
		branch: context.worktree.branch,
		mainRepoPath: context.mainRepoPath,
		registeredPath,
		storedPath: context.worktree.path,
	};
}

const MAX_SEARCH_DEPTH = 1;
const MAX_SCAN_DIRS = 250;
const AUTO_REPAIR_BACKOFF_MS = 30_000;
const SKIPPED_SCAN_DIRS = new Set([
	".git",
	"node_modules",
	".next",
	"dist",
	"build",
	"coverage",
	"target",
]);
const cachedRepairFailures = new Map<string, CachedRepairFailure>();
const activeRepairAttempts = new Map<
	string,
	Promise<ResolveTrackedWorktreePathWithMetadataResult>
>();

function readDirectoryEntries(path: string): Dirent[] {
	return readdirSync(path, { withFileTypes: true });
}

function safeResolvePath(path: string): string {
	return resolve(path);
}

function safeRealpath(path: string): string {
	try {
		return realpathSync(path);
	} catch {
		return safeResolvePath(path);
	}
}

function isExistingDirectory(path: string): boolean {
	if (!existsSync(path)) {
		return false;
	}

	try {
		return statSync(path).isDirectory();
	} catch {
		return false;
	}
}

function parseGitdirReference(worktreePath: string): string | null {
	const dotGitPath = join(worktreePath, ".git");
	if (!existsSync(dotGitPath)) {
		return null;
	}

	try {
		if (!statSync(dotGitPath).isFile()) {
			return null;
		}

		const contents = readFileSync(dotGitPath, "utf8").trim();
		if (!contents.startsWith("gitdir:")) {
			return null;
		}

		const rawGitdir = contents.slice("gitdir:".length).trim();
		return isAbsolute(rawGitdir)
			? safeResolvePath(rawGitdir)
			: safeResolvePath(resolve(worktreePath, rawGitdir));
	} catch {
		return null;
	}
}

function getTrackedWorktreeSearchRoots(
	context: TrackedWorktreeContext,
): string[] {
	const roots = [
		dirname(context.worktree.path),
		context.mainRepoPath,
		dirname(context.mainRepoPath),
	];

	const seen = new Set<string>();
	const result: string[] = [];

	for (const root of roots) {
		if (!isExistingDirectory(root)) {
			continue;
		}

		const normalizedRoot = safeRealpath(root);
		if (seen.has(normalizedRoot)) {
			continue;
		}

		seen.add(normalizedRoot);
		result.push(normalizedRoot);
	}

	return result;
}

function findTrackedWorktreeMetadata(input: {
	context: TrackedWorktreeContext;
}): {
	metadataDir: string;
	registeredPath: string;
} | null {
	const metadataRoot = join(input.context.mainRepoPath, ".git", "worktrees");
	if (!isExistingDirectory(metadataRoot)) {
		return null;
	}

	const expectedStoredPath = safeResolvePath(input.context.worktree.path);

	for (const entry of readDirectoryEntries(metadataRoot)) {
		if (!entry.isDirectory()) {
			continue;
		}

		const metadataDir = join(metadataRoot, entry.name);
		const headPath = join(metadataDir, "HEAD");
		const gitdirPath = join(metadataDir, "gitdir");

		if (!existsSync(headPath) || !existsSync(gitdirPath)) {
			continue;
		}

		try {
			const head = readFileSync(headPath, "utf8").trim();
			const rawGitdir = readFileSync(gitdirPath, "utf8").trim();
			const registeredGitdir = isAbsolute(rawGitdir)
				? safeResolvePath(rawGitdir)
				: safeResolvePath(resolve(metadataDir, rawGitdir));
			const registeredPath = dirname(registeredGitdir);

			if (
				head === `ref: refs/heads/${input.context.worktree.branch}` ||
				safeResolvePath(registeredPath) === expectedStoredPath
			) {
				return { metadataDir, registeredPath };
			}
		} catch {}
	}

	return null;
}

function findMovedTrackedWorktreeCandidate(input: {
	context: TrackedWorktreeContext;
	metadataDir: string;
}): string | null {
	const expectedMetadataDir = safeRealpath(input.metadataDir);
	const mainRepoRealPath = safeRealpath(input.context.mainRepoPath);
	const searchRoots = getTrackedWorktreeSearchRoots(input.context);
	const visited = new Set<string>();
	const stack = searchRoots.map((path) => ({ path, depth: 0 }));
	let scannedDirs = 0;

	while (stack.length > 0 && scannedDirs < MAX_SCAN_DIRS) {
		const current = stack.pop();
		if (!current) {
			continue;
		}

		if (!isExistingDirectory(current.path)) {
			continue;
		}

		const currentRealPath = safeRealpath(current.path);
		if (visited.has(currentRealPath)) {
			continue;
		}

		visited.add(currentRealPath);
		scannedDirs += 1;

		if (currentRealPath !== mainRepoRealPath) {
			const gitdirReference = parseGitdirReference(current.path);
			if (
				gitdirReference &&
				safeRealpath(gitdirReference) === expectedMetadataDir
			) {
				return currentRealPath;
			}
		}

		if (current.depth >= MAX_SEARCH_DEPTH) {
			continue;
		}

		let entries: Dirent[];
		try {
			entries = readDirectoryEntries(current.path);
		} catch {
			continue;
		}

		for (const entry of entries) {
			if (!entry.isDirectory()) {
				continue;
			}

			if (SKIPPED_SCAN_DIRS.has(entry.name)) {
				continue;
			}

			const childPath = join(current.path, entry.name);
			if (safeRealpath(childPath) === mainRepoRealPath) {
				continue;
			}

			stack.push({
				path: childPath,
				depth: current.depth + 1,
			});
		}
	}

	return null;
}

async function tryAutoRepairTrackedWorktree(input: {
	context: TrackedWorktreeContext;
}): Promise<string | null> {
	const metadata = findTrackedWorktreeMetadata({
		context: input.context,
	});
	if (!metadata) {
		return null;
	}

	const candidatePath = findMovedTrackedWorktreeCandidate({
		context: input.context,
		metadataDir: metadata.metadataDir,
	});

	if (!candidatePath) {
		return null;
	}

	console.log(
		`[repair-worktree-path] Found manually moved worktree for branch ${input.context.worktree.branch} at "${candidatePath}", repairing Git registration`,
	);
	try {
		await __testOnlyRepairWorktreePathDeps.repairWorktreeRegistration({
			mainRepoPath: input.context.mainRepoPath,
			worktreePath: candidatePath,
		});
	} catch (error) {
		console.warn(
			`[repair-worktree-path] Failed to repair Git registration for worktree ${input.context.worktree.id}:`,
			error instanceof Error ? error.message : error,
		);
		return null;
	}

	let repairedPath: string | null = null;
	try {
		repairedPath = await __testOnlyRepairWorktreePathDeps.getBranchWorktreePath(
			{
				mainRepoPath: input.context.mainRepoPath,
				branch: input.context.worktree.branch,
			},
		);
	} catch (error) {
		console.warn(
			`[repair-worktree-path] Failed to refresh repaired path for worktree ${input.context.worktree.id}:`,
			error instanceof Error ? error.message : error,
		);
	}

	if (repairedPath && existsSync(repairedPath)) {
		return repairedPath;
	}

	return existsSync(candidatePath) ? candidatePath : null;
}

function getCachedRepairFailure(
	worktreeId: string,
): CachedRepairFailure | null {
	const cached = cachedRepairFailures.get(worktreeId);
	if (!cached) {
		return null;
	}

	if (Date.now() - cached.recordedAt > AUTO_REPAIR_BACKOFF_MS) {
		cachedRepairFailures.delete(worktreeId);
		return null;
	}

	return cached;
}

function rememberRepairFailure(
	worktreeId: string,
	resolution: Exclude<ResolveTrackedWorktreePathResult, { status: "resolved" }>,
): void {
	cachedRepairFailures.set(worktreeId, {
		recordedAt: Date.now(),
		resolution,
	});
}

function clearRepairFailure(worktreeId: string): void {
	cachedRepairFailures.delete(worktreeId);
}

export function getTrackedWorktreeRepairCommand(mainRepoPath: string): string {
	return `git -C "${mainRepoPath}" worktree repair <new-path>`;
}

export function getTrackedWorktreeRepairMessage(input: {
	branch: string;
	mainRepoPath: string;
}): string {
	return `Worktree branch "${input.branch}" was moved outside Git worktree management. Run ${getTrackedWorktreeRepairCommand(input.mainRepoPath)} with the current path, or use git worktree move next time.`;
}

function buildTrackedWorktreeDisplayState(
	context: TrackedWorktreeContext,
): TrackedWorktreeDisplayState {
	if (existsSync(context.worktree.path)) {
		clearRepairFailure(context.worktree.id);
		return {
			existsOnDisk: true,
			repairCommand: null,
			repairMessage: null,
			repairState: "ok",
			storedPath: context.worktree.path,
			worktreePath: context.worktree.path,
		};
	}

	if (activeRepairAttempts.has(context.worktree.id)) {
		return {
			existsOnDisk: false,
			repairCommand: null,
			repairMessage: "Repairing the moved worktree path in the background.",
			repairState: "repairing",
			storedPath: context.worktree.path,
			worktreePath: null,
		};
	}

	const cachedFailure = getCachedRepairFailure(context.worktree.id);
	if (cachedFailure?.resolution.status === "git_repair_required") {
		return {
			existsOnDisk: false,
			repairCommand: getTrackedWorktreeRepairCommand(
				cachedFailure.resolution.mainRepoPath,
			),
			repairMessage: getTrackedWorktreeRepairMessage({
				branch: cachedFailure.resolution.branch,
				mainRepoPath: cachedFailure.resolution.mainRepoPath,
			}),
			repairState: "repair_required",
			storedPath: context.worktree.path,
			worktreePath: null,
		};
	}

	return {
		existsOnDisk: false,
		repairCommand: null,
		repairMessage: "Tracked worktree path is missing on disk.",
		repairState: "missing",
		storedPath: context.worktree.path,
		worktreePath: null,
	};
}

function getTrackedWorktreeContext(
	worktreeId: string,
): TrackedWorktreeContext | null {
	const worktree = __testOnlyRepairWorktreePathDeps.localDb
		.select()
		.from(__testOnlyRepairWorktreePathDeps.worktrees)
		.where(
			__testOnlyRepairWorktreePathDeps.eq(
				__testOnlyRepairWorktreePathDeps.worktrees.id,
				worktreeId,
			),
		)
		.get();

	if (!worktree) {
		return null;
	}

	const project = __testOnlyRepairWorktreePathDeps.localDb
		.select()
		.from(__testOnlyRepairWorktreePathDeps.projects)
		.where(
			__testOnlyRepairWorktreePathDeps.eq(
				__testOnlyRepairWorktreePathDeps.projects.id,
				worktree.projectId,
			),
		)
		.get();

	if (!project) {
		return null;
	}

	return {
		mainRepoPath: project.mainRepoPath,
		worktree,
	};
}

export function getTrackedWorktreeDisplayStateFromTrackedWorktree(input: {
	mainRepoPath: string;
	worktree: SelectWorktree;
}): TrackedWorktreeDisplayState {
	return buildTrackedWorktreeDisplayState({
		mainRepoPath: input.mainRepoPath,
		worktree: input.worktree,
	});
}

export function getTrackedWorktreeDisplayState(
	worktreeId: string,
): TrackedWorktreeDisplayState {
	const context = getTrackedWorktreeContext(worktreeId);
	if (!context) {
		return {
			existsOnDisk: false,
			repairCommand: null,
			repairMessage: "Tracked worktree could not be found.",
			repairState: "missing",
			storedPath: "",
			worktreePath: null,
		};
	}

	return buildTrackedWorktreeDisplayState(context);
}

function isMainRepoPath(
	context: TrackedWorktreeContext,
	candidatePath: string,
): boolean {
	return safeRealpath(candidatePath) === safeRealpath(context.mainRepoPath);
}

function persistResolvedTrackedWorktreePath(input: {
	context: TrackedWorktreeContext;
	resolvedPath: string;
}): ResolveTrackedWorktreePathWithMetadataResult {
	if (isMainRepoPath(input.context, input.resolvedPath)) {
		const resolution = buildMissingResolutionResult();
		rememberRepairFailure(input.context.worktree.id, resolution);
		return { pathChanged: false, resolution };
	}

	const pathChanged = input.resolvedPath !== input.context.worktree.path;

	if (pathChanged) {
		console.log(
			`[repair-worktree-path] Worktree path changed: "${input.context.worktree.path}" → "${input.resolvedPath}" (branch: ${input.context.worktree.branch})`,
		);
		__testOnlyRepairWorktreePathDeps.localDb
			.update(__testOnlyRepairWorktreePathDeps.worktrees)
			.set({ path: input.resolvedPath })
			.where(
				__testOnlyRepairWorktreePathDeps.eq(
					__testOnlyRepairWorktreePathDeps.worktrees.id,
					input.context.worktree.id,
				),
			)
			.run();
	}

	clearRepairFailure(input.context.worktree.id);

	return {
		pathChanged,
		resolution: buildResolvedResult(input.resolvedPath),
	};
}

async function getRegisteredTrackedWorktreePath(
	context: TrackedWorktreeContext,
): Promise<string | null> {
	try {
		return await __testOnlyRepairWorktreePathDeps.getBranchWorktreePath({
			mainRepoPath: context.mainRepoPath,
			branch: context.worktree.branch,
		});
	} catch (error) {
		console.warn(
			`[repair-worktree-path] Failed to inspect Git worktree state for ${context.worktree.id}:`,
			error instanceof Error ? error.message : error,
		);
		return null;
	}
}

async function resolveTrackedWorktreePathFromGitState(
	context: TrackedWorktreeContext,
): Promise<ResolveTrackedWorktreePathWithMetadataResult> {
	const registeredPath = await getRegisteredTrackedWorktreePath(context);

	if (!registeredPath) {
		const resolution = buildMissingResolutionResult();
		rememberRepairFailure(context.worktree.id, resolution);
		return { pathChanged: false, resolution };
	}

	if (existsSync(registeredPath)) {
		return persistResolvedTrackedWorktreePath({
			context,
			resolvedPath: registeredPath,
		});
	}

	const cachedFailure = getCachedRepairFailure(context.worktree.id);
	if (cachedFailure) {
		return {
			pathChanged: false,
			resolution: cachedFailure.resolution,
		};
	}

	const repairedPath = await tryAutoRepairTrackedWorktree({
		context,
	});

	if (!repairedPath) {
		const resolution = buildGitRepairRequiredResolution(
			context,
			registeredPath,
		);
		rememberRepairFailure(context.worktree.id, resolution);
		return { pathChanged: false, resolution };
	}

	return persistResolvedTrackedWorktreePath({
		context,
		resolvedPath: repairedPath,
	});
}

async function resolveTrackedWorktreePathWithMetadata(
	worktreeId: string,
): Promise<ResolveTrackedWorktreePathWithMetadataResult> {
	const context = getTrackedWorktreeContext(worktreeId);
	if (!context) {
		return {
			pathChanged: false,
			resolution: buildMissingResolutionResult(),
		};
	}

	if (existsSync(context.worktree.path)) {
		clearRepairFailure(context.worktree.id);
		return {
			pathChanged: false,
			resolution: buildResolvedResult(context.worktree.path),
		};
	}

	const existingAttempt = activeRepairAttempts.get(worktreeId);
	if (existingAttempt) {
		return existingAttempt;
	}

	const attempt = resolveTrackedWorktreePathFromGitState(context).finally(
		() => {
			activeRepairAttempts.delete(worktreeId);
		},
	);
	activeRepairAttempts.set(worktreeId, attempt);

	return attempt;
}

function getResolvedTrackedWorktreePath(
	resolution: ResolveTrackedWorktreePathResult,
): string | null {
	return resolution.status === "resolved" ? resolution.path : null;
}

export async function resolveTrackedWorktreePath(
	worktreeId: string,
): Promise<ResolveTrackedWorktreePathResult> {
	const resolution = await resolveTrackedWorktreePathWithMetadata(worktreeId);
	return resolution.resolution;
}

export async function resolveWorktreePathOrThrow(
	worktreeId: string,
): Promise<string | null> {
	const resolution = await resolveTrackedWorktreePathWithMetadata(worktreeId);

	if (resolution.resolution.status === "resolved") {
		return resolution.resolution.path;
	}

	if (resolution.resolution.status === "git_repair_required") {
		throw new TRPCError({
			code: "PRECONDITION_FAILED",
			message: getTrackedWorktreeRepairMessage({
				branch: resolution.resolution.branch,
				mainRepoPath: resolution.resolution.mainRepoPath,
			}),
			cause: {
				reason: "git_repair_required",
				branch: resolution.resolution.branch,
				mainRepoPath: resolution.resolution.mainRepoPath,
				registeredPath: resolution.resolution.registeredPath,
				storedPath: resolution.resolution.storedPath,
				command: getTrackedWorktreeRepairCommand(
					resolution.resolution.mainRepoPath,
				),
			},
		});
	}

	return null;
}

export async function resolveWorktreePathOrThrowWithMetadata(
	worktreeId: string,
): Promise<{
	path: string | null;
	pathChanged: boolean;
}> {
	const resolution = await resolveTrackedWorktreePathWithMetadata(worktreeId);

	if (resolution.resolution.status === "resolved") {
		return {
			path: resolution.resolution.path,
			pathChanged: resolution.pathChanged,
		};
	}

	if (resolution.resolution.status === "git_repair_required") {
		throw new TRPCError({
			code: "PRECONDITION_FAILED",
			message: getTrackedWorktreeRepairMessage({
				branch: resolution.resolution.branch,
				mainRepoPath: resolution.resolution.mainRepoPath,
			}),
			cause: {
				reason: "git_repair_required",
				branch: resolution.resolution.branch,
				mainRepoPath: resolution.resolution.mainRepoPath,
				registeredPath: resolution.resolution.registeredPath,
				storedPath: resolution.resolution.storedPath,
				command: getTrackedWorktreeRepairCommand(
					resolution.resolution.mainRepoPath,
				),
			},
		});
	}

	return { path: null, pathChanged: false };
}

/**
 * Attempts to resolve a tracked worktree path, repairing stale Git registrations
 * when possible.
 *
 * Handles:
 * - normal `git worktree move` updates discovered from `git worktree list`
 * - nearby manual renames that can be repaired via `git worktree repair`
 *
 * @returns The repaired path if successful, null otherwise
 */
export async function tryRepairWorktreePath(
	worktreeId: string,
): Promise<string | null> {
	return resolveWorktreePathWithRepair(worktreeId);
}

/**
 * Returns the current usable worktree path for a tracked worktree.
 *
 * If the stored path still exists, it is returned unchanged. Otherwise this
 * attempts the same branch-based repair flow used by terminal/git-status code.
 */
export async function resolveWorktreePathWithRepair(
	worktreeId: string,
): Promise<string | null> {
	const resolution = await resolveTrackedWorktreePathWithMetadata(worktreeId);
	return getResolvedTrackedWorktreePath(resolution.resolution);
}

export async function resolveWorktreePathWithRepairMetadata(
	worktreeId: string,
): Promise<{
	path: string | null;
	pathChanged: boolean;
	repairState: TrackedWorktreeRepairState;
	repairMessage: string | null;
	repairCommand: string | null;
}> {
	const resolution = await resolveTrackedWorktreePathWithMetadata(worktreeId);
	if (resolution.resolution.status === "resolved") {
		return {
			path: resolution.resolution.path,
			pathChanged: resolution.pathChanged,
			repairCommand: null,
			repairMessage: null,
			repairState: "ok",
		};
	}

	const displayState = getTrackedWorktreeDisplayState(worktreeId);
	return {
		path: null,
		pathChanged: false,
		repairCommand: displayState.repairCommand,
		repairMessage: displayState.repairMessage,
		repairState: displayState.repairState,
	};
}

export async function resolveTrackedWorktree(
	worktree: SelectWorktree,
): Promise<{
	worktree: SelectWorktree;
	existsOnDisk: boolean;
}> {
	const resolvedPath = await resolveWorktreePathWithRepair(worktree.id);

	if (!resolvedPath) {
		return {
			worktree,
			existsOnDisk: false,
		};
	}

	if (resolvedPath === worktree.path) {
		return {
			worktree,
			existsOnDisk: true,
		};
	}

	return {
		worktree: {
			...worktree,
			path: resolvedPath,
		},
		existsOnDisk: true,
	};
}

export async function listProjectWorktreesWithCurrentPaths(
	projectId: string,
): Promise<
	Array<{
		worktree: SelectWorktree;
		existsOnDisk: boolean;
	}>
> {
	const projectWorktrees = __testOnlyRepairWorktreePathDeps.localDb
		.select()
		.from(__testOnlyRepairWorktreePathDeps.worktrees)
		.where(
			__testOnlyRepairWorktreePathDeps.eq(
				__testOnlyRepairWorktreePathDeps.worktrees.projectId,
				projectId,
			),
		)
		.all();

	return Promise.all(projectWorktrees.map(resolveTrackedWorktree));
}

export async function findProjectWorktreeByCurrentPath(
	projectId: string,
	worktreePath: string,
): Promise<SelectWorktree | null> {
	const trackedWorktrees =
		await listProjectWorktreesWithCurrentPaths(projectId);

	for (const trackedWorktree of trackedWorktrees) {
		if (!trackedWorktree.existsOnDisk) {
			continue;
		}

		if (trackedWorktree.worktree.path === worktreePath) {
			return trackedWorktree.worktree;
		}
	}

	return null;
}
