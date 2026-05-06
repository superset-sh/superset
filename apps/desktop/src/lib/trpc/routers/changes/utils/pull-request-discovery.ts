import { TRPCError } from "@trpc/server";
import type { SimpleGit } from "simple-git";
import { z } from "zod";
import { execGitWithShellPath } from "../../workspaces/utils/git-client";
import { getRepoContext } from "../../workspaces/utils/github";
import { getPullRequestRepoArgs } from "../../workspaces/utils/github/repo-context";
import { execWithShellEnv } from "../../workspaces/utils/shell-env";
import {
	buildPullRequestCompareUrl,
	normalizeGitHubRepoUrl,
	parseUpstreamRef,
} from "./pull-request-url";

async function findOpenPRByHeadCommit(
	worktreePath: string,
): Promise<string | null> {
	try {
		const { stdout: headOutput } = await execGitWithShellPath(
			["rev-parse", "HEAD"],
			{ cwd: worktreePath },
		);
		const headSha = headOutput.trim();
		if (!headSha) {
			return null;
		}

		const repoArgs = getPullRequestRepoArgs(await getRepoContext(worktreePath));

		const { stdout } = await execWithShellEnv(
			"gh",
			[
				"pr",
				"list",
				...repoArgs,
				"--state",
				"open",
				"--search",
				`${headSha} is:pr`,
				"--limit",
				"20",
				"--json",
				"url,headRefOid",
			],
			{ cwd: worktreePath },
		);

		const parsed = JSON.parse(stdout) as Array<{
			url?: string;
			headRefOid?: string;
		}>;
		const match = parsed.find((candidate) => candidate.headRefOid === headSha);
		return match?.url?.trim() || null;
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.warn(
			"[git/findExistingOpenPRUrl] Failed commit-based PR lookup:",
			message,
		);
		return null;
	}
}

export async function findExistingOpenPRUrl(
	worktreePath: string,
): Promise<string | null> {
	// Prefer tracking-based lookup first for fork/branch-name mismatch scenarios.
	try {
		const { stdout } = await execWithShellEnv(
			"gh",
			[
				"pr",
				"view",
				"--json",
				"url,state",
				"--jq",
				'if .state == "OPEN" then .url else "" end',
			],
			{ cwd: worktreePath },
		);
		const url = stdout.trim();
		if (url) {
			return url;
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		const isNoPROpenError = message
			.toLowerCase()
			.includes("no pull requests found");
		if (!isNoPROpenError) {
			console.warn(
				"[git/findExistingOpenPRUrl] Failed tracking-branch PR lookup:",
				message,
			);
		}
		// Fallback to commit-SHA search below.
	}

	return findOpenPRByHeadCommit(worktreePath);
}

const ghRepoMetadataSchema = z.object({
	url: z.string().url(),
	isFork: z.boolean(),
	parent: z
		.object({
			url: z.string().url(),
		})
		.nullable(),
	defaultBranchRef: z.object({
		name: z.string().min(1),
	}),
});

async function getMergeBaseBranch(
	git: SimpleGit,
	branch: string,
): Promise<string | null> {
	try {
		const configuredBaseBranch = await git.raw([
			"config",
			"--get",
			`branch.${branch}.gh-merge-base`,
		]);
		return configuredBaseBranch.trim() || null;
	} catch {
		return null;
	}
}

export async function buildNewPullRequestUrl(
	worktreePath: string,
	git: SimpleGit,
	branch: string,
): Promise<string> {
	const { stdout } = await execWithShellEnv(
		"gh",
		["repo", "view", "--json", "url,isFork,parent,defaultBranchRef"],
		{ cwd: worktreePath },
	);
	const repoMetadata = ghRepoMetadataSchema.parse(JSON.parse(stdout));
	const currentRepoUrl = normalizeGitHubRepoUrl(repoMetadata.url);
	const baseRepoUrl = normalizeGitHubRepoUrl(
		repoMetadata.isFork && repoMetadata.parent?.url
			? repoMetadata.parent.url
			: repoMetadata.url,
	);

	if (!currentRepoUrl || !baseRepoUrl) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "GitHub is not available for this workspace.",
		});
	}

	const configuredBaseBranch = await getMergeBaseBranch(git, branch);
	const baseBranch = configuredBaseBranch ?? repoMetadata.defaultBranchRef.name;
	let headRepoOwner = currentRepoUrl.split("/").at(-2) ?? "";
	let headBranch = branch;

	try {
		const upstreamRef = (
			await git.raw(["rev-parse", "--abbrev-ref", "@{upstream}"])
		).trim();
		const parsedUpstreamRef = parseUpstreamRef(upstreamRef);

		if (parsedUpstreamRef) {
			headBranch = parsedUpstreamRef.branchName;
			const upstreamRemoteUrl = await git.raw([
				"remote",
				"get-url",
				parsedUpstreamRef.remoteName,
			]);
			headRepoOwner =
				normalizeGitHubRepoUrl(upstreamRemoteUrl)?.split("/").at(-2) ??
				headRepoOwner;
		}
	} catch {
		// Fall back to the current repository owner and local branch name.
	}

	return buildPullRequestCompareUrl({
		baseRepoUrl,
		baseBranch,
		headRepoOwner,
		headBranch,
	});
}
