import { TRPCError } from "@trpc/server";
import type { RemoteWithRefs, SimpleGit } from "simple-git";
import { z } from "zod";
import { publicProcedure, router } from "../..";
import {
	execGitWithShellPath,
	getSimpleGitWithShellPath,
} from "../workspaces/utils/git-client";
import {
	clearGitHubStatusCacheForWorktree,
	fetchGitHubPRStatus,
	getPullRequestRepoArgs,
	getRepoContext,
} from "../workspaces/utils/github/github";
import { execWithShellEnv } from "../workspaces/utils/shell-env";
import { resolveTrackingRemoteName } from "../workspaces/utils/upstream-ref";
import { isUpstreamMissingError } from "./git-utils";
import { assertRegisteredWorktree } from "./security/path-validation";
import {
	type GitRemoteInfo,
	isOpenPullRequestState,
	resolveRemoteNameForExistingPRHead,
} from "./utils/existing-pr-push-target";
import {
	buildPullRequestCompareUrl,
	normalizeGitHubRepoUrl,
	parseUpstreamRef,
} from "./utils/pull-request-url";
import { clearStatusCacheForWorktree } from "./utils/status-cache";

export { isUpstreamMissingError };

async function getTrackingRef(
	git: SimpleGit,
): Promise<{ remoteName: string; branchName: string } | null> {
	try {
		const upstream = (
			await git.raw(["rev-parse", "--abbrev-ref", "@{upstream}"])
		).trim();
		return parseUpstreamRef(upstream);
	} catch {
		return null;
	}
}

async function hasUpstreamBranch(git: SimpleGit): Promise<boolean> {
	try {
		await git.raw(["rev-parse", "--abbrev-ref", "@{upstream}"]);
		return true;
	} catch {
		return false;
	}
}

async function getTrackingRemote(git: SimpleGit): Promise<string> {
	const trackingRef = await getTrackingRef(git);
	return trackingRef?.remoteName ?? "origin";
}

