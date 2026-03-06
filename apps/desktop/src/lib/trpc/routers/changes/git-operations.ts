import { TRPCError } from "@trpc/server";
import simpleGit from "simple-git";
import { z } from "zod";
import { publicProcedure, router } from "../..";
import {
	execWithShellEnv,
	getProcessEnvWithShellPath,
} from "../workspaces/utils/shell-env";
import { isUpstreamMissingError } from "./git-utils";
import { assertRegisteredWorktree } from "./security";
import {
	buildPullRequestCompareUrl,
	normalizeGitHubRepoUrl,
	parseUpstreamRef,
} from "./utils/pull-request-url";
import { clearStatusCacheForWorktree } from "./utils/status-cache";

export { isUpstreamMissingError };

async function hasUpstreamBranch(
	git: ReturnType<typeof simpleGit>,
): Promise<boolean> {
	try {
		await git.raw(["rev-parse", "--abbrev-ref", "@{upstream}"]);
		return true;
	} catch {
		return false;
	}
}

async function fetchCurrentBranch(
	git: ReturnType<typeof simpleGit>,
): Promise<void> {
	const branch = (await git.revparse(["--abbrev-ref", "HEAD"])).trim();
	try {
		await git.fetch(["origin", branch]);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		if (isUpstreamMissingError(message)) {
			try {
				await git.fetch(["origin"]);
			} catch (fallbackError) {
				const fallbackMessage =
					fallbackError instanceof Error
						? fallbackError.message
						: String(fallbackError);
				if (!isUpstreamMissingError(fallbackMessage)) {
					console.error(
						`[git/fetch] failed fallback fetch for branch ${branch}:`,
						fallbackError,
					);
					throw fallbackError;
				}
			}
			return;
		}
		throw error;
	}
}

async function pushWithSetUpstream({
	git,
	branch,
}: {
	git: ReturnType<typeof simpleGit>;
	branch: string;
}): Promise<void> {
	const trimmedBranch = branch.trim();
	if (!trimmedBranch || trimmedBranch === "HEAD") {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message:
				"Cannot push from detached HEAD. Please checkout a branch and try again.",
		});
	}

	// Use HEAD refspec to avoid resolving the branch name as a local ref.
	// This is more reliable for worktrees where upstream tracking isn't set yet.
	await git.push([
		"--set-upstream",
		"origin",
		`HEAD:refs/heads/${trimmedBranch}`,
	]);
}

function shouldRetryPushWithUpstream(message: string): boolean {
	const lowerMessage = message.toLowerCase();
	return (
		lowerMessage.includes("no upstream branch") ||
		lowerMessage.includes("no tracking information") ||
		lowerMessage.includes(
			"upstream branch of your current branch does not match",
		) ||
		lowerMessage.includes("cannot be resolved to branch") ||
		lowerMessage.includes("couldn't find remote ref")
	);
}

function isNonFastForwardPushError(message: string): boolean {
	const lowerMessage = message.toLowerCase();
	return (
		lowerMessage.includes("non-fast-forward") ||
		(lowerMessage.includes("failed to push some refs") &&
			(lowerMessage.includes("rejected") ||
				lowerMessage.includes("fetch first") ||
				lowerMessage.includes("tip of your current branch is behind") ||
				lowerMessage.includes("remote contains work")))
	);
}

interface TrackingStatus {
	pushCount: number;
	pullCount: number;
	hasUpstream: boolean;
}

async function getTrackingBranchStatus(
	git: ReturnType<typeof simpleGit>,
): Promise<TrackingStatus> {
	try {
		const upstream = await git.raw([
			"rev-parse",
			"--abbrev-ref",
			"@{upstream}",
		]);
		if (!upstream.trim()) {
			return { pushCount: 0, pullCount: 0, hasUpstream: false };
		}

		const tracking = await git.raw([
			"rev-list",
			"--left-right",
			"--count",
			"@{upstream}...HEAD",
		]);
		const [pullStr, pushStr] = tracking.trim().split(/\s+/);
		return {
			pushCount: Number.parseInt(pushStr || "0", 10),
			pullCount: Number.parseInt(pullStr || "0", 10),
			hasUpstream: true,
		};
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		if (isUpstreamMissingError(message)) {
			return { pushCount: 0, pullCount: 0, hasUpstream: false };
		}
		console.warn(
			"[git/tracking] Failed to resolve upstream tracking status:",
			message,
		);
		return { pushCount: 0, pullCount: 0, hasUpstream: false };
	}
}

