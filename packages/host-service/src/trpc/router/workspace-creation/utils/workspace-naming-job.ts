import { deriveWorkspaceTitleFromPrompt } from "@superset/shared/workspace-launch";
import { getLocalProject } from "../../../../projects/local-project-store";
import { createGitEnvResolver } from "../../../../runtime/git/git";
import type { HostServiceContext } from "../../../../types";
import { getHostWorkerPool } from "../../../../workers/host-worker-pool";
import {
	gitAutomaticBranchRenamableTask,
	gitRenameBranchTask,
} from "../../../../workers/tasks/git";
import {
	getLocalWorkspace,
	updateLocalWorkspace,
} from "../../../../workspaces/local-workspace-store";
import {
	getWorkspaceNamingState,
	type WorkspaceNamingState,
} from "../../../../workspaces/workspace-naming-state";
import {
	commitWorkspaceTitleJob,
	hasWorkspaceTitleJob,
	queueWorkspaceTitleJob,
} from "../../../../workspaces/workspace-title-jobs";
import { gitStatusStore } from "../../git/utils/git-status-store";
import { resolveGithubRepo } from "../shared/project-helpers";
import {
	canNameWithAgent,
	type GeneratedWorkspaceNames,
	generateWorkspaceNamesFromPrompt,
	resolveGeneratedBranchName,
	trimTitle,
} from "./ai-workspace-names";
import { listBranchNames } from "./list-branch-names";
import { findGitHubReferences, resolveNamingLinks } from "./naming-links";
import { deduplicateBranchName } from "./sanitize-branch";

const MAX_NAMING_ATTEMPTS = 3;
const GIT_TASK_TIMEOUT_MS = 10_000;

export interface NamingDecision {
	/** Title to apply now; null keeps the current one. */
	title: string | null;
	/** Generated branch name to rename the automatic branch to; null keeps it. */
	branchName: string | null;
	/** Keep the row eligible for another attempt. */
	pending: boolean;
	/** Names never came and no attempt will follow. */
	gaveUp: boolean;
}

/** The naming policy, free of I/O so its cases read as a table. */
export function decideNaming(input: {
	names: GeneratedWorkspaceNames | null;
	/** null: the branch probe failed, so nothing is known about the branch. */
	canRenameBranch: boolean | null;
	/** 1-based number of the attempt being decided. */
	attempt: number;
	prompt: string;
	hasAgent: boolean;
	hasAgentReply: boolean;
}): NamingDecision {
	const { names, canRenameBranch, attempt, hasAgent, hasAgentReply } = input;
	const moreAttempts = hasAgent && attempt < MAX_NAMING_ATTEMPTS;
	if (!names?.title || canRenameBranch === null) {
		return {
			title:
				attempt === 1
					? trimTitle(deriveWorkspaceTitleFromPrompt(input.prompt)) || null
					: null,
			branchName: null,
			pending: moreAttempts,
			gaveUp: !moreAttempts,
		};
	}
	// A vague prompt gets its guessed title now and a refinement with the
	// agent's first reply on the next turn; the branch waits for that pass.
	const refine = names.vague === true && !hasAgentReply && moreAttempts;
	return {
		title: names.title,
		branchName:
			canRenameBranch && !refine && names.branchName ? names.branchName : null,
		pending: refine,
		gaveUp: false,
	};
}

/** The project's live GitHub remote, for resolving bare `#123`; null when it has none. */
async function projectGithubRepo(
	ctx: HostServiceContext,
	projectId: string | undefined,
): Promise<{ owner: string; name: string } | null> {
	if (!projectId) return null;
	return resolveGithubRepo(ctx, projectId).then(
		(repo) => ({ owner: repo.owner, name: repo.name }),
		() => null,
	);
}

/** The live row and its naming state, while naming is still owed. */
function pendingNaming(ctx: HostServiceContext, workspaceId: string) {
	const row = getLocalWorkspace(ctx.db, workspaceId);
	const naming = getWorkspaceNamingState(ctx.db, workspaceId);
	return row && row.archivedAt == null && naming ? { row, naming } : null;
}

/**
 * Off-loop git for the naming job: credential env resolves on the loop (it
 * needs the provider), the git subprocesses run in the host worker pool.
 * A mutable object so tests can patch single operations.
 */
export const namingGitOps = {
	async canRenameAutomaticBranch(
		ctx: HostServiceContext,
		worktreePath: string,
		branch: string,
	): Promise<boolean> {
		const gitEnv = await createGitEnvResolver(ctx.credentials)(worktreePath);
		const { renamable } = await getHostWorkerPool().run(
			gitAutomaticBranchRenamableTask,
			{ worktreePath, branch, gitEnv },
			{ timeoutMs: GIT_TASK_TIMEOUT_MS },
		);
		return renamable;
	},

	async renameBranch(
		ctx: HostServiceContext,
		worktreePath: string,
		from: string,
		to: string,
	): Promise<void> {
		const gitEnv = await createGitEnvResolver(ctx.credentials)(worktreePath);
		await getHostWorkerPool().run(
			gitRenameBranchTask,
			{ worktreePath, from, to, gitEnv },
			{ timeoutMs: GIT_TASK_TIMEOUT_MS },
		);
	},
};

/**
 * Runs one naming attempt for a workspace that still owes one (see
 * `workspace-naming-state`). Creation queues the first attempt and agent
 * events queue the rest (`continueWorkspaceNaming`). Every write re-checks
 * the state, so a user rename in the meantime always wins.
 */
