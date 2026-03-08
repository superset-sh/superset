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

function buildMissingResolutionResult(): ResolveTrackedWorktreePathResult {
	return { status: "missing" };
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
	mainRepoPath: string,
	storedPath: string,
): string[] {
	const roots = [
		dirname(storedPath),
		dirname(dirname(storedPath)),
		dirname(mainRepoPath),
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
	mainRepoPath: string;
	branch: string;
	storedPath: string;
}): {
	metadataDir: string;
	registeredPath: string;
} | null {
	const metadataRoot = join(input.mainRepoPath, ".git", "worktrees");
	if (!isExistingDirectory(metadataRoot)) {
		return null;
	}

	const expectedStoredPath = safeResolvePath(input.storedPath);

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
				head === `ref: refs/heads/${input.branch}` ||
				safeResolvePath(registeredPath) === expectedStoredPath
			) {
				return { metadataDir, registeredPath };
			}
		} catch {}
	}

	return null;
}

function findMovedTrackedWorktreeCandidate(input: {
	mainRepoPath: string;
	storedPath: string;
	metadataDir: string;
}): string | null {
	const expectedMetadataDir = safeRealpath(input.metadataDir);
	const mainRepoRealPath = safeRealpath(input.mainRepoPath);
	const searchRoots = getTrackedWorktreeSearchRoots(
		input.mainRepoPath,
		input.storedPath,
	);
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
	mainRepoPath: string;
	storedPath: string;
	branch: string;
}): Promise<string | null> {
	const metadata = findTrackedWorktreeMetadata(input);
	if (!metadata) {
		return null;
	}

	const candidatePath = findMovedTrackedWorktreeCandidate({
		mainRepoPath: input.mainRepoPath,
		storedPath: input.storedPath,
		metadataDir: metadata.metadataDir,
	});

	if (!candidatePath) {
		return null;
	}

	console.log(
		`[repair-worktree-path] Found manually moved worktree for branch ${input.branch} at "${candidatePath}", repairing Git registration`,
	);
	await repairWorktreeRegistration({
		mainRepoPath: input.mainRepoPath,
		worktreePath: candidatePath,
	});

	const repairedPath = await getBranchWorktreePath({
		mainRepoPath: input.mainRepoPath,
		branch: input.branch,
	});

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

function isMainRepoPath(candidatePath: string, mainRepoPath: string): boolean {
	return safeRealpath(candidatePath) === safeRealpath(mainRepoPath);
}

function persistResolvedTrackedWorktreePath(input: {
	worktreeId: string;
	worktree: Pick<SelectWorktree, "path" | "branch">;
	resolvedPath: string;
}): ResolveTrackedWorktreePathResult {
	if (input.resolvedPath !== input.worktree.path) {
		console.log(
			`[repair-worktree-path] Worktree path changed: "${input.worktree.path}" → "${input.resolvedPath}" (branch: ${input.worktree.branch})`,
		);
		localDb
			.update(worktrees)
			.set({ path: input.resolvedPath })
			.where(eq(worktrees.id, input.worktreeId))
			.run();
	}

	return {
		status: "resolved",
		path: input.resolvedPath,
	};
}

export async function resolveTrackedWorktreePath(
	worktreeId: string,
): Promise<ResolveTrackedWorktreePathResult> {
	const worktree = localDb
		.select()
		.from(worktrees)
		.where(eq(worktrees.id, worktreeId))
		.get();

	if (!worktree) return buildMissingResolutionResult();

	if (existsSync(worktree.path)) {
		return {
			status: "resolved",
			path: worktree.path,
		};
	}

	const project = localDb
		.select()
		.from(projects)
		.where(eq(projects.id, worktree.projectId))
		.get();

	if (!project) return buildMissingResolutionResult();

	try {
		const actualPath = await getBranchWorktreePath({
			mainRepoPath: project.mainRepoPath,
			branch: worktree.branch,
		});

		if (!actualPath) {
			return buildMissingResolutionResult();
		}

		if (!existsSync(actualPath)) {
			const repairedPath = await tryAutoRepairTrackedWorktree({
				mainRepoPath: project.mainRepoPath,
				storedPath: worktree.path,
				branch: worktree.branch,
			});

			if (!repairedPath) {
				return {
					status: "git_repair_required",
					branch: worktree.branch,
					mainRepoPath: project.mainRepoPath,
					registeredPath: actualPath,
					storedPath: worktree.path,
				};
			}

			if (isMainRepoPath(repairedPath, project.mainRepoPath)) {
				return buildMissingResolutionResult();
			}

			return persistResolvedTrackedWorktreePath({
				worktreeId,
				worktree,
				resolvedPath: repairedPath,
			});
		}

		// Reject if the candidate resolves to the main repo path.
		// `git worktree list` includes the main worktree; if the branch
		// happens to be checked out there, we must not rebind this
		// worktree row to the main repo.
		// Use realpathSync to canonicalize symlinks (e.g. /var → /private/var on macOS).
		if (isMainRepoPath(actualPath, project.mainRepoPath)) {
			return buildMissingResolutionResult();
		}

		return persistResolvedTrackedWorktreePath({
			worktreeId,
			worktree,
			resolvedPath: actualPath,
		});
	} catch (error) {
		console.warn(
			`[repair-worktree-path] Failed to repair path for worktree ${worktreeId}:`,
			error instanceof Error ? error.message : error,
		);
		return buildMissingResolutionResult();
	}
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
 * Attempts to repair a worktree's stored path when it no longer exists on disk.
 *
 * When a worktree directory is moved (e.g., via `git worktree move` or manual
 * unnesting), the path stored in the local database becomes stale. This function
 * queries `git worktree list` from the main repo to find the worktree's current
 * path by matching on branch name, then updates the database if a valid new path
 * is found.
 *
 * @returns The repaired path if successful, null otherwise
 */
export async function tryRepairWorktreePath(
	worktreeId: string,
): Promise<string | null> {
	const resolution = await resolveTrackedWorktreePath(worktreeId);
	return resolution.status === "resolved" ? resolution.path : null;
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
	return resolution.status === "resolved" ? resolution.path : null;
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
