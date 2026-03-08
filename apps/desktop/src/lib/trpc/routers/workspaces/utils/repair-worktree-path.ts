import {
	existsSync,
	readdirSync,
	readFileSync,
	realpathSync,
	statSync,
} from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { projects, type SelectWorktree, worktrees } from "@superset/local-db";
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

interface TrackedWorktreeContext {
	mainRepoPath: string;
	worktree: SelectWorktree;
}

function buildResolvedResult(path: string): ResolveTrackedWorktreePathResult {
	return {
		status: "resolved",
		path,
	};
}

function buildMissingResolutionResult(): ResolveTrackedWorktreePathResult {
	return { status: "missing" };
}

function buildGitRepairRequiredResolution(
	context: TrackedWorktreeContext,
	registeredPath: string,
): ResolveTrackedWorktreePathResult {
	return {
		status: "git_repair_required",
		branch: context.worktree.branch,
		mainRepoPath: context.mainRepoPath,
		registeredPath,
		storedPath: context.worktree.path,
	};
}

const MAX_SEARCH_DEPTH = 2;
const MAX_SCAN_DIRS = 1500;
const SKIPPED_SCAN_DIRS = new Set([
	".git",
	"node_modules",
	".next",
	"dist",
	"build",
	"coverage",
	"target",
]);

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
		dirname(dirname(context.worktree.path)),
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

	for (const entry of readdirSync(metadataRoot, { withFileTypes: true })) {
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

		let entries: ReturnType<typeof readdirSync>;
		try {
			entries = readdirSync(current.path, { withFileTypes: true });
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
		await repairWorktreeRegistration({
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
		repairedPath = await getBranchWorktreePath({
			mainRepoPath: input.context.mainRepoPath,
			branch: input.context.worktree.branch,
		});
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

export function getTrackedWorktreeRepairCommand(mainRepoPath: string): string {
	return `git -C "${mainRepoPath}" worktree repair <new-path>`;
}

export function getTrackedWorktreeRepairMessage(input: {
	branch: string;
	mainRepoPath: string;
}): string {
	return `Worktree branch "${input.branch}" was moved outside Git worktree management. Run ${getTrackedWorktreeRepairCommand(input.mainRepoPath)} with the current path, or use git worktree move next time.`;
}

function getTrackedWorktreeContext(
	worktreeId: string,
): TrackedWorktreeContext | null {
	const worktree = localDb
		.select()
		.from(worktrees)
		.where(eq(worktrees.id, worktreeId))
		.get();

	if (!worktree) {
		return null;
	}

	const project = localDb
		.select()
		.from(projects)
		.where(eq(projects.id, worktree.projectId))
		.get();

	if (!project) {
		return null;
	}

	return {
		mainRepoPath: project.mainRepoPath,
		worktree,
	};
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
}): ResolveTrackedWorktreePathResult {
	if (isMainRepoPath(input.context, input.resolvedPath)) {
		return buildMissingResolutionResult();
	}

	if (input.resolvedPath !== input.context.worktree.path) {
		console.log(
			`[repair-worktree-path] Worktree path changed: "${input.context.worktree.path}" → "${input.resolvedPath}" (branch: ${input.context.worktree.branch})`,
		);
		localDb
			.update(worktrees)
			.set({ path: input.resolvedPath })
			.where(eq(worktrees.id, input.context.worktree.id))
			.run();
	}

	return buildResolvedResult(input.resolvedPath);
}

async function getRegisteredTrackedWorktreePath(
	context: TrackedWorktreeContext,
): Promise<string | null> {
	try {
		return await getBranchWorktreePath({
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
): Promise<ResolveTrackedWorktreePathResult> {
	const registeredPath = await getRegisteredTrackedWorktreePath(context);

	if (!registeredPath) {
		return buildMissingResolutionResult();
	}

	if (existsSync(registeredPath)) {
		return persistResolvedTrackedWorktreePath({
			context,
			resolvedPath: registeredPath,
		});
	}

	const repairedPath = await tryAutoRepairTrackedWorktree({
		context,
	});

	if (!repairedPath) {
		return buildGitRepairRequiredResolution(context, registeredPath);
	}

	return persistResolvedTrackedWorktreePath({
		context,
		resolvedPath: repairedPath,
	});
}

function getResolvedTrackedWorktreePath(
	resolution: ResolveTrackedWorktreePathResult,
): string | null {
	return resolution.status === "resolved" ? resolution.path : null;
}

export async function resolveTrackedWorktreePath(
	worktreeId: string,
): Promise<ResolveTrackedWorktreePathResult> {
	const context = getTrackedWorktreeContext(worktreeId);
	if (!context) {
		return buildMissingResolutionResult();
	}

	if (existsSync(context.worktree.path)) {
		return buildResolvedResult(context.worktree.path);
	}

	return resolveTrackedWorktreePathFromGitState(context);
}

export async function resolveWorktreePathOrThrow(
	worktreeId: string,
): Promise<string | null> {
	const resolution = await resolveTrackedWorktreePath(worktreeId);

	if (resolution.status === "resolved") {
		return resolution.path;
	}

	if (resolution.status === "git_repair_required") {
		throw new TRPCError({
			code: "PRECONDITION_FAILED",
			message: getTrackedWorktreeRepairMessage({
				branch: resolution.branch,
				mainRepoPath: resolution.mainRepoPath,
			}),
			cause: {
				reason: "git_repair_required",
				branch: resolution.branch,
				mainRepoPath: resolution.mainRepoPath,
				registeredPath: resolution.registeredPath,
				storedPath: resolution.storedPath,
				command: getTrackedWorktreeRepairCommand(resolution.mainRepoPath),
			},
		});
	}

	return null;
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
	const resolution = await resolveTrackedWorktreePath(worktreeId);
	return getResolvedTrackedWorktreePath(resolution);
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
	const projectWorktrees = localDb
		.select()
		.from(worktrees)
		.where(eq(worktrees.projectId, projectId))
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