async function fetchCurrentBranch(git: SimpleGit): Promise<void> {
	const localBranch = (await git.revparse(["--abbrev-ref", "HEAD"])).trim();
	const trackingRef = await getTrackingRef(git);
	const branch = trackingRef?.branchName ?? localBranch;
	const remote = trackingRef?.remoteName ?? resolveTrackingRemoteName(null);
	try {
		await git.fetch([remote, branch]);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		if (isUpstreamMissingError(message)) {
			try {
				await git.fetch([remote]);
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

function clearWorktreeStatusCaches(worktreePath: string): void {
	clearGitHubStatusCacheForWorktree(worktreePath);
	clearStatusCacheForWorktree(worktreePath);
}

async function pushWithSetUpstream({
	git,
	targetBranch,
	remote,
}: {
	git: SimpleGit;
	targetBranch: string;
	remote?: string;
}): Promise<void> {
	const trimmedBranch = targetBranch.trim();
	if (!trimmedBranch || trimmedBranch === "HEAD") {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message:
				"Cannot push from detached HEAD. Please checkout a branch and try again.",
		});
	}

	const targetRemote = remote ?? (await getTrackingRemote(git));

	// Use HEAD refspec to avoid resolving the branch name as a local ref.
	// This is more reliable for worktrees where upstream tracking isn't set yet.
	await git.push([
		"--set-upstream",
		targetRemote,
		`HEAD:refs/heads/${trimmedBranch}`,
	]);
}

interface ExistingPullRequestPushTarget {
	remote: string;
	targetBranch: string;
}

function toGitRemoteInfo(remote: RemoteWithRefs): GitRemoteInfo {
	return {
		name: remote.name,
		fetchUrl: remote.refs.fetch,
		pushUrl: remote.refs.push,
	};
}

async function resolveExistingPullRequestPushTarget({
	git,
	worktreePath,
	fallbackRemote,
}: {
	git: SimpleGit;
	worktreePath: string;
	fallbackRemote: string;
}): Promise<ExistingPullRequestPushTarget | null> {
	clearGitHubStatusCacheForWorktree(worktreePath);
	const githubStatus = await fetchGitHubPRStatus(worktreePath);
	const pr = githubStatus?.pr;
	if (!pr || !isOpenPullRequestState(pr.state) || !pr.headRefName?.trim()) {
		return null;
	}

	const targetBranch = pr.headRefName.trim();
	const remotes = (await git.getRemotes(true)).map(toGitRemoteInfo);
	const remote = resolveRemoteNameForExistingPRHead({
		remotes,
		pr,
		fallbackRemote,
	});

	if (remote) {
		return { remote, targetBranch };
	}

	if (pr.isCrossRepository) {
		const repoLabel =
			pr.headRepositoryOwner && pr.headRepositoryName
				? `${pr.headRepositoryOwner}/${pr.headRepositoryName}`
				: "the PR head repository";
		throw new TRPCError({
			code: "PRECONDITION_FAILED",
			message: `Found open pull request ${pr.url}, but couldn't find a git remote for ${repoLabel}. Reattach the PR branch or add that remote before pushing.`,
		});
	}

	return null;
}

async function pushWithResolvedUpstream({
	git,
	worktreePath,
	localBranch,
}: {
	git: SimpleGit;
	worktreePath: string;
	localBranch: string;
}): Promise<void> {
	const fallbackRemote = await getTrackingRemote(git);
	const existingPullRequestTarget = await resolveExistingPullRequestPushTarget({
		git,
		worktreePath,
		fallbackRemote,
	});

	if (existingPullRequestTarget) {
		await pushWithSetUpstream({
			git,
			remote: existingPullRequestTarget.remote,
			targetBranch: existingPullRequestTarget.targetBranch,
		});
		return;
	}

	await pushWithSetUpstream({
		git,
		remote: fallbackRemote,
		targetBranch: localBranch,
	});
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
	git: SimpleGit,
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

async function buildNewPullRequestUrl(
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

async function getGitWithShellPath(worktreePath: string) {
	return getSimpleGitWithShellPath(worktreePath);
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
					const localBranch = await git.revparse(["--abbrev-ref", "HEAD"]);
					await pushWithResolvedUpstream({
						git,
						worktreePath: input.worktreePath,
						localBranch,
					});
				} else {
					try {
						await git.push();
					} catch (error) {
						const message =
							error instanceof Error ? error.message : String(error);
						if (shouldRetryPushWithUpstream(message)) {
							const localBranch = await git.revparse(["--abbrev-ref", "HEAD"]);
							await pushWithResolvedUpstream({
								git,
								worktreePath: input.worktreePath,
								localBranch,
							});
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
						const localBranch = await git.revparse(["--abbrev-ref", "HEAD"]);
						await pushWithResolvedUpstream({
							git,
							worktreePath: input.worktreePath,
							localBranch,
						});
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
						await pushWithResolvedUpstream({
							git,
							worktreePath: input.worktreePath,
							localBranch: branch,
						});
					} else {
						try {
							await git.push();
						} catch (error) {
							const message =
								error instanceof Error ? error.message : String(error);
							if (shouldRetryPushWithUpstream(message)) {
								await pushWithResolvedUpstream({
									git,
									worktreePath: input.worktreePath,
									localBranch: branch,
								});
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
						clearWorktreeStatusCaches(input.worktreePath);
						return { success: true, url: existingPRUrl };
					}

					try {
						const url = await buildNewPullRequestUrl(
							input.worktreePath,
							git,
							branch,
						);
						await fetchCurrentBranch(git);
						clearWorktreeStatusCaches(input.worktreePath);

						return { success: true, url };
					} catch (error) {
						// If creation reports branch/tracking mismatch but an open PR exists,
						// recover by opening that existing PR instead of failing.
						const recoveredPRUrl = await findExistingOpenPRUrl(
							input.worktreePath,
						);
						if (recoveredPRUrl) {
							await fetchCurrentBranch(git);
							clearWorktreeStatusCaches(input.worktreePath);
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
						clearWorktreeStatusCaches(input.worktreePath);
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
