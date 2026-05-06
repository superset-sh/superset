import { TRPCError } from "@trpc/server";
import type { RemoteWithRefs, SimpleGit } from "simple-git";
import { getCurrentBranch } from "../../workspaces/utils/git";
import { fetchGitHubPRStatus } from "../../workspaces/utils/github";
import { resolveTrackingRemoteName } from "../../workspaces/utils/upstream-ref";
import { isUpstreamMissingError } from "../git-utils";
import {
	type ExistingPullRequestPushTargetInfo,
	type GitRemoteInfo,
	isOpenPullRequestState,
	resolveRemoteNameForExistingPRHead,
	shouldRetargetPushToExistingPRHead,
} from "./existing-pr-push-target";
import { parseUpstreamRef } from "./pull-request-url";
import { clearWorktreeStatusCaches } from "./worktree-status-caches";

export interface TrackingStatus {
	pushCount: number;
	pullCount: number;
	hasUpstream: boolean;
}

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

export async function hasUpstreamBranch(git: SimpleGit): Promise<boolean> {
	try {
		await git.raw(["rev-parse", "--abbrev-ref", "@{upstream}"]);
		return true;
	} catch (error) {
		// Expected for branches without a tracking upstream; log unexpected errors.
		const msg = error instanceof Error ? error.message : String(error);
		if (
			!msg.includes("no upstream configured") &&
			!msg.includes("@{upstream}")
		) {
			console.warn("[git] Unexpected error checking upstream branch:", msg);
		}
		return false;
	}
}

async function getTrackingRemote(git: SimpleGit): Promise<string> {
	const trackingRef = await getTrackingRef(git);
	return trackingRef?.remoteName ?? "origin";
}

export async function fetchCurrentBranch(
	git: SimpleGit,
	worktreePath: string,
): Promise<void> {
	const localBranch = await getCurrentBranch(worktreePath);
	const trackingRef = await getTrackingRef(git);
	const branch = trackingRef?.branchName ?? localBranch;
	if (!branch) {
		return;
	}
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
}): Promise<ExistingPullRequestPushTargetInfo | null> {
	clearWorktreeStatusCaches(worktreePath);
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

async function resolveMismatchedPullRequestPushTarget({
	git,
	worktreePath,
}: {
	git: SimpleGit;
	worktreePath: string;
}): Promise<ExistingPullRequestPushTargetInfo | null> {
	const fallbackRemote = await getTrackingRemote(git);
	const [trackingRef, existingPullRequestTarget] = await Promise.all([
		getTrackingRef(git),
		resolveExistingPullRequestPushTarget({
			git,
			worktreePath,
			fallbackRemote,
		}),
	]);

	if (!existingPullRequestTarget) {
		return null;
	}

	return shouldRetargetPushToExistingPRHead({
		trackingRef,
		target: existingPullRequestTarget,
	})
		? existingPullRequestTarget
		: null;
}

export async function pushWithResolvedUpstream({
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

export async function pushCurrentBranch({
	git,
	worktreePath,
	localBranch,
}: {
	git: SimpleGit;
	worktreePath: string;
	localBranch: string;
}): Promise<void> {
	const mismatchedPullRequestTarget =
		await resolveMismatchedPullRequestPushTarget({
			git,
			worktreePath,
		});

	if (mismatchedPullRequestTarget) {
		await pushWithSetUpstream({
			git,
			remote: mismatchedPullRequestTarget.remote,
			targetBranch: mismatchedPullRequestTarget.targetBranch,
		});
		return;
	}

	try {
		await git.push();
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		if (shouldRetryPushWithUpstream(message)) {
			await pushWithResolvedUpstream({
				git,
				worktreePath,
				localBranch,
			});
			return;
		}

		throw error;
	}
}

export function isNonFastForwardPushError(message: string): boolean {
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

export async function getTrackingBranchStatus(
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
