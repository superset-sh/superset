import { spawn } from "node:child_process";
import { existsSync, mkdirSync, rmSync, statSync } from "node:fs";
import { join, resolve as resolvePath } from "node:path";
import { parseGitHubRemote } from "@superset/shared/github-remote";
import { TRPCError } from "@trpc/server";
import { treeKillWithEscalation } from "../../../../ports/tree-kill";
import { createUserSimpleGit } from "../../../../runtime/git/simple-git";
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

export interface CloneRepoProgress {
	stage: string;
	percent: number | null;
	message: string;
}

export interface CloneRepoOptions {
	onProgress?: (progress: CloneRepoProgress) => void;
	signal?: AbortSignal;
}

const ANSI_ESCAPE_PATTERN = new RegExp(
	`${String.fromCharCode(27)}\\[[0-9;]*m`,
	"g",
);

export class CloneCanceledError extends Error {
	constructor(message = "Clone stopped") {
		super(message);
		this.name = "CloneCanceledError";
	}
}

export function isCloneCanceledError(err: unknown): err is CloneCanceledError {
	return (
		err instanceof CloneCanceledError ||
		(err instanceof Error && err.name === "CloneCanceledError")
	);
}

export function validateDirectoryPath(path: string, label: string): void {
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

function ensureDirectoryPath(path: string, label: string): void {
	if (!existsSync(path)) {
		try {
			mkdirSync(path, { recursive: true });
		} catch (err) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: `Could not create ${label}: ${
					err instanceof Error ? err.message : String(err)
				}`,
			});
		}
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

export function parseGitCloneProgressLine(
	line: string,
): CloneRepoProgress | null {
	const normalized = line
		.replace(ANSI_ESCAPE_PATTERN, "")
		.replace(/^remote:\s*/, "")
		.trim();
	if (!normalized) return null;

	const percentMatch = normalized.match(/^([^:]+):\s+(\d{1,3})%/);
	const percentStage = percentMatch?.[1];
	const percentValue = percentMatch?.[2];
	if (percentStage && percentValue) {
		const stage = percentStage.trim();
		const percent = Math.min(100, Math.max(0, Number(percentValue)));
		return {
			stage,
			percent,
			message: `${stage}: ${percent}%`,
		};
	}

	const stageMatch = normalized.match(/^([^:]+):\s+(.+)$/);
	const stageName = stageMatch?.[1];
	const stageDetail = stageMatch?.[2];
	if (!stageName || !stageDetail) return null;

	const stage = stageName.trim();
	return {
		stage,
		percent: null,
		message: `${stage}: ${stageDetail.trim()}`,
	};
}

function pushStderrTail(current: string, next: string): string {
	const combined = `${current}${next}`;
	return combined.length > 4000
		? combined.slice(combined.length - 4000)
		: combined;
}

async function cloneWithProgress(
	repoCloneUrl: string,
	targetPath: string,
	options: CloneRepoOptions = {},
): Promise<void> {
	if (options.signal?.aborted) {
		throw new CloneCanceledError();
	}

	await new Promise<void>((resolve, reject) => {
		const child = spawn(
			"git",
			["clone", "--progress", repoCloneUrl, targetPath],
			{
				stdio: ["ignore", "ignore", "pipe"],
			},
		);

		let stderrTail = "";
		let lineBuffer = "";
		let spawnError: Error | null = null;
		let cancelRequested = false;
		let settled = false;

		const cleanupAbortListener = () => {
			options.signal?.removeEventListener("abort", handleAbort);
		};

		const settleResolve = () => {
			if (settled) return;
			settled = true;
			cleanupAbortListener();
			resolve();
		};

		const settleReject = (error: Error) => {
			if (settled) return;
			settled = true;
			cleanupAbortListener();
			reject(error);
		};

		function handleAbort() {
			if (cancelRequested || settled) return;
			cancelRequested = true;
			const pid = child.pid;
			if (!pid) {
				child.kill("SIGTERM");
				return;
			}
			void treeKillWithEscalation({ pid }).then((result) => {
				if (result.success || settled) return;
				settleReject(
					new Error(result.error ?? `Failed to stop git clone process ${pid}`),
				);
			});
		}

		const emitProgressLines = (text: string) => {
			const parts = `${lineBuffer}${text}`.split(/\r|\n/);
			lineBuffer = parts.pop() ?? "";
			for (const part of parts) {
				const progress = parseGitCloneProgressLine(part);
				if (progress) options.onProgress?.(progress);
			}
		};

		child.stderr.on("data", (chunk: Buffer) => {
			const text = chunk.toString("utf8");
			stderrTail = pushStderrTail(stderrTail, text);
			emitProgressLines(text);
		});

		child.on("error", (error) => {
			spawnError = error;
		});

		child.on("close", (code, signal) => {
			if (lineBuffer) {
				const progress = parseGitCloneProgressLine(lineBuffer);
				if (progress) options.onProgress?.(progress);
				lineBuffer = "";
			}
			if (spawnError) {
				settleReject(spawnError);
				return;
			}
			if (cancelRequested) {
				settleReject(new CloneCanceledError());
				return;
			}
			if (code === 0) {
				settleResolve();
				return;
			}
			const suffix = stderrTail.trim() ? `: ${stderrTail.trim()}` : "";
			settleReject(
				new Error(
					`git clone exited with ${signal ? `signal ${signal}` : `code ${code}`}${suffix}`,
				),
			);
		});

		options.signal?.addEventListener("abort", handleAbort, { once: true });
		if (options.signal?.aborted) handleAbort();
	});
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
	const git = createUserSimpleGit(targetPath);
	try {
		await git.init(["--initial-branch=main"]);
	} catch {
		await git.init();
	}
}

