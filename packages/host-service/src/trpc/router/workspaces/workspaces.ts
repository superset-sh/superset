import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import {
	generateFriendlyBranchName,
	sanitizeUserBranchName,
} from "@superset/shared/workspace-launch";
import { workspaceTagsInputSchema } from "@superset/shared/workspace-tags";
import { TRPCError } from "@trpc/server";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { projects, workspaces } from "../../../db/schema";
import { createGitEnvResolver } from "../../../runtime/git";
import { type ResolvedRef, resolveRef } from "../../../runtime/git/refs";
import type { HostServiceContext } from "../../../types";
import { getHostWorkerPool } from "../../../workers/host-worker-pool";
import { gitFetchBaseRefTask } from "../../../workers/tasks/git";
import {
	type CloudShapedWorkspace,
	getLocalWorkspace,
	insertLocalWorkspace,
	toCloudShape,
} from "../../../workspaces/local-workspace-store";
import {
	createCallerFactory,
	machineOnlyProcedure,
	protectedProcedure,
	router,
} from "../../index";
import {
	buildTerminalAgentLaunch,
	validateAgentLaunchOptions,
} from "../agents";
import { ensureMainWorkspace } from "../project/utils/ensure-main-workspace";
import { getHostWorktreeBaseDir } from "../settings/worktree-location";
import { createSession } from "../workspace-creation/procedures/create-session";
import { adoptExistingWorktree } from "../workspace-creation/shared/adopt-existing-worktree";
import {
	findWorktreeAtPath,
	getWorktreeBranchAtPath,
	listWorktreeBranches,
} from "../workspace-creation/shared/branch-search";
import { startCommandTerminal } from "../workspace-creation/shared/command-terminal";
import {
	type AgentLaunchResult,
	agentLaunchSchema,
	dispatchSugarAgents,
} from "../workspace-creation/shared/dispatch-agents";
import { enablePushAutoSetupRemote } from "../workspace-creation/shared/git-config";
import {
	requireLocalProject,
	requireProjectRepoPath,
} from "../workspace-creation/shared/local-project";
import { startSetupTerminalIfPresent } from "../workspace-creation/shared/setup-terminal";
import {
	addWorktreeWithSparseCheckout,
	parseSparseCheckoutPaths,
} from "../workspace-creation/shared/sparse-checkout";
import type { GitClient } from "../workspace-creation/shared/types";
import { safeResolveWorktreePath } from "../workspace-creation/shared/worktree-paths";
import { generateBranchNameFromPrompt } from "../workspace-creation/utils/ai-branch-name";
import {
	applyAiWorkspaceRename,
	applyGeneratedWorkspaceNames,
	type GeneratedWorkspaceNames,
	generateWorkspaceNamesFromPrompt,
	sanitizeBranchCandidate,
} from "../workspace-creation/utils/ai-workspace-names";
import { resolveProjectBranchPrefix } from "../workspace-creation/utils/branch-prefix";
import type { ExecGh } from "../workspace-creation/utils/exec-gh";
import { listBranchNames } from "../workspace-creation/utils/list-branch-names";
import {
	deleteMaterializedPrBranchIfSafe,
	type MaterializePrBranchResult,
	materializePrBranch,
	normalizePrBranchTracking,
	PrBranchConflictError,
} from "../workspace-creation/utils/pr-branch-materialize";
import { derivePrLocalBranchName } from "../workspace-creation/utils/pr-branch-name";
import {
	type BaseRefFetcher,
	resolveNewBranchStartPoint,
} from "../workspace-creation/utils/resolve-new-branch-start-point";
import { deduplicateBranchName } from "../workspace-creation/utils/sanitize-branch";

const createInputSchema = z
	.object({
		projectId: z.string(),
		// Both `name` and `branch` are optional. A typed `name` also seeds
		// the branch when `branch` is omitted. When both are omitted with a
		// non-empty agent prompt, creation proceeds with a friendly-random
		// branch and an LLM rename is applied before terminals/agents
		// start. With no prompt, the friendly-random fallback is final.
		name: z.string().min(1).optional(),
		branch: z.string().min(1).optional(),
		// Use the typed branch verbatim instead of namespacing it under the
		// project branch prefix; a name collision reuses the existing branch
		// (and its workspace), as with any typed branch. Set when the branch
		// comes from an external provider (Linear's branchName), whose exact
		// format the provider autolinks.
		skipBranchPrefix: z.boolean().optional(),
		pr: z.number().int().positive().optional(),
		baseBranch: z.string().min(1).optional(),
		taskId: z.string().uuid().optional(),
		agents: z.array(agentLaunchSchema).optional(),
		// Desktop "Wait for workspace setup before starting agents" setting,
		// sent per-request. When true and setup commands resolve, a single
		// terminal sugar agent is chained behind them in the setup terminal
		// (`setup && agent`) instead of launching in parallel.
		waitForSetupBeforeAgents: z.boolean().optional(),
		command: z.string().min(1).optional(),
		namingPrompt: z.string().min(1).optional(),
		id: z.string().uuid().optional(),
		// Adopt the worktree git already has at this path instead of
		// inferring the path from `branch`. When present, `branch` is
		// caller context only; the server reads the current branch from git.
		worktreePath: z.string().min(1).optional(),
		// When false, skip the setup terminal. Used by worktree import,
		// where the worktree is usually already set up.
		runSetup: z.boolean().optional(),
		tags: workspaceTagsInputSchema.optional(),
	})
	.refine((value) => !(value.branch && value.pr), {
		message: "`branch` and `pr` cannot both be set",
	})
	.refine((value) => !(value.worktreePath && value.pr), {
		message: "`worktreePath` and `pr` cannot both be set",
	});