export function scheduleWorkspaceNaming(
	ctx: HostServiceContext,
	workspaceId: string,
	{ agentReply }: { agentReply?: string } = {},
): void {
	queueWorkspaceTitleJob(ctx.db, workspaceId, async (isCurrent, signal) => {
		const pending = pendingNaming(ctx, workspaceId);
		if (!pending) return;
		const { row, naming } = pending;
		const prompt = naming.prompt;
		// An agent with no headless mode names nothing; its workspace keeps
		// the prompt title without retries or a failure notice.
		const agent =
			naming.agent && canNameWithAgent(ctx.db, naming.agent)
				? naming.agent
				: undefined;
		const project = row.projectId
			? getLocalProject(ctx.db, row.projectId)
			: undefined;
		const links = agent
			? await resolveNamingLinks(
					ctx,
					findGitHubReferences(
						prompt,
						await projectGithubRepo(ctx, project?.id),
					),
				)
			: undefined;
		if (!isCurrent()) return;
		const names = await generateWorkspaceNamesFromPrompt(
			prompt,
			agent ? { db: ctx.db, agent } : undefined,
			project?.namingInstructions,
			signal,
			false,
			{ agentReply, links },
		);
		if (!isCurrent()) return;
		const current = pendingNaming(ctx, workspaceId);
		if (!current) return;

		const oldBranch = current.naming.branch;
		const branchStillAutomatic =
			!!project && !!oldBranch && current.row.branch === oldBranch;
		// A failed probe (git lock, hung index) says nothing about the branch,
		// so the attempt counts as failed and the next turn tries again.
		const canRenameBranch =
			branchStillAutomatic && names?.branchName
				? await namingGitOps
						.canRenameAutomaticBranch(ctx, current.row.worktreePath, oldBranch)
						.catch((error) => {
							console.warn("[workspace-title] branch probe failed", error);
							return null;
						})
				: false;
		if (!isCurrent() || !pendingNaming(ctx, workspaceId)) return;

		const attempt = current.naming.attempts + 1;
		const decision = decideNaming({
			names,
			canRenameBranch,
			attempt,
			prompt,
			hasAgent: !!agent,
			hasAgentReply: !!agentReply,
		});
		const state: WorkspaceNamingState | null = decision.pending
			? { prompt, attempts: attempt, branch: oldBranch, agent: agent ?? null }
			: null;
		if (decision.gaveUp && agent) {
			ctx.eventBus.broadcastWorkspaceNamingFailed({
				workspaceId,
				name: decision.title ?? current.row.name,
				occurredAt: Date.now(),
			});
		}
		if (decision.branchName && decision.title && project && oldBranch) {
			try {
				await renameAutomaticBranch(ctx, {
					workspaceId,
					worktreePath: current.row.worktreePath,
					repoPath: project.repoPath,
					oldBranch,
					branchName: decision.branchName,
					title: decision.title,
					state,
					isCurrent,
				});
				return;
			} catch (error) {
				console.warn("[workspace-title] branch rename failed", error);
			}
		}
		if (!isCurrent() || !pendingNaming(ctx, workspaceId)) return;
		updateLocalWorkspace(ctx, workspaceId, {
			...(decision.title ? { name: decision.title } : {}),
			autoNaming: state,
		});
	});
}

async function renameAutomaticBranch(
	ctx: HostServiceContext,
	input: {
		workspaceId: string;
		worktreePath: string;
		repoPath: string;
		oldBranch: string;
		branchName: string;
		title: string;
		state: WorkspaceNamingState | null;
		isCurrent: () => boolean;
	},
): Promise<void> {
	const { workspaceId, oldBranch, isCurrent } = input;
	const slash = oldBranch.lastIndexOf("/");
	const { prefixedCandidate } = resolveGeneratedBranchName({
		candidate: `${input.branchName}-${workspaceId.slice(0, 8)}`,
		branchPrefix: slash > 0 ? oldBranch.slice(0, slash) : undefined,
		oldBranchName: oldBranch,
	});
	const branches = await listBranchNames(ctx, input.repoPath);
	if (!isCurrent()) return;
	const target = deduplicateBranchName(
		prefixedCandidate,
		branches.filter((branch) => branch !== oldBranch),
	);
	await commitWorkspaceTitleJob(ctx.db, workspaceId, async () => {
		if (!isCurrent() || !pendingNaming(ctx, workspaceId)) return;
		await namingGitOps.renameBranch(ctx, input.worktreePath, oldBranch, target);
		gitStatusStore.recordChange(workspaceId, undefined);
		updateLocalWorkspace(ctx, workspaceId, {
			name: input.title,
			branch: target,
			autoNaming: input.state,
		});
	});
}

/**
 * Agent-event follow-ups to the attempt creation queued: a Start runs a
 * first attempt that never ran (the queue was full), and each Stop retries
 * a failed or vague attempt with the agent's reply. A Stop during a running
 * attempt queues behind it, so a quick first turn's reply still counts.
 */
export function continueWorkspaceNaming(
	ctx: HostServiceContext,
	workspaceId: string,
	event: { eventType: string; agentReply?: string },
): void {
	const pending = pendingNaming(ctx, workspaceId);
	if (!pending) return;
	if (event.eventType === "Start") {
		if (
			pending.naming.attempts > 0 ||
			hasWorkspaceTitleJob(ctx.db, workspaceId)
		)
			return;
	} else if (event.eventType !== "Stop") return;
	scheduleWorkspaceNaming(ctx, workspaceId, { agentReply: event.agentReply });
}