async function findExistingOpenPRUrl(
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

	const byHeadCommit = await findOpenPRByHeadCommit(worktreePath);
	if (byHeadCommit) {
		return byHeadCommit;
	}

	return null;
}

async function findOpenPRByHeadCommit(
	worktreePath: string,
): Promise<string | null> {
	try {
		const { stdout: headOutput } = await execWithShellEnv(
			"git",
			["rev-parse", "HEAD"],
			{ cwd: worktreePath },
		);
		const headSha = headOutput.trim();
		if (!headSha) {
			return null;
		}

		const { stdout } = await execWithShellEnv(
			"gh",
			[
				"pr",
				"list",
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
	git: ReturnType<typeof simpleGit>,
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

async function buildNewPullRequestUrl(
	worktreePath: string,
	git: ReturnType<typeof simpleGit>,
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

async function getGitWithShellPath(worktreePath: string) {
	const git = simpleGit(worktreePath);
	git.env(await getProcessEnvWithShellPath());
	return git;
}

export const createGitOperationsRouter = () => {
	return router({
		// NOTE: saveFile is defined in file-contents.ts with hardened path validation
		// Do NOT add saveFile here - it would overwrite the secure version

		commit: publicProcedure
			.input(
				z.object({
					worktreePath: z.string(),
					message: z.string(),
				}),
			)
			.mutation(
				async ({ input }): Promise<{ success: boolean; hash: string }> => {
					assertRegisteredWorktree(input.worktreePath);

					const git = await getGitWithShellPath(input.worktreePath);
					const result = await git.commit(input.message);
					clearStatusCacheForWorktree(input.worktreePath);
					return { success: true, hash: result.commit };
				},
			),

		push: publicProcedure
			.input(
				z.object({
					worktreePath: z.string(),
					setUpstream: z.boolean().optional(),
				}),
			)
			.mutation(async ({ input }): Promise<{ success: boolean }> => {
				assertRegisteredWorktree(input.worktreePath);

				const git = await getGitWithShellPath(input.worktreePath);
				const hasUpstream = await hasUpstreamBranch(git);

				if (input.setUpstream && !hasUpstream) {
					const branch = await git.revparse(["--abbrev-ref", "HEAD"]);
					await pushWithSetUpstream({ git, branch });
				} else {
					try {
						await git.push();
					} catch (error) {
						const message =
							error instanceof Error ? error.message : String(error);
						if (shouldRetryPushWithUpstream(message)) {
							const branch = await git.revparse(["--abbrev-ref", "HEAD"]);
							await pushWithSetUpstream({ git, branch });
						} else {
							throw error;
						}
					}
				}
				await fetchCurrentBranch(git);
				clearStatusCacheForWorktree(input.worktreePath);
				return { success: true };
			}),

		pull: publicProcedure
			.input(
				z.object({
					worktreePath: z.string(),
				}),
			)
			.mutation(async ({ input }): Promise<{ success: boolean }> => {
				assertRegisteredWorktree(input.worktreePath);

				const git = await getGitWithShellPath(input.worktreePath);
				try {
					await git.pull(["--rebase"]);
				} catch (error) {
					const message =
						error instanceof Error ? error.message : String(error);
					if (isUpstreamMissingError(message)) {
						throw new Error(
							"No upstream branch to pull from. The remote branch may have been deleted.",
						);
					}
					throw error;
				}
				clearStatusCacheForWorktree(input.worktreePath);
				return { success: true };
			}),

		sync: publicProcedure
			.input(
				z.object({
					worktreePath: z.string(),
				}),
			)
			.mutation(async ({ input }): Promise<{ success: boolean }> => {
				assertRegisteredWorktree(input.worktreePath);

				const git = await getGitWithShellPath(input.worktreePath);
				try {
					await git.pull(["--rebase"]);
				} catch (error) {
					const message =
						error instanceof Error ? error.message : String(error);
					if (isUpstreamMissingError(message)) {
						const branch = await git.revparse(["--abbrev-ref", "HEAD"]);
						await pushWithSetUpstream({ git, branch });
						await fetchCurrentBranch(git);
						clearStatusCacheForWorktree(input.worktreePath);
						return { success: true };
					}
					throw error;
				}
				await git.push();
				await fetchCurrentBranch(git);
				clearStatusCacheForWorktree(input.worktreePath);
				return { success: true };
			}),

		fetch: publicProcedure
			.input(z.object({ worktreePath: z.string() }))
			.mutation(async ({ input }): Promise<{ success: boolean }> => {
				assertRegisteredWorktree(input.worktreePath);
				const git = await getGitWithShellPath(input.worktreePath);
				await fetchCurrentBranch(git);
				clearStatusCacheForWorktree(input.worktreePath);
				return { success: true };
			}),

		createPR: publicProcedure
			.input(
				z.object({
					worktreePath: z.string(),
					allowOutOfDate: z.boolean().optional().default(false),
				}),
			)
			.mutation(
				async ({ input }): Promise<{ success: boolean; url: string }> => {
					assertRegisteredWorktree(input.worktreePath);

					const git = await getGitWithShellPath(input.worktreePath);
					const branch = (await git.revparse(["--abbrev-ref", "HEAD"])).trim();
					const trackingStatus = await getTrackingBranchStatus(git);
					const hasUpstream = trackingStatus.hasUpstream;
					const isBehindUpstream =
						trackingStatus.hasUpstream && trackingStatus.pullCount > 0;
					const hasUnpushedCommits =
						trackingStatus.hasUpstream && trackingStatus.pushCount > 0;

					if (isBehindUpstream && !input.allowOutOfDate) {
						const commitLabel =
							trackingStatus.pullCount === 1 ? "commit" : "commits";
						throw new TRPCError({
							code: "PRECONDITION_FAILED",
							message: `Branch is behind upstream by ${trackingStatus.pullCount} ${commitLabel}. Pull/rebase first, or continue anyway.`,
						});
					}

					// Ensure remote branch exists and local commits are available on remote before PR create.
					if (!hasUpstream) {
						await pushWithSetUpstream({ git, branch });
					} else {
						try {
							await git.push();
						} catch (error) {
							const message =
								error instanceof Error ? error.message : String(error);
							if (shouldRetryPushWithUpstream(message)) {
								await pushWithSetUpstream({ git, branch });
							} else if (
								input.allowOutOfDate &&
								isBehindUpstream &&
								hasUnpushedCommits &&
								isNonFastForwardPushError(message)
							) {
								throw new TRPCError({
									code: "PRECONDITION_FAILED",
									message:
										"Branch has local commits but is behind upstream. Pull/rebase first so local commits can be pushed before creating a PR.",
								});
							} else {
								throw error;
							}
						}
					}

					const existingPRUrl = await findExistingOpenPRUrl(input.worktreePath);
					if (existingPRUrl) {
						await fetchCurrentBranch(git);
						clearStatusCacheForWorktree(input.worktreePath);
						return { success: true, url: existingPRUrl };
					}

					try {
						const url = await buildNewPullRequestUrl(
							input.worktreePath,
							git,
							branch,
						);
						await fetchCurrentBranch(git);
						clearStatusCacheForWorktree(input.worktreePath);

						return { success: true, url };
					} catch (error) {
						// If creation reports branch/tracking mismatch but an open PR exists,
						// recover by opening that existing PR instead of failing.
						const recoveredPRUrl = await findExistingOpenPRUrl(
							input.worktreePath,
						);
						if (recoveredPRUrl) {
							await fetchCurrentBranch(git);
							clearStatusCacheForWorktree(input.worktreePath);
							return { success: true, url: recoveredPRUrl };
						}
						throw error;
					}
				},
			),

		mergePR: publicProcedure
			.input(
				z.object({
					worktreePath: z.string(),
					strategy: z.enum(["merge", "squash", "rebase"]).default("squash"),
				}),
			)
			.mutation(
				async ({ input }): Promise<{ success: boolean; mergedAt?: string }> => {
					assertRegisteredWorktree(input.worktreePath);

					const args = ["pr", "merge", `--${input.strategy}`];

					try {
						await execWithShellEnv("gh", args, { cwd: input.worktreePath });
						clearStatusCacheForWorktree(input.worktreePath);
						return { success: true, mergedAt: new Date().toISOString() };
					} catch (error) {
						const message =
							error instanceof Error ? error.message : String(error);
						console.error("[git/mergePR] Failed to merge PR:", message);

						if (message.includes("no pull requests found")) {
							throw new TRPCError({
								code: "NOT_FOUND",
								message: "No pull request found for this branch",
							});
						}
						if (
							message.includes("not mergeable") ||
							message.includes("blocked")
						) {
							throw new TRPCError({
								code: "BAD_REQUEST",
								message:
									"PR cannot be merged. Check for merge conflicts or required status checks.",
							});
						}
						throw new TRPCError({
							code: "INTERNAL_SERVER_ERROR",
							message: `Failed to merge PR: ${message}`,
						});
					}
				},
			),
	});
};