const workspaceCreateLocks = new Map<string, Promise<void>>();

async function acquireWorkspaceCreateLock(key: string): Promise<() => void> {
	const previous = workspaceCreateLocks.get(key) ?? Promise.resolve();
	let releaseCurrent!: () => void;
	const current = new Promise<void>((resolve) => {
		releaseCurrent = resolve;
	});
	const entry = previous.catch(() => {}).then(() => current);
	workspaceCreateLocks.set(key, entry);
	await previous.catch(() => {});

	let released = false;
	return () => {
		if (released) return;
		released = true;
		releaseCurrent();
		if (workspaceCreateLocks.get(key) === entry) {
			workspaceCreateLocks.delete(key);
		}
	};
}

// Workspaces have no cloud mirror since local-first (#5731); the host's own
// cloud-compatible row shape is the response type.
type CloudWorkspace = CloudShapedWorkspace;

function extractCreateTxid(row: CloudWorkspace): number | null {
	const txid = (row as { txid?: unknown }).txid;
	return typeof txid === "number" ? txid : null;
}

/**
 * Idempotency lookup — the local table is authoritative, so an existing
 * (project, branch) row answers without a cloud round-trip.
 */
function findExistingWorkspaceByBranch(
	ctx: HostServiceContext,
	projectId: string,
	branch: string,
): CloudWorkspace | null {
	const local = ctx.db.query.workspaces
		.findFirst({
			where: and(
				eq(workspaces.projectId, projectId),
				eq(workspaces.branch, branch),
				// Deletes tombstone the row instead of removing it, so a
				// tombstone must not satisfy idempotency: matching one returns
				// the archived row with `alreadyExists: true` and silently
				// skips the create — no worktree, nothing in the sidebar. Its
				// worktree is gone, so re-creating on the same branch inserts a
				// fresh live row alongside it. The adopt path already filters
				// these (#6383).
				isNull(workspaces.archivedAt),
			),
		})
		.sync();
	return local ? toCloudShape(local, ctx.organizationId) : null;
}

interface PrMetadata {
	number: number;
	url: string;
	title: string;
	headRefName: string;
	headRefOid: string;
	baseRefName: string;
	headRepositoryOwner: string;
	headRepositoryName: string;
	isCrossRepository: boolean;
	state: "open" | "closed" | "merged";
}

async function fetchPrMetadata(args: {
	cwd: string;
	prNumber: number;
	execGh: ExecGh;
}): Promise<PrMetadata> {
	const result = await args.execGh(
		[
			"pr",
			"view",
			String(args.prNumber),
			"--json",
			"number,url,title,headRefName,headRefOid,baseRefName,headRepositoryOwner,headRepository,isCrossRepository,state",
		],
		{ cwd: args.cwd, timeout: 30_000 },
	);
	const parsed = result as {
		number: number;
		url: string;
		title: string;
		headRefName: string;
		headRefOid: string;
		baseRefName: string;
		headRepositoryOwner: { login: string } | null;
		headRepository: { name: string } | null;
		isCrossRepository: boolean;
		state: string;
	};
	const stateLower = parsed.state.toLowerCase();
	const state: PrMetadata["state"] =
		stateLower === "open"
			? "open"
			: stateLower === "merged"
				? "merged"
				: "closed";
	return {
		number: parsed.number,
		url: parsed.url,
		title: parsed.title,
		headRefName: parsed.headRefName,
		headRefOid: parsed.headRefOid,
		baseRefName: parsed.baseRefName,
		headRepositoryOwner: parsed.headRepositoryOwner?.login ?? "",
		headRepositoryName: parsed.headRepository?.name ?? "",
		isCrossRepository: parsed.isCrossRepository,
		state,
	};
}

async function getLocalBranchHead(
	git: GitClient,
	branchName: string,
): Promise<string | null> {
	try {
		const out = await git.raw([
			"rev-parse",
			"--verify",
			`refs/heads/${branchName}^{commit}`,
		]);
		const trimmed = out.trim();
		return /^[0-9a-f]{40,}/.test(trimmed) ? trimmed : null;
	} catch {
		return null;
	}
}

export interface BranchSourcePlan {
	branch: string;
	startPoint: ResolvedRef;
	usedExistingBranch: boolean;
}

/** Base-ref fetch for workspace creation, executed in the worker pool so the
 * network fetch's spawn + stdout drain stay off the host-service event loop.
 * Concurrent creates on the same base coalesce into one fetch. */
function createWorkerBaseRefFetcher(
	ctx: Pick<HostServiceContext, "credentials">,
	repoPath: string,
): BaseRefFetcher {
	return async (target) => {
		const gitEnv = await createGitEnvResolver(ctx.credentials)(repoPath);
		return getHostWorkerPool().run(
			gitFetchBaseRefTask,
			{ worktreePath: repoPath, target, gitEnv },
			{
				timeoutMs: 30_000,
				strategy: "coalesce",
				dedupeKey: `${repoPath}:base-ref:${target.remote}/${target.branch}`,
			},
		);
	};
}

