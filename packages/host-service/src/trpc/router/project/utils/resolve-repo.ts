import { existsSync, mkdirSync, rmSync, statSync } from "node:fs";
import { join, resolve as resolvePath } from "node:path";
import { parseGitHubRemote } from "@superset/shared/github-remote";
import { TRPCError } from "@trpc/server";
import simpleGit from "simple-git";
import {
	findMatchingRemote,
	getGitHubRemotes,
	type ParsedGitHubRemote,
} from "./git-remote";

export interface ResolvedRepo {
	repoPath: string;
	remoteName: string | null;
	parsed: ParsedGitHubRemote | null;
}

export interface ResolvedGitHubRepo extends ResolvedRepo {
	remoteName: string;
	parsed: ParsedGitHubRemote;
}

function validateDirectoryPath(path: string, label: string): void {
	if (!existsSync(path)) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `${label} does not exist: ${path}`,
		});
	}
	if (!statSync(path).isDirectory()) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `${label} is not a directory: ${path}`,
		});
	}
}

/**
 * Atomic claim: `mkdir` without `recursive` throws EEXIST when the path is
 * present, which avoids the TOCTOU window between an `existsSync` check
 * and the work that follows. If anything fails after this, the caller
 * created the dir and can rmSync it without risk of nuking someone else's.
 */
function claimEmptyTargetDir(targetPath: string): void {
	try {
		mkdirSync(targetPath);
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code === "EEXIST") {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: `Directory already exists: ${targetPath}`,
			});
		}
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `Could not create target directory: ${
				err instanceof Error ? err.message : String(err)
			}`,
		});
	}
}

/**
 * Translates git's "empty ident"/`user.email`/`user.name` errors from a
 * failed initial commit into a `PRECONDITION_FAILED` TRPCError with setup
 * instructions. Falls through to `INTERNAL_SERVER_ERROR` for unknown
 * failures.
 */
function asInitialCommitTrpcError(err: unknown): TRPCError {
	const message = err instanceof Error ? err.message : String(err);
	if (
		message.includes("empty ident") ||
		message.includes("user.email") ||
		message.includes("user.name")
	) {
		return new TRPCError({
			code: "PRECONDITION_FAILED",
			message:
				'Git user is not configured. Run: git config --global user.name "Your Name" && git config --global user.email "you@example.com"',
		});
	}
	return new TRPCError({
		code: "INTERNAL_SERVER_ERROR",
		message: `Failed to create initial commit: ${message}`,
	});
}

/** `git init --initial-branch=main` with a fallback for older git versions. */
async function gitInitMainBranch(targetPath: string): Promise<void> {
	const git = simpleGit(targetPath);
	try {
		await git.init(["--initial-branch=main"]);
	} catch {
		await git.init();
	}
}

async function revParseGitRoot(path: string): Promise<string> {
	try {
		return (await simpleGit(path).revparse(["--show-toplevel"])).trim();
	} catch {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `Not a git repository: ${path}`,
		});
	}
}

/**
 * Validates that a path is a git working tree and returns the canonical git
 * root plus its "primary" GitHub remote — `origin` if present, otherwise
 * the first GitHub remote found. Throws if the path isn't a git repo or has
 * no GitHub remotes.
 *
 * Used when the caller doesn't have an authoritative clone URL to match
 * against (e.g. `findByPath`, `create mode=importLocal`).
 */
export async function resolveWithPrimaryRemote(
	repoPath: string,
): Promise<ResolvedGitHubRepo> {
	validateDirectoryPath(repoPath, "Path");
	const gitRoot = await revParseGitRoot(repoPath);
	const remotes = await getGitHubRemotes(simpleGit(gitRoot));
	if (remotes.size === 0) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Repository has no GitHub remotes",
		});
	}
	const originParsed = remotes.get("origin");
	if (originParsed) {
		return { repoPath: gitRoot, remoteName: "origin", parsed: originParsed };
	}
	const first = remotes.entries().next().value;
	if (!first) {
		throw new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message: "Remote iteration produced no entries",
		});
	}
	const [firstName, firstParsed] = first;
	return { repoPath: gitRoot, remoteName: firstName, parsed: firstParsed };
}

/**
 * Validates that a path is a git working tree and returns the canonical git
 * root plus its primary GitHub remote when one exists. Local-only repos are
 * valid v2 projects; they simply have no cloud clone URL or GitHub metadata.
 */
export async function resolveLocalRepo(
	repoPath: string,
): Promise<ResolvedRepo> {
	validateDirectoryPath(repoPath, "Path");
	const gitRoot = await revParseGitRoot(repoPath);
	const remotes = await getGitHubRemotes(simpleGit(gitRoot));
	const originParsed = remotes.get("origin");
	if (originParsed) {
		return { repoPath: gitRoot, remoteName: "origin", parsed: originParsed };
	}
	const first = remotes.entries().next().value;
	if (!first) return { repoPath: gitRoot, remoteName: null, parsed: null };
	const [firstName, firstParsed] = first;
	return { repoPath: gitRoot, remoteName: firstName, parsed: firstParsed };
}

/**
 * Validates that a path is a git working tree and returns the canonical git
 * root plus the GitHub remote whose `owner/name` matches `expectedSlug`.
 * Throws if no matching remote exists.
 *
 * Used when the caller has an authoritative clone URL from the cloud and
 * wants to confirm this local repo is actually that project (`setup
 * mode=import`, post-clone validation).
 */