/**
 * Returns the canonical git root for `path`, or `null` when `path` is not
 * inside a git work tree. Non-throwing variant of `revParseGitRoot` — callers
 * that want to branch on "is this a git repo?" use this instead of catching.
 */
export async function tryRevParseGitRoot(path: string): Promise<string | null> {
	try {
		return (
			await createUserSimpleGit(path).revparse(["--show-toplevel"])
		).trim();
	} catch {
		return null;
	}
}

async function revParseGitRoot(path: string): Promise<string> {
	const root = await tryRevParseGitRoot(path);
	if (root === null) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `Not a git repository: ${path}`,
		});
	}
	return root;
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
	const remotes = await getGitHubRemotes(createUserSimpleGit(gitRoot));
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
 * Initialize git in an EXISTING, populated folder (in place) and resolve it as
 * a local-only project. Unlike `initEmptyRepo`, this neither mkdirs nor fails on
 * a non-empty directory — it adopts the user's folder. Use for "import a folder
 * that isn't a git repo yet"; the caller must have confirmed intent with the
 * user first, since `git init` writes into their directory.
 *
 * Idempotent: if the path is already inside a git work tree (e.g. it was
 * initialized between detection and this call, or it's nested under a parent
 * repo) we skip init and just resolve the existing root.
 *
 * Like `initEmptyRepo`, creates an `--allow-empty` initial commit so
 * `ensureMainWorkspaceStrict` has a real branch/HEAD to point at; a bare
 * `git init` leaves an unborn branch.
 */
export async function initLocalRepoInPlace(
	repoPath: string,
): Promise<ResolvedRepo> {
	validateDirectoryPath(repoPath, "Path");

	const existingRoot = await tryRevParseGitRoot(repoPath);
	if (existingRoot) return resolveLocalRepo(existingRoot);

	await gitInitMainBranch(repoPath);
	try {
		await createUserSimpleGit(repoPath).raw([
			"commit",
			"--allow-empty",
			"-m",
			"Initial commit",
		]);
	} catch (err) {
		throw asInitialCommitTrpcError(err);
	}
	return resolveLocalRepo(repoPath);
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
	const remotes = await getGitHubRemotes(createUserSimpleGit(gitRoot));
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
	ensureDirectoryPath(resolvedParentDir, "Parent directory");
	const targetPath = join(resolvedParentDir, dirName);
	claimEmptyTargetDir(targetPath);

	try {
		await gitInitMainBranch(targetPath);
		try {
			await createUserSimpleGit(targetPath).raw([
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
	ensureDirectoryPath(resolvedParentDir, "Parent directory");
	const targetPath = join(resolvedParentDir, dirName);
	claimEmptyTargetDir(targetPath);

	try {
		// --depth=1 since we're throwing away the template's history anyway.
		await createUserSimpleGit().clone(templateUrl, targetPath, ["--depth=1"]);
		rmSync(join(targetPath, ".git"), { recursive: true, force: true });

		await gitInitMainBranch(targetPath);
		const git = createUserSimpleGit(targetPath);
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

function safeDirectoryName(value: string): string {
	return value
		.trim()
		.replace(/\.git$/i, "")
		.replace(/[^a-zA-Z0-9._-]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

export function deriveCloneDirectoryName(repoCloneUrl: string): string {
	const parsedUrl = parseGitHubRemote(repoCloneUrl);
	if (parsedUrl) {
		const owner = safeDirectoryName(parsedUrl.owner);
		const name = safeDirectoryName(parsedUrl.name);
		if (owner && name) return `${owner}-${name}`;
	}

	const normalized = repoCloneUrl
		.trim()
		.replace(/[?#].*$/, "")
		.replace(/[\\/]+$/g, "")
		.replace(/\.git$/i, "");
	const segments = normalized.split(/[/:\\]/).filter(Boolean);
	const lastSegment = segments[segments.length - 1] ?? "";
	if (!lastSegment || lastSegment === "." || lastSegment === "..") {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `Could not derive repository name from ${repoCloneUrl}`,
		});
	}
	return lastSegment;
}

/**
 * Clones a repo into `<parentDir>/<repoName>` and returns the resolved repo.
 * GitHub URLs are post-clone verified against the original slug; non-GitHub
 * URLs and local paths are accepted and resolved as local-only projects
 * unless the cloned repo happens to have a parseable GitHub remote.
 */
export async function cloneRepoInto(
	repoCloneUrl: string,
	parentDir: string,
	options: CloneRepoOptions = {},
): Promise<ResolvedRepo> {
	const parsedUrl = parseGitHubRemote(repoCloneUrl);
	const expectedSlug = parsedUrl
		? `${parsedUrl.owner}/${parsedUrl.name}`
		: null;
	const repoName = deriveCloneDirectoryName(repoCloneUrl);

	const resolvedParentDir = resolvePath(parentDir);
	ensureDirectoryPath(resolvedParentDir, "Parent directory");

	const targetPath = join(resolvedParentDir, repoName);
	claimEmptyTargetDir(targetPath);

	try {
		await cloneWithProgress(repoCloneUrl, targetPath, options);
	} catch (err) {
		rmSync(targetPath, { recursive: true, force: true });
		if (isCloneCanceledError(err)) {
			throw err;
		}
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `Failed to clone repository: ${
				err instanceof Error ? err.message : String(err)
			}`,
		});
	}

	try {
		if (expectedSlug) {
			return await resolveMatchingSlug(targetPath, expectedSlug);
		}
		return await resolveLocalRepo(targetPath);
	} catch (err) {
		rmSync(targetPath, { recursive: true, force: true });
		throw err;
	}
}