async function planBranchSource(
	git: GitClient,
	branch: string,
	baseBranch: string | undefined,
	fetchRemoteRef?: BaseRefFetcher,
): Promise<BranchSourcePlan> {
	const resolved = await resolveRef(git, branch);

	if (
		resolved &&
		(resolved.kind === "local" || resolved.kind === "remote-tracking")
	) {
		// `shortName`, not the input: resolveRef may have adopted an existing
		// branch's canonical casing, and `-b <input-casing>` would mint a
		// case-twin sharing the same loose-ref file on case-insensitive disks.
		return {
			branch: resolved.shortName,
			startPoint: resolved,
			usedExistingBranch: true,
		};
	}

	if (resolved && resolved.kind === "tag") {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `"${branch}" is a tag, not a branch — cannot check out into a workspace`,
		});
	}

	const startPoint = await resolveNewBranchStartPoint(
		git,
		baseBranch,
		fetchRemoteRef,
	);
	return { branch, startPoint, usedExistingBranch: false };
}

// Adopt any worktree git knows about, no matter where it lives —
// tools other than Superset can also `git worktree add`, and their
// worktrees are valid adoption targets.
function isBranchInUseByWorktreeError(err: unknown): boolean {
	const message = err instanceof Error ? err.message : String(err ?? "");
	const lower = message.toLowerCase();
	return (
		lower.includes("is already used by worktree") ||
		lower.includes("already checked out")
	);
}

export async function addBranchWorktree(args: {
	git: GitClient;
	plan: BranchSourcePlan;
	worktreePath: string;
	sparsePaths: string[];
}): Promise<void> {
	const { git, plan, worktreePath, sparsePaths } = args;

	// Post-checkout hooks run after the checkout itself, so a hook that exits
	// non-zero fails the operation with the worktree fully in place. Every
	// branch case below checks out `plan.branch`, so registered-at-path with
	// that branch is the ground truth. Handed to addWorktreeWithSparseCheckout
	// so it applies to whichever command actually performs the checkout —
	// the plain add below, or the sparse path's explicit `checkout` step.
	const hookTolerance = {
		context: `Worktree created at ${worktreePath}`,
		didSucceed: async () => {
			if (!(await findWorktreeAtPath(git, worktreePath, plan.branch))) {
				return false;
			}
			try {
				// The worktree list can report a branch for a half-created
				// worktree; require a resolvable HEAD in the worktree itself.
				await git.raw(["-C", worktreePath, "rev-parse", "--verify", "HEAD"]);
				return true;
			} catch {
				return false;
			}
		},
	};

	if (plan.usedExistingBranch) {
		// Existing branch — check it out into a fresh worktree. Remote-tracking
		// refs need explicit --track + -b so the worktree gets a real local
		// branch, not detached HEAD.
		await addWorktreeWithSparseCheckout({
			git,
			worktreeArgs:
				plan.startPoint.kind === "remote-tracking"
					? [
							"--track",
							"-b",
							plan.branch,
							worktreePath,
							plan.startPoint.remoteShortName,
						]
					: [
							worktreePath,
							plan.startPoint.kind === "head"
								? "HEAD"
								: plan.startPoint.shortName,
						],
			worktreePath,
			sparsePaths,
			logPrefix: "[workspaces.create]",
			hookTolerance,
		});
		return;
	}

	// New branch from start point. --no-track keeps `git pull` and
	// ahead/behind counts pointing at the branch's own upstream once
	// push.autoSetupRemote sets it on first push.
	const startPointArg =
		plan.startPoint.kind === "head"
			? "HEAD"
			: plan.startPoint.kind === "remote-tracking"
				? plan.startPoint.remoteShortName
				: plan.startPoint.shortName;
	await addWorktreeWithSparseCheckout({
		git,
		worktreeArgs: [
			"--no-track",
			"-b",
			plan.branch,
			worktreePath,
			startPointArg,
		],
		worktreePath,
		sparsePaths,
		logPrefix: "[workspaces.create]",
		hookTolerance,
	});
}

async function recordBaseBranchConfig(args: {
	git: GitClient;
	worktreePath: string;
	branch: string;
	baseBranch: string;
}): Promise<void> {
	await args.git
		.raw([
			"-C",
			args.worktreePath,
			"config",
			`branch.${args.branch}.base`,
			args.baseBranch,
		])
		.catch((err) => {
			console.warn(
				`[workspaces.create] failed to record base branch ${args.baseBranch}:`,
				err,
			);
		});
}

/**
 * Best-effort cloud lookup of the linked task's provider branch name
 * (Linear's branchName, synced into tasks.branch). Bounded so an offline
 * host never stalls workspace creation.
 */
async function fetchLinkedTaskBranch(
	ctx: HostServiceContext,
	taskId: string,
): Promise<string | undefined> {
	try {
		const task = await Promise.race([
			ctx.api.task.byId.query(taskId),
			new Promise<null>((resolve) => setTimeout(() => resolve(null), 2_000)),
		]);
		const branch = task?.branch?.trim();
		return branch ? sanitizeUserBranchName(branch) || undefined : undefined;
	} catch (err) {
		console.warn("[workspaces.create] linked task branch lookup failed:", err);
		return undefined;
	}
}

/**
 * Fully local registration: the host mints the id and commits the local
 * row — the authoritative and only record; workspaces have no cloud mirror.
 */