export async function resolveMatchingSlug(
	repoPath: string,
	expectedSlug: string,
): Promise<ResolvedGitHubRepo> {
	validateDirectoryPath(repoPath, "Path");
	const gitRoot = await revParseGitRoot(repoPath);
	const remotes = await getGitHubRemotes(simpleGit(gitRoot));
	const remoteName = findMatchingRemote(remotes, expectedSlug);
	if (!remoteName) {
		const found = [...remotes.entries()]
			.map(([name, parsed]) => `${name}: ${parsed.owner}/${parsed.name}`)
			.join(", ");
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `No remote matches ${expectedSlug}. Found: ${found || "no remotes"}`,
		});
	}
	const parsed = remotes.get(remoteName);
	if (!parsed) {
		throw new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message: `Remote "${remoteName}" matched but has no parsed data`,
		});
	}
	return { repoPath: gitRoot, remoteName, parsed };
}

/**
 * Empty git repo at `<parentDir>/<dirName>`: atomic mkdir (fails on EEXIST,
 * so we never blow away someone else's directory), `git init`, initial
 * empty commit. Cleans up the dir on any post-mkdir failure.
 *
 * Catches "empty ident"/`user.email`/`user.name` from git and re-throws as
 * `PRECONDITION_FAILED` with setup instructions — git's raw message is
 * actionable to a developer but useless to a user.
 */
export async function initEmptyRepo(
	parentDir: string,
	dirName: string,
): Promise<ResolvedRepo> {
	if (!dirName.trim() || /[/\\]/.test(dirName)) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `Invalid directory name: "${dirName}"`,
		});
	}

	const resolvedParentDir = resolvePath(parentDir);
	validateDirectoryPath(resolvedParentDir, "Parent directory");
	const targetPath = join(resolvedParentDir, dirName);
	claimEmptyTargetDir(targetPath);

	try {
		await gitInitMainBranch(targetPath);
		try {
			await simpleGit(targetPath).raw([
				"commit",
				"--allow-empty",
				"-m",
				"Initial commit",
			]);
		} catch (err) {
			throw asInitialCommitTrpcError(err);
		}
		return { repoPath: targetPath, remoteName: null, parsed: null };
	} catch (err) {
		rmSync(targetPath, { recursive: true, force: true });
		throw err;
	}
}

/**
 * Shallow-clone a template into `<parentDir>/<dirName>`, drop its `.git`,
 * re-init, and commit the snapshot as the user's first commit. The result
 * has no remote — the caller is responsible for any first-push provisioning.
 * Cleans up the dir on any post-mkdir failure.
 */
export async function cloneTemplateInto(
	templateUrl: string,
	parentDir: string,
	dirName: string,
): Promise<ResolvedRepo> {
	if (!dirName.trim() || /[/\\]/.test(dirName)) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `Invalid directory name: "${dirName}"`,
		});
	}

	const resolvedParentDir = resolvePath(parentDir);
	validateDirectoryPath(resolvedParentDir, "Parent directory");
	const targetPath = join(resolvedParentDir, dirName);
	claimEmptyTargetDir(targetPath);

	try {
		// --depth=1 since we're throwing away the template's history anyway.
		await simpleGit().clone(templateUrl, targetPath, ["--depth=1"]);
		rmSync(join(targetPath, ".git"), { recursive: true, force: true });

		await gitInitMainBranch(targetPath);
		const git = simpleGit(targetPath);
		await git.add(".");
		try {
			await git.raw(["commit", "-m", "Initial commit"]);
		} catch (err) {
			throw asInitialCommitTrpcError(err);
		}
		return { repoPath: targetPath, remoteName: null, parsed: null };
	} catch (err) {
		rmSync(targetPath, { recursive: true, force: true });
		throw err;
	}
}

/**
 * Clones a GitHub repo into `<parentDir>/<repoName>` and returns the resolved
 * repo. Fails and cleans up the target directory if the clone succeeds but
 * the resulting remote doesn't match the URL we cloned from (defensive).
 */
export async function cloneRepoInto(
	repoCloneUrl: string,
	parentDir: string,
): Promise<ResolvedGitHubRepo> {
	const parsedUrl = parseGitHubRemote(repoCloneUrl);
	if (!parsedUrl) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `Could not parse GitHub remote from ${repoCloneUrl}`,
		});
	}
	const expectedSlug = `${parsedUrl.owner}/${parsedUrl.name}`;

	const resolvedParentDir = resolvePath(parentDir);
	validateDirectoryPath(resolvedParentDir, "Parent directory");

	const targetPath = join(resolvedParentDir, parsedUrl.name);

	// Atomic claim: mkdirSync without `recursive` throws EEXIST when the
	// path is already present, which avoids the TOCTOU window between an
	// existsSync check and the clone call. If clone fails afterwards we
	// know we created the dir and can rmSync it without risk of deleting
	// someone else's directory.
	try {
		mkdirSync(targetPath);
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code === "EEXIST") {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: `Directory already exists: ${targetPath}`,
			});
		}
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `Could not create target directory: ${
				err instanceof Error ? err.message : String(err)
			}`,
		});
	}

	try {
		await simpleGit().clone(repoCloneUrl, targetPath);
	} catch (err) {
		rmSync(targetPath, { recursive: true, force: true });
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `Failed to clone repository: ${
				err instanceof Error ? err.message : String(err)
			}`,
		});
	}

	try {
		return await resolveMatchingSlug(targetPath, expectedSlug);
	} catch (err) {
		rmSync(targetPath, { recursive: true, force: true });
		throw err;
	}
}
