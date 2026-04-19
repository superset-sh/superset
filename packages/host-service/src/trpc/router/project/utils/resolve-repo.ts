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
): Promise<ResolvedRepo> {
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
): Promise<ResolvedRepo> {
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
 * Clones a GitHub repo into `<parentDir>/<repoName>` and returns the resolved
 * repo. Fails and cleans up the target directory if the clone succeeds but
 * the resulting remote doesn't match the URL we cloned from (defensive).
 */
export async function cloneRepoInto(
	repoCloneUrl: string,
	parentDir: string,
): Promise<ResolvedRepo> {
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