async function registerLocalWorkspace(args: {
	ctx: HostServiceContext;
	id: string | undefined;
	projectId: string;
	name: string;
	branch: string;
	worktreePath: string;
	taskId: string | undefined;
	tags: string[] | undefined;
	rollbackWorktree: () => Promise<void>;
}): Promise<CloudWorkspace> {
	const { ctx } = args;

	let localRow: ReturnType<typeof insertLocalWorkspace>;
	try {
		localRow = insertLocalWorkspace(ctx, {
			id: args.id,
			projectId: args.projectId,
			worktreePath: args.worktreePath,
			branch: args.branch,
			name: args.name,
			taskId: args.taskId ?? null,
			createdByUserId: ctx.userId ?? null,
			tags: args.tags,
		});
	} catch (err) {
		await args.rollbackWorktree();
		throw new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message: `Failed to persist workspace locally: ${err instanceof Error ? err.message : String(err)}`,
		});
	}

	void ctx.api.v2Workspace.trackCreated
		.mutate({
			workspaceId: localRow.id,
			organizationId: ctx.organizationId,
			projectId: args.projectId,
			branch: args.branch,
			type: "worktree",
			hostId: ctx.clientMachineId,
		})
		.catch((err) => {
			console.warn(
				`[workspaces.create] failed to report workspace creation for ${localRow.id}:`,
				err,
			);
		});

	return toCloudShape(localRow, ctx.organizationId);
}

export const workspacesRouter = router({
	createSession,
	create: machineOnlyProcedure
		.input(createInputSchema)
		.mutation(async ({ ctx, input }) => {
			for (const launch of input.agents ?? []) {
				validateAgentLaunchOptions(ctx.db, launch);
			}

			const localProject = requireLocalProject(ctx, input.projectId);
			const repoPath = requireProjectRepoPath(localProject);

			// Kick off AI naming when the user supplied a prompt but no
			// workspace name. The worktree add and registration run with an
			// immediately-available branch while the LLM call proceeds in
			// parallel; the AI title (and branch, when auto-generated) is
			// applied as a rename before terminals/agents start. A typed
			// name suppresses naming entirely — it titles the workspace and
			// seeds the branch. The PR and worktree-adopt paths skip too:
			// their names are already meaningful.
			const composerPrompt =
				input.agents?.[0]?.prompt?.trim() || input.namingPrompt?.trim() || "";
			const wantAi =
				input.pr === undefined &&
				input.worktreePath === undefined &&
				input.name === undefined &&
				!!composerPrompt;
			const namingAgent = input.agents?.[0]?.agent;
			const aiNamesPromise: Promise<GeneratedWorkspaceNames | null> | null =
				wantAi
					? generateWorkspaceNamesFromPrompt(
							composerPrompt,
							namingAgent ? { db: ctx.db, agent: namingAgent } : undefined,
							localProject.namingInstructions,
						).catch((err) => {
							console.warn("[workspaces.create] AI naming failed", err);
							return null;
						})
					: null;
			aiNamesPromise?.catch(() => {});

			// True only when this call freshly created an auto-generated
			// branch — the one case where the deferred AI rename may also
			// rename the git branch.
			let aiCanRenameBranch = false;

			await ensureMainWorkspace(ctx, input.projectId, repoPath);

			const git = await ctx.git(repoPath);
			const fetchBaseRefOffLoop = createWorkerBaseRefFetcher(ctx, repoPath);
			const worktreeBaseDir =
				localProject.worktreeBaseDir ?? getHostWorktreeBaseDir(ctx);
			// Empty means a full checkout. Only applies to worktrees we create —
			// adopted ones keep whatever checkout they already have.
			const sparsePaths = parseSparseCheckoutPaths(
				localProject.sparseCheckoutPaths,
			);

			// Free branches still claimed by registrations whose dirs are
			// gone — without this, `git worktree add` later fails with
			// "branch is already used by worktree at <missing-path>".
			await git
				.raw(["worktree", "prune"])
				.catch((err) =>
					console.warn("[workspaces.create] worktree prune failed:", err),
				);

			let resolvedBranch: string;
			let worktreePath: string | undefined;
			let alreadyExists = false;
			let workspaceRow: CloudWorkspace;

			if (input.pr !== undefined) {
				const releaseCreateLock = await acquireWorkspaceCreateLock(
					`pr:${input.projectId}:${input.pr}`,
				);
				try {
					const prMetadata = await fetchPrMetadata({
						cwd: repoPath,
						prNumber: input.pr,
						execGh: ctx.execGh,
					});
					resolvedBranch = derivePrLocalBranchName(prMetadata);

					const existing = findExistingWorkspaceByBranch(
						ctx,
						input.projectId,
						resolvedBranch,
					);
					if (existing) {
						workspaceRow = existing;
						alreadyExists = true;
					} else {
						const localOid = await getLocalBranchHead(git, resolvedBranch);
						const adoptLocalBranch =
							localOid !== null &&
							localOid.toLowerCase() ===
								prMetadata.headRefOid.trim().toLowerCase();
						// If the local branch already lives in a worktree somewhere,
						// `git worktree add` will refuse. Look it up first so the
						// OID-mismatch error can point at the actual worktree, and
						// the matching-OID case can adopt instead of duplicating.
						const existingWorktreePath = (
							await listWorktreeBranches(git)
						).worktreeMap.get(resolvedBranch);
						const recordMaterializedWarning = (
							materialized: MaterializePrBranchResult,
						) => {
							if (materialized.warning) {
								console.warn(`[workspaces.create] ${materialized.warning}`);
							}
						};
						const normalizeExistingPrBranch = async () => {
							try {
								recordMaterializedWarning(
									await normalizePrBranchTracking({
										git,
										branch: resolvedBranch,
										remoteName: localProject.remoteName ?? "origin",
										pr: prMetadata,
									}),
								);
							} catch (err) {
								throw new TRPCError({
									code:
										err instanceof PrBranchConflictError
											? "CONFLICT"
											: "INTERNAL_SERVER_ERROR",
									message:
										err instanceof Error
											? err.message
											: "Failed to prepare existing PR branch",
								});
							}
						};

						if (localOid !== null && !adoptLocalBranch) {
							const cleanupHint = existingWorktreePath
								? `Inspect with \`git log ${resolvedBranch}\`, then \`git worktree remove ${existingWorktreePath}\` and \`git branch -D ${resolvedBranch}\` if safe.`
								: `Inspect with \`git log ${resolvedBranch}\`, then \`git branch -D ${resolvedBranch}\` if safe.`;
							throw new TRPCError({
								code: "CONFLICT",
								message: `Local branch "${resolvedBranch}" exists outside Superset and points at a different commit than PR #${input.pr} (local ${localOid.slice(0, 7)}, PR ${prMetadata.headRefOid.slice(0, 7)}). ${cleanupHint}`,
							});
						}

						if (adoptLocalBranch && existingWorktreePath) {
							await normalizeExistingPrBranch();
							worktreePath = existingWorktreePath;
							const result = await adoptExistingWorktree({
								ctx,
								git,
								projectId: input.projectId,
								branch: resolvedBranch,
								worktreePath,
								workspaceName: input.name ?? prMetadata.title ?? resolvedBranch,
								baseBranch: prMetadata.baseRefName,
								idempotencyId: input.id,
								taskId: input.taskId,
								tags: input.tags,
							});
							workspaceRow = result.workspace;
							alreadyExists = result.alreadyExists;
						} else {
							worktreePath = safeResolveWorktreePath(
								localProject.id,
								resolvedBranch,
								worktreeBaseDir,
							);
							mkdirSync(dirname(worktreePath), { recursive: true });

							const prWorktreePath = worktreePath;
							const rollbackWorktree = async () => {
								try {
									await git.raw([
										"worktree",
										"remove",
										"--force",
										prWorktreePath,
									]);
								} catch (err) {
									console.warn(
										"[workspaces.create] failed to rollback PR worktree",
										{ worktreePath: prWorktreePath, err },
									);
								}
							};
							let rollbackCreatedWorktree = rollbackWorktree;

							if (adoptLocalBranch) {
								await normalizeExistingPrBranch();
								try {
									await addWorktreeWithSparseCheckout({
										git,
										worktreeArgs: [worktreePath, resolvedBranch],
										worktreePath,
										sparsePaths,
										logPrefix: "[workspaces.create]",
									});
								} catch (err) {
									throw new TRPCError({
										code: "CONFLICT",
										message:
											err instanceof Error
												? err.message
												: "Failed to add worktree for existing branch",
									});
								}
							} else {
								let worktreeAddStarted = false;
								let materialized: MaterializePrBranchResult | null = null;
								const rollbackPreparedPr = async () => {
									await rollbackWorktree();
									if (materialized?.createdBranch) {
										await deleteMaterializedPrBranchIfSafe({
											git,
											branch: resolvedBranch,
											expectedHeadOid: prMetadata.headRefOid,
										}).catch((cleanupErr) => {
											console.warn(
												"[workspaces.create] failed to rollback PR branch",
												{ branch: resolvedBranch, err: cleanupErr },
											);
										});
									}
								};
								rollbackCreatedWorktree = rollbackPreparedPr;
								try {
									materialized = await materializePrBranch({
										git,
										branch: resolvedBranch,
										remoteName: localProject.remoteName ?? "origin",
										pr: prMetadata,
									});
									recordMaterializedWarning(materialized);
									worktreeAddStarted = true;
									await addWorktreeWithSparseCheckout({
										git,
										worktreeArgs: [worktreePath, resolvedBranch],
										worktreePath,
										sparsePaths,
										logPrefix: "[workspaces.create]",
									});
								} catch (err) {
									if (worktreeAddStarted || materialized?.createdBranch) {
										await rollbackPreparedPr();
									}
									throw new TRPCError({
										code:
											worktreeAddStarted || err instanceof PrBranchConflictError
												? "CONFLICT"
												: "INTERNAL_SERVER_ERROR",
										message:
											err instanceof Error
												? err.message
												: "Failed to prepare PR worktree",
									});
								}
							}

							workspaceRow = await registerLocalWorkspace({
								ctx,
								id: input.id,
								projectId: input.projectId,
								name: input.name ?? prMetadata.title ?? resolvedBranch,
								branch: resolvedBranch,
								worktreePath,
								taskId: input.taskId,
								tags: input.tags,
								rollbackWorktree: rollbackCreatedWorktree,
							});

							if (prMetadata.baseRefName) {
								await recordBaseBranchConfig({
									git,
									worktreePath,
									branch: resolvedBranch,
									baseBranch: prMetadata.baseRefName,
								});
							}
						}
					}
				} finally {
					releaseCreateLock();
				}
			} else if (input.worktreePath) {
				// Read the branch from git rather than trusting `input.branch`
				// — a stale name on the caller side would otherwise mis-target
				// the registration.
				const actualBranch = await getWorktreeBranchAtPath(
					git,
					input.worktreePath,
				);
				if (!actualBranch) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: `No branch-checked git worktree registered at "${input.worktreePath}"`,
					});
				}
				resolvedBranch = actualBranch;
				worktreePath = input.worktreePath;
				const result = await adoptExistingWorktree({
					ctx,
					git,
					projectId: input.projectId,
					branch: resolvedBranch,
					worktreePath,
					workspaceName: input.name ?? resolvedBranch,
					baseBranch: input.baseBranch,
					idempotencyId: input.id,
					taskId: input.taskId,
					tags: input.tags,
				});
				workspaceRow = result.workspace;
				alreadyExists = result.alreadyExists;
				await enablePushAutoSetupRemote(
					git,
					worktreePath,
					"[workspaces.create]",
				);
			} else {
				// A linked task can supply the branch when the caller didn't
				// pick one (CLI/MCP/automation creates from a task — desktop
				// surfaces resolve it client-side). Provider branch names are
				// used exactly, like an explicit skipBranchPrefix create.
				const taskBranch =
					!input.branch && input.taskId
						? await fetchLinkedTaskBranch(ctx, input.taskId)
						: undefined;
				const skipBranchPrefix = input.skipBranchPrefix || !!taskBranch;
				const typedBranch = input.branch?.trim() || taskBranch;
				let plan: BranchSourcePlan;

				if (typedBranch) {
					// Typed branch: resolve start point via the existing-branch-
					// aware planner.
					resolvedBranch = typedBranch;
					const [planResult, existing] = await Promise.all([
						planBranchSource(
							git,
							resolvedBranch,
							input.baseBranch,
							fetchBaseRefOffLoop,
						),
						listBranchNames(ctx, repoPath),
					]);
					plan = planResult;
					// plan.branch may carry an existing branch's canonical casing.
					resolvedBranch = plan.branch;
					// Namespace newly-created branches under the configured
					// prefix. A typed branch that resolves to an existing ref is
					// checked out as-is and never re-prefixed. Provider-supplied
					// branches (skipBranchPrefix) keep their exact format.
					if (!plan.usedExistingBranch && !skipBranchPrefix) {
						const prefix = await resolveProjectBranchPrefix({
							ctx,
							project: localProject,
							git,
							existingBranches: existing,
						});
						if (prefix) {
							resolvedBranch = deduplicateBranchName(
								`${prefix}/${resolvedBranch}`,
								existing,
							);
							plan = { ...plan, branch: resolvedBranch };
						}
					}
				} else {
					// Auto-gen branch: a typed workspace name seeds the branch
					// slug; otherwise friendly random. The AI branch name (when a
					// prompt exists) lands as a rename after registration — the
					// worktree add never waits for the LLM.
					const [startPoint, existing] = await Promise.all([
						resolveNewBranchStartPoint(
							git,
							input.baseBranch,
							fetchBaseRefOffLoop,
						),
						listBranchNames(ctx, repoPath),
					]);
					const prefix = await resolveProjectBranchPrefix({
						ctx,
						project: localProject,
						git,
						existingBranches: existing,
					});
					const typedNameSlug = input.name
						? sanitizeBranchCandidate(input.name)
						: "";
					const candidate = typedNameSlug || generateFriendlyBranchName();
					const prefixed = prefix ? `${prefix}/${candidate}` : candidate;
					resolvedBranch = deduplicateBranchName(prefixed, existing);
					plan = {
						branch: resolvedBranch,
						startPoint,
						usedExistingBranch: false,
					};
				}

				const existing = findExistingWorkspaceByBranch(
					ctx,
					input.projectId,
					resolvedBranch,
				);
				if (existing) {
					workspaceRow = existing;
					alreadyExists = true;
				} else {
					// Adopt at any path git already knows for this branch — git
					// refuses a second checkout of the same branch, so falling
					// through to `git worktree add` would block re-entry.
					const existingWorktreePath = (
						await listWorktreeBranches(git)
					).worktreeMap.get(resolvedBranch);

					if (existingWorktreePath) {
						worktreePath = existingWorktreePath;
						const baseShortName =
							!plan.usedExistingBranch && plan.startPoint.kind !== "head"
								? plan.startPoint.shortName
								: undefined;
						const result = await adoptExistingWorktree({
							ctx,
							git,
							projectId: input.projectId,
							branch: resolvedBranch,
							worktreePath,
							workspaceName: input.name ?? resolvedBranch,
							baseBranch: baseShortName,
							idempotencyId: input.id,
							taskId: input.taskId,
							tags: input.tags,
						});
						workspaceRow = result.workspace;
						alreadyExists = result.alreadyExists;
					} else {
						worktreePath = safeResolveWorktreePath(
							localProject.id,
							resolvedBranch,
							worktreeBaseDir,
						);
						mkdirSync(dirname(worktreePath), { recursive: true });

						// Bind the rollback target at definition. The outer
						// `worktreePath` is reassigned to the existing path on
						// adoption fallback below, but rollback must only ever
						// touch the worktree we actually created.
						const ourWorktreePath = worktreePath;
						const rollbackWorktree = async () => {
							try {
								await git.raw([
									"worktree",
									"remove",
									"--force",
									ourWorktreePath,
								]);
							} catch (err) {
								console.warn(
									"[workspaces.create] failed to rollback worktree",
									{ worktreePath: ourWorktreePath, err },
								);
							}
						};

						let adoptedRow: CloudWorkspace | undefined;
						try {
							await addBranchWorktree({
								git,
								plan,
								worktreePath,
								sparsePaths,
							});
						} catch (err) {
							// Branch is already claimed by another worktree that the
							// pre-check missed (auto-gen path, or a race). Adopt at
							// whatever path git reports.
							if (isBranchInUseByWorktreeError(err)) {
								const existingPath = (
									await listWorktreeBranches(git)
								).worktreeMap.get(resolvedBranch);
								if (existingPath) {
									worktreePath = existingPath;
									const baseShortName =
										!plan.usedExistingBranch && plan.startPoint.kind !== "head"
											? plan.startPoint.shortName
											: undefined;
									const result = await adoptExistingWorktree({
										ctx,
										git,
										projectId: input.projectId,
										branch: resolvedBranch,
										worktreePath,
										workspaceName: input.name ?? resolvedBranch,
										baseBranch: baseShortName,
										idempotencyId: input.id,
										taskId: input.taskId,
										tags: input.tags,
									});
									adoptedRow = result.workspace;
									alreadyExists = result.alreadyExists;
								}
							}
							if (adoptedRow === undefined) {
								throw new TRPCError({
									code: "CONFLICT",
									message:
										err instanceof Error
											? err.message
											: "Failed to add worktree",
								});
							}
						}

						if (adoptedRow !== undefined) {
							workspaceRow = adoptedRow;
						} else {
							await enablePushAutoSetupRemote(
								git,
								worktreePath,
								"[workspaces.create]",
							);

							if (!plan.usedExistingBranch && plan.startPoint.kind !== "head") {
								const baseShortName = plan.startPoint.shortName;
								await git
									.raw([
										"config",
										`branch.${resolvedBranch}.base`,
										baseShortName,
									])
									.catch((err) => {
										console.warn(
											`[workspaces.create] failed to record base branch ${baseShortName}:`,
											err,
										);
									});
							}

							workspaceRow = await registerLocalWorkspace({
								ctx,
								id: input.id,
								projectId: input.projectId,
								name: input.name ?? resolvedBranch,
								branch: resolvedBranch,
								worktreePath,
								taskId: input.taskId,
								tags: input.tags,
								rollbackWorktree,
							});
							aiCanRenameBranch = !typedBranch;
						}
					}
				}
			}

			// Apply AI names before terminals/agents start, so setup scripts
			// and agents only ever observe the final branch name. The naming
			// call has been running since the top of the mutation and is
			// bounded by its own timeouts, so this usually adds well under a
			// second on top of the git work; the rename itself (`branch -m`
			// plus a row update) is milliseconds. The worktree directory
			// keeps its creation-time name.
			if (!alreadyExists && aiNamesPromise && worktreePath !== undefined) {
				const names = await aiNamesPromise;
				if (names) {
					try {
						const applied = await applyGeneratedWorkspaceNames({
							ctx,
							workspaceId: workspaceRow.id,
							repoPath,
							worktreePath,
							oldBranchName: resolvedBranch,
							oldWorkspaceName: workspaceRow.name || resolvedBranch,
							names,
							renameTitle: true,
							renameBranch: aiCanRenameBranch,
						});
						if (applied) {
							// Keep the original row object: it carries the create txid.
							workspaceRow = {
								...workspaceRow,
								name: applied.name || applied.branch,
								branch: applied.branch,
							};
							resolvedBranch = applied.branch;
						}
					} catch (err) {
						console.warn("[workspaces.create] AI rename failed", err);
					}
				}
			}

			const terminalsResult: Array<{ terminalId: string; label?: string }> = [];
			const sugarLaunches = input.agents ?? [];

			// Wait-for-setup gate: chain a single terminal agent behind the setup
			// commands in the setup terminal, so the agent starts only after setup
			// succeeds and no second terminal is created. Multi-agent launches keep
			// the parallel path, mirroring the renderer's v1 gating. Build the agent
			// command up-front; if it fails (unknown agent, missing attachment) fall
			// back to the parallel dispatch, which surfaces the error in the agents
			// result.
			let chainAgent: { fullCommand: string; label: string } | null = null;
			const soleLaunch = sugarLaunches.length === 1 ? sugarLaunches[0] : null;
			if (!alreadyExists && input.waitForSetupBeforeAgents && soleLaunch) {
				try {
					chainAgent = buildTerminalAgentLaunch(ctx.db, {
						workspaceId: workspaceRow.id,
						agent: soleLaunch.agent,
						prompt: soleLaunch.prompt,
						attachmentIds: soleLaunch.attachmentIds,
						model: soleLaunch.model,
						effort: soleLaunch.effort,
						mode: soleLaunch.mode,
					});
				} catch (err) {
					console.warn(
						"[workspaces.create] wait-for-setup chain unavailable, dispatching agent in parallel:",
						err,
					);
				}
			}

			// Not chaining? Then the agent and the setup script are independent —
			// that is what this path means — so launch the agent first. Its
			// session is the one the user came for, and every client's tab order
			// follows creation order, which had been handing the first slot to a
			// setup shell nobody asked to look at.
			const earlyAgentsResult =
				chainAgent === null && sugarLaunches.length > 0
					? await dispatchSugarAgents(ctx, workspaceRow.id, sugarLaunches)
					: null;

			let chainedAgentResult: AgentLaunchResult | null = null;
			if (!alreadyExists && input.runSetup !== false) {
				const { terminal, warning, chained } =
					await startSetupTerminalIfPresent({
						ctx,
						workspaceId: workspaceRow.id,
						...(chainAgent ? { chainCommand: chainAgent.fullCommand } : {}),
					});
				if (warning) {
					console.warn(`[workspaces.create] setup warning: ${warning}`);
				}
				if (terminal) {
					terminalsResult.push({
						terminalId: terminal.id,
						label: terminal.label,
					});
				}
				if (chained && chainAgent && terminal) {
					chainedAgentResult = {
						ok: true,
						kind: "terminal",
						sessionId: terminal.id,
						label: chainAgent.label,
					};
				}
			}

			const [agentsResult, commandResult] = await Promise.all([
				earlyAgentsResult ??
					dispatchSugarAgents(
						ctx,
						workspaceRow.id,
						chainedAgentResult ? [] : sugarLaunches,
					),
				input.command
					? startCommandTerminal({
							ctx,
							workspaceId: workspaceRow.id,
							command: input.command,
						})
					: Promise.resolve(null),
			]);

			if (commandResult?.warning) {
				console.warn(
					`[workspaces.create] command warning: ${commandResult.warning}`,
				);
			}
			if (commandResult?.terminal) {
				terminalsResult.push({
					terminalId: commandResult.terminal.id,
					label: commandResult.terminal.label,
				});
			}

			// Work is starting on the linked task — move it to In Progress.
			// Best-effort cloud call; creation never blocks on it. A reused
			// workspace keeps its own task link, so only nudge when this call
			// actually linked the requested task.
			if (
				input.taskId &&
				(!alreadyExists || workspaceRow.taskId === input.taskId)
			) {
				const taskId = input.taskId;
				void ctx.api.task.start.mutate({ id: taskId }).catch((err) => {
					console.warn(
						`[workspaces.create] failed to mark task ${taskId} as started:`,
						err,
					);
				});
			}

			return {
				workspace: workspaceRow,
				terminals: terminalsResult,
				agents: chainedAgentResult
					? [chainedAgentResult, ...agentsResult]
					: agentsResult,
				alreadyExists,
				txid: extractCreateTxid(workspaceRow),
			};
		}),

	/**
	 * Enqueue-and-return variant of `create` for renderer clients: the full
	 * create (worktree add, AI naming, agent dispatch) can run for minutes,
	 * which would pin one of Chromium's 6-per-origin pooled sockets — and
	 * relay-fronted hosts hard-cap request exchanges at 30s. Validates
	 * cheaply, responds immediately, then runs the real `create` in the
	 * background and broadcasts a `workspace:create-settled` event carrying
	 * everything the synchronous response used to. CLI/MCP/SDK/automations
	 * keep calling `create` directly.
	 */
	createEnqueued: protectedProcedure
		.input(createInputSchema)
		.mutation(({ ctx, input }) => {
			const workspaceId = input.id;
			if (!workspaceId) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "createEnqueued requires a client-minted `id`",
				});
			}
			for (const launch of input.agents ?? []) {
				validateAgentLaunchOptions(ctx.db, launch);
			}
			requireProjectRepoPath(requireLocalProject(ctx, input.projectId));

			void createWorkspacesCaller(ctx)
				.create(input)
				.then((result) => {
					ctx.eventBus.broadcastWorkspaceCreateSettled({
						workspaceId,
						ok: true,
						canonicalWorkspaceId: result.workspace.id,
						projectId: result.workspace.projectId ?? null,
						terminals: result.terminals,
						agents: result.agents,
						alreadyExists: result.alreadyExists,
						occurredAt: Date.now(),
					});
				})
				.catch((error) => {
					console.warn(
						`[workspaces.createEnqueued] create failed for workspace ${workspaceId} (project ${input.projectId})`,
						error,
					);
					ctx.eventBus.broadcastWorkspaceCreateSettled({
						workspaceId,
						ok: false,
						canonicalWorkspaceId: null,
						projectId: null,
						terminals: [],
						agents: [],
						alreadyExists: false,
						error: error instanceof Error ? error.message : String(error),
						occurredAt: Date.now(),
					});
				});

			return { workspaceId };
		}),

	aiRename: protectedProcedure
		.input(
			z.object({
				workspaceId: z.string().uuid(),
				prompt: z.string().min(1),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const local = getLocalWorkspace(ctx.db, input.workspaceId);
			if (!local) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: `Workspace not found: ${input.workspaceId}`,
				});
			}
			// AI rename also renames the git branch against the project repo;
			// session workspaces (null projectId) have neither.
			const project = local.projectId
				? ctx.db.query.projects
						.findFirst({ where: eq(projects.id, local.projectId) })
						.sync()
				: undefined;
			if (!project) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Local project not found for workspace",
				});
			}
			void applyAiWorkspaceRename({
				ctx,
				workspaceId: input.workspaceId,
				repoPath: project.repoPath ?? "",
				worktreePath: local.worktreePath,
				oldBranchName: local.branch,
				oldWorkspaceName: local.name || local.branch,
				prompt: input.prompt,
				namingInstructions: project.namingInstructions,
				renameTitle: true,
				renameBranch: true,
			}).catch((err) => {
				console.warn("[workspaces.aiRename] failed", err);
			});
			return { success: true as const };
		}),

	generateBranchName: protectedProcedure
		.input(
			z.object({
				projectId: z.string(),
				prompt: z.string().min(1),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const localProject = requireLocalProject(ctx, input.projectId);
			const existingBranches = await listBranchNames(
				ctx,
				localProject.repoPath,
			);
			const branchName = await generateBranchNameFromPrompt(
				input.prompt,
				existingBranches,
			);
			return { branchName };
		}),
});

// Server-side caller for createEnqueued's background run of the real create.
// Declared after the router; the resolver closure only dereferences it at
// request time, long after module init.
const createWorkspacesCaller = createCallerFactory(workspacesRouter);

export { generateWorkspaceNamesFromPrompt as _aiNamesGenerator };
