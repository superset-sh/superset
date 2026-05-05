import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { generateFriendlyBranchName } from "@superset/shared/workspace-launch";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { workspaces } from "../../../db/schema";
import {
	asRemoteRef,
	type ResolvedRef,
	resolveDefaultBranchName,
	resolveRef,
	resolveUpstream,
} from "../../../runtime/git/refs";
import type { HostServiceContext } from "../../../types";
import { protectedProcedure, router } from "../../index";
import { type AgentRunResult, runAgentInWorkspace } from "../agents";
import { ensureMainWorkspace } from "../project/utils/ensure-main-workspace";
import { adoptExistingWorktree } from "../workspace-creation/shared/adopt-existing-worktree";
import { listWorktreeBranches } from "../workspace-creation/shared/branch-search";
import { enablePushAutoSetupRemote } from "../workspace-creation/shared/git-config";
import { requireLocalProject } from "../workspace-creation/shared/local-project";
import { startSetupTerminalIfPresent } from "../workspace-creation/shared/setup-terminal";
import type { GitClient } from "../workspace-creation/shared/types";
import { safeResolveWorktreePath } from "../workspace-creation/shared/worktree-paths";
import { generateBranchNameFromPrompt } from "../workspace-creation/utils/ai-branch-name";
import {
	applyAiWorkspaceRename,
	type GeneratedWorkspaceNames,
	generateWorkspaceNamesFromPrompt,
} from "../workspace-creation/utils/ai-workspace-names";
import { execGh } from "../workspace-creation/utils/exec-gh";
import { listBranchNames } from "../workspace-creation/utils/list-branch-names";
import { derivePrLocalBranchName } from "../workspace-creation/utils/pr-branch-name";
import {
	getErrorMessage,
	recoverPrCheckoutAfterGhFailure,
} from "../workspace-creation/utils/pr-checkout-recovery";
import { resolveStartPoint } from "../workspace-creation/utils/resolve-start-point";
import { deduplicateBranchName } from "../workspace-creation/utils/sanitize-branch";

const agentLaunchSchema = z
	.object({
		agent: z.string().min(1),
		prompt: z.string(),
		attachmentIds: z.array(z.string().uuid()).optional(),
	})
	.refine(
		(value) =>
			value.prompt.length > 0 || (value.attachmentIds?.length ?? 0) > 0,
		{ message: "Agent launch requires a prompt or attachments" },
	);

const createInputSchema = z
	.object({
		projectId: z.string(),
		// Both `name` and `branch` are optional. When omitted with a
		// non-empty agent prompt, the server generates them inline via
		// the same LLM call (in parallel with the worktree work). When
		// omitted with no prompt, a friendly-random fallback fills in.
		name: z.string().min(1).optional(),
		branch: z.string().min(1).optional(),
		pr: z.number().int().positive().optional(),
		baseBranch: z.string().min(1).optional(),
		taskId: z.string().uuid().optional(),
		agents: z.array(agentLaunchSchema).optional(),
		id: z.string().uuid().optional(),
	})
	.refine((value) => !(value.branch && value.pr), {
		message: "`branch` and `pr` cannot both be set",
	});

type AgentLaunchResult =
	| ({ ok: true } & AgentRunResult)
	| { ok: false; error: string };

interface ResolvedWorkspace {
	id: string;
	projectId: string;
	name: string;
	branch: string;
}

async function findExistingWorkspaceByBranch(
	ctx: HostServiceContext,
	projectId: string,
	branch: string,
): Promise<ResolvedWorkspace | null> {
	const local = ctx.db.query.workspaces
		.findFirst({
			where: and(
				eq(workspaces.projectId, projectId),
				eq(workspaces.branch, branch),
			),
		})
		.sync();
	if (!local) return null;

	const cloud = await ctx.api.v2Workspace.getFromHost.query({
		organizationId: ctx.organizationId,
		id: local.id,
	});
	if (!cloud) return null;
	return {
		id: cloud.id,
		projectId: cloud.projectId,
		name: cloud.name,
		branch: cloud.branch,
	};
}

interface PrMetadata {
	number: number;
	url: string;
	title: string;
	headRefName: string;
	headRefOid: string;
	baseRefName: string;
	headRepositoryOwner: string;
	isCrossRepository: boolean;
	state: "open" | "closed" | "merged";
}

async function fetchPrMetadata(args: {
	cwd: string;
	prNumber: number;
}): Promise<PrMetadata> {
	const result = await execGh(
		[
			"pr",
			"view",
			String(args.prNumber),
			"--json",
			"number,url,title,headRefName,headRefOid,baseRefName,headRepositoryOwner,isCrossRepository,state",
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

interface BranchSourcePlan {
	branch: string;
	startPoint: ResolvedRef;
	usedExistingBranch: boolean;
}

/**
 * Resolve the start point a *new* branch should fork from. No
 * `resolveRef(branch)` check — callers are responsible for guaranteeing
 * the branch name is fresh (e.g. via `deduplicateBranchName`). Useful
 * when the branch name is being chosen at the same time the start point
 * is resolved (auto-gen + AI naming path), so it can run in parallel
 * with the LLM call.
 */
async function resolveNewBranchStartPoint(
	git: GitClient,
	baseBranch: string | undefined,
): Promise<ResolvedRef> {
	let startPoint = await resolveStartPoint(git, baseBranch);

	// Fork from upstream of the default branch when the user didn't specify
	// a base — locals are often stale.
	if (startPoint.kind === "local") {
		const defaultBranchName = await resolveDefaultBranchName(git);
		if (startPoint.shortName === defaultBranchName) {
			const upstream = await resolveUpstream(git, defaultBranchName);
			if (upstream) {
				const remoteRef = asRemoteRef(upstream.remote, upstream.remoteBranch);
				// `--quiet` confuses simple-git's `raw` (resolves on missing
				// refs with empty stdout). Drop it; verify a sha was printed.
				const remoteExists = await git
					.raw(["rev-parse", "--verify", `${remoteRef}^{commit}`])
					.then((out) => /^[0-9a-f]{40,}/.test(out.trim()))
					.catch(() => false);
				if (remoteExists) {
					startPoint = {
						kind: "remote-tracking",
						fullRef: remoteRef,
						shortName: upstream.remoteBranch,
						remote: upstream.remote,
						remoteShortName: `${upstream.remote}/${upstream.remoteBranch}`,
					};
				}
			}
		}
	}

	if (startPoint.kind === "remote-tracking") {
		try {
			await git.fetch([
				startPoint.remote,
				startPoint.shortName,
				"--quiet",
				"--no-tags",
			]);
		} catch (err) {
			console.warn(
				`[workspaces.create] fetch ${startPoint.remoteShortName} failed:`,
				err,
			);
		}
	}

	return startPoint;
}

async function planBranchSource(
	git: GitClient,
	branch: string,
	baseBranch: string | undefined,
): Promise<BranchSourcePlan> {
	const resolved = await resolveRef(git, branch);

	if (
		resolved &&
		(resolved.kind === "local" || resolved.kind === "remote-tracking")
	) {
		return { branch, startPoint: resolved, usedExistingBranch: true };
	}

	if (resolved && resolved.kind === "tag") {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `"${branch}" is a tag, not a branch — cannot check out into a workspace`,
		});
	}

	const startPoint = await resolveNewBranchStartPoint(git, baseBranch);
	return { branch, startPoint, usedExistingBranch: false };
}

async function addBranchWorktree(args: {
	git: GitClient;
	plan: BranchSourcePlan;
	worktreePath: string;
}): Promise<void> {
	const { git, plan, worktreePath } = args;

	if (plan.usedExistingBranch) {
		// Existing branch — check it out into a fresh worktree. Remote-tracking
		// refs need explicit --track + -b so the worktree gets a real local
		// branch, not detached HEAD.
		await git.raw(
			plan.startPoint.kind === "remote-tracking"
				? [
						"worktree",
						"add",
						"--track",
						"-b",
						plan.branch,
						worktreePath,
						plan.startPoint.remoteShortName,
					]
				: [
						"worktree",
						"add",
						worktreePath,
						plan.startPoint.kind === "head"
							? "HEAD"
							: plan.startPoint.shortName,
					],
		);
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
	await git.raw([
		"worktree",
		"add",
		"--no-track",
		"-b",
		plan.branch,
		worktreePath,
		startPointArg,
	]);
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
 * Kicks off `host.ensure` so the cloud round-trip overlaps with the
 * git work in `workspaces.create`. Returned promise is awaited inside
 * `registerCloudAndLocal` once we actually need the hostId.
 *
 * `host.ensure` is idempotent — fine to start it before we know
 * whether we'll end up creating a workspace at all (e.g. the
 * idempotency short-circuit returns early). Worst case is one wasted
 * cloud call, no observable side effect.
 */
async function startHostEnsure(
	ctx: HostServiceContext,
): Promise<{ machineId: string }> {
	const { getHostId, getHostName } = await import("@superset/shared/host-info");
	return ctx.api.host.ensure.mutate({
		organizationId: ctx.organizationId,
		machineId: getHostId(),
		name: getHostName(),
	});
}

async function registerCloudAndLocal(args: {
	ctx: HostServiceContext;
	id: string | undefined;
	projectId: string;
	name: string;
	branch: string;
	worktreePath: string;
	taskId: string | undefined;
	rollbackWorktree: () => Promise<void>;
	hostPromise: Promise<{ machineId: string }>;
}): Promise<{ id: string; projectId: string; name: string; branch: string }> {
	const { ctx } = args;
	let host: { machineId: string };
	try {
		host = await args.hostPromise;
	} catch (err) {
		await args.rollbackWorktree();
		throw new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message: `Failed to register host: ${err instanceof Error ? err.message : String(err)}`,
		});
	}

	const cloudRow = await ctx.api.v2Workspace.create
		.mutate({
			organizationId: ctx.organizationId,
			projectId: args.projectId,
			name: args.name,
			branch: args.branch,
			hostId: host.machineId,
			taskId: args.taskId,
			id: args.id,
		})
		.catch(async (err) => {
			await args.rollbackWorktree();
			throw err;
		});

	if (!cloudRow) {
		await args.rollbackWorktree();
		throw new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message: "Cloud workspace create returned no row",
		});
	}

	try {
		ctx.db
			.insert(workspaces)
			.values({
				id: cloudRow.id,
				projectId: args.projectId,
				worktreePath: args.worktreePath,
				branch: args.branch,
			})
			.run();
	} catch (err) {
		await args.rollbackWorktree();
		await ctx.api.v2Workspace.delete
			.mutate({ id: cloudRow.id })
			.catch((cleanupErr) => {
				console.warn("[workspaces.create] failed to rollback cloud workspace", {
					workspaceId: cloudRow.id,
					err: cleanupErr,
				});
			});
		throw new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message: `Failed to persist workspace locally: ${err instanceof Error ? err.message : String(err)}`,
		});
	}

	return {
		id: cloudRow.id,
		projectId: cloudRow.projectId,
		name: cloudRow.name,
		branch: cloudRow.branch,
	};
}

async function dispatchSugarAgents(
	ctx: HostServiceContext,
	workspaceId: string,
	launches: z.infer<typeof agentLaunchSchema>[],
): Promise<AgentLaunchResult[]> {
	if (launches.length === 0) return [];
	return Promise.all(
		launches.map(async (entry) => {
			try {
				const result = await runAgentInWorkspace(ctx, {
					workspaceId,
					agent: entry.agent,
					prompt: entry.prompt,
					attachmentIds: entry.attachmentIds,
				});
				return { ok: true as const, ...result };
			} catch (err) {
				return {
					ok: false as const,
					error: err instanceof Error ? err.message : String(err),
				};
			}
		}),
	);
}

export const workspacesRouter = router({
	create: protectedProcedure
		.input(createInputSchema)
		.mutation(async ({ ctx, input }) => {
			const localProject = requireLocalProject(ctx, input.projectId);

			// Kick off host.ensure immediately so the cloud round-trip
			// overlaps with the git work below. Suppressing unhandled
			// rejection here — the await in registerCloudAndLocal turns
			// the promise rejection into a TRPCError with rollback.
			const hostPromise = startHostEnsure(ctx);
			hostPromise.catch(() => {});

			// Kick off AI naming in parallel when the user supplied a prompt
			// but left at least one of (name, branch) blank. The LLM call
			// (~700ms) overlaps with `ensureMainWorkspace` + the start-point
			// resolution, so by the time we need the resolved values for
			// `worktree add` they're already in hand. PR path skips entirely
			// — PR title + derived branch are already meaningful.
			const composerPrompt = input.agents?.[0]?.prompt?.trim() ?? "";
			const wantAi =
				input.pr === undefined &&
				(input.branch === undefined || input.name === undefined) &&
				!!composerPrompt;
			const aiNamesPromise: Promise<GeneratedWorkspaceNames | null> | null =
				wantAi
					? generateWorkspaceNamesFromPrompt(composerPrompt).catch((err) => {
							console.warn("[workspaces.create] AI naming failed", err);
							return null;
						})
					: null;
			aiNamesPromise?.catch(() => {});

			await ensureMainWorkspace(ctx, input.projectId, localProject.repoPath);

			const git = await ctx.git(localProject.repoPath);

			// Free branches still claimed by registrations whose dirs are
			// gone — without this, `git worktree add` later fails with
			// "branch is already used by worktree at <missing-path>".
			await git
				.raw(["worktree", "prune"])
				.catch((err) =>
					console.warn("[workspaces.create] worktree prune failed:", err),
				);

			let resolvedBranch: string;
			let worktreePath: string;
			let alreadyExists = false;
			let workspaceRow: {
				id: string;
				projectId: string;
				name: string;
				branch: string;
			};
			let prMetadata: PrMetadata | null = null;

			if (input.pr !== undefined) {
				prMetadata = await fetchPrMetadata({
					cwd: localProject.repoPath,
					prNumber: input.pr,
				});
				resolvedBranch = derivePrLocalBranchName(prMetadata);

				const existing = await findExistingWorkspaceByBranch(
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
							hostPromise,
						});
						workspaceRow = result.workspace;
						alreadyExists = result.alreadyExists;
						await enablePushAutoSetupRemote(
							git,
							worktreePath,
							"[workspaces.create]",
						);
					} else {
						worktreePath = safeResolveWorktreePath(
							localProject.id,
							resolvedBranch,
						);
						mkdirSync(dirname(worktreePath), { recursive: true });

						const rollbackWorktree = async () => {
							try {
								await git.raw(["worktree", "remove", "--force", worktreePath]);
							} catch (err) {
								console.warn(
									"[workspaces.create] failed to rollback PR worktree",
									{ worktreePath, err },
								);
							}
						};

						if (adoptLocalBranch) {
							try {
								await git.raw([
									"worktree",
									"add",
									worktreePath,
									resolvedBranch,
								]);
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
							try {
								await git.raw(["worktree", "add", "--detach", worktreePath]);
							} catch (err) {
								throw new TRPCError({
									code: "CONFLICT",
									message:
										err instanceof Error
											? err.message
											: "Failed to add detached worktree",
								});
							}

							try {
								await execGh(
									[
										"pr",
										"checkout",
										String(input.pr),
										"--branch",
										resolvedBranch,
										"--force",
									],
									{ cwd: worktreePath, timeout: 120_000 },
								);
							} catch (err) {
								let recoveryError: unknown = null;
								let recovered = false;
								try {
									const recovery = await recoverPrCheckoutAfterGhFailure({
										git,
										worktreePath,
										branch: resolvedBranch,
										prNumber: input.pr,
										remoteName: localProject.remoteName ?? "origin",
										expectedHeadOid: prMetadata.headRefOid,
										error: err,
									});
									recovered = recovery.recovered;
								} catch (e) {
									recoveryError = e;
								}
								if (!recovered) {
									await rollbackWorktree();
									const recoveryMessage = recoveryError
										? ` Recovery via refs/pull/${input.pr}/head also failed: ${getErrorMessage(recoveryError)}`
										: "";
									throw new TRPCError({
										code: "INTERNAL_SERVER_ERROR",
										message: `gh pr checkout failed: ${err instanceof Error ? err.message : String(err)}${recoveryMessage}`,
									});
								}
							}
						}

						await enablePushAutoSetupRemote(
							git,
							worktreePath,
							"[workspaces.create]",
						);

						workspaceRow = await registerCloudAndLocal({
							ctx,
							id: input.id,
							projectId: input.projectId,
							name: input.name ?? prMetadata.title ?? resolvedBranch,
							branch: resolvedBranch,
							worktreePath,
							taskId: input.taskId,
							rollbackWorktree,
							hostPromise,
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
			} else {
				const typedBranch = input.branch?.trim();
				let plan: BranchSourcePlan;
				let aiTitle: string | null = null;

				if (typedBranch) {
					// Typed branch: resolve start point via the existing-branch-
					// aware planner. Title-rename can race with that lookup.
					resolvedBranch = typedBranch;
					const [planResult, aiNames] = await Promise.all([
						planBranchSource(git, resolvedBranch, input.baseBranch),
						aiNamesPromise ?? Promise.resolve(null),
					]);
					plan = planResult;
					aiTitle = aiNames?.title ?? null;
				} else {
					// Auto-gen branch: kick the LLM, the start-point resolve,
					// and the dedupe list off in parallel — none of them depend
					// on the others. Whichever finishes last gates the worktree
					// add. AI's branch name wins when available; friendly random
					// is a fallback for no-prompt or LLM failure.
					const [aiNames, startPoint, existing] = await Promise.all([
						aiNamesPromise ?? Promise.resolve(null),
						resolveNewBranchStartPoint(git, input.baseBranch),
						listBranchNames(ctx, localProject.repoPath),
					]);
					aiTitle = aiNames?.title ?? null;
					const candidate = aiNames?.branchName || generateFriendlyBranchName();
					resolvedBranch = deduplicateBranchName(candidate, existing);
					plan = {
						branch: resolvedBranch,
						startPoint,
						usedExistingBranch: false,
					};
				}

				const existing = await findExistingWorkspaceByBranch(
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
					// through to `git worktree add` would block re-entry. Auto-gen
					// names are deduped against the branch list, so only typed
					// branches can collide here.
					const existingWorktreePath = typedBranch
						? (await listWorktreeBranches(git)).worktreeMap.get(resolvedBranch)
						: undefined;

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
							workspaceName: input.name ?? aiTitle ?? resolvedBranch,
							baseBranch: baseShortName,
							idempotencyId: input.id,
							taskId: input.taskId,
							hostPromise,
						});
						workspaceRow = result.workspace;
						alreadyExists = result.alreadyExists;
					} else {
						worktreePath = safeResolveWorktreePath(
							localProject.id,
							resolvedBranch,
						);
						mkdirSync(dirname(worktreePath), { recursive: true });

						const rollbackWorktree = async () => {
							try {
								await git.raw(["worktree", "remove", "--force", worktreePath]);
							} catch (err) {
								console.warn(
									"[workspaces.create] failed to rollback worktree",
									{ worktreePath, err },
								);
							}
						};

						try {
							await addBranchWorktree({ git, plan, worktreePath });
						} catch (err) {
							throw new TRPCError({
								code: "CONFLICT",
								message:
									err instanceof Error ? err.message : "Failed to add worktree",
							});
						}

						await enablePushAutoSetupRemote(
							git,
							worktreePath,
							"[workspaces.create]",
						);

						if (!plan.usedExistingBranch && plan.startPoint.kind !== "head") {
							const baseShortName = plan.startPoint.shortName;
							await git
								.raw(["config", `branch.${resolvedBranch}.base`, baseShortName])
								.catch((err) => {
									console.warn(
										`[workspaces.create] failed to record base branch ${baseShortName}:`,
										err,
									);
								});
						}

						workspaceRow = await registerCloudAndLocal({
							ctx,
							id: input.id,
							projectId: input.projectId,
							name: input.name ?? aiTitle ?? resolvedBranch,
							branch: resolvedBranch,
							worktreePath,
							taskId: input.taskId,
							rollbackWorktree,
							hostPromise,
						});
					}
				}
			}

			const terminalsResult: Array<{ terminalId: string; label?: string }> = [];

			if (!alreadyExists) {
				const { terminal, warning } = await startSetupTerminalIfPresent({
					ctx,
					workspaceId: workspaceRow.id,
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
			}

			const agentsResult = await dispatchSugarAgents(
				ctx,
				workspaceRow.id,
				input.agents ?? [],
			);

			return {
				workspace: {
					id: workspaceRow.id,
					projectId: workspaceRow.projectId,
					name: workspaceRow.name,
					branch: workspaceRow.branch,
				},
				terminals: terminalsResult,
				agents: agentsResult,
				alreadyExists,
			};
		}),

	aiRename: protectedProcedure
		.input(
			z.object({
				workspaceId: z.string().uuid(),
				prompt: z.string().min(1),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const local = ctx.db.query.workspaces
				.findFirst({ where: eq(workspaces.id, input.workspaceId) })
				.sync();
			if (!local) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: `Workspace not found: ${input.workspaceId}`,
				});
			}
			const cloud = await ctx.api.v2Workspace.getFromHost.query({
				organizationId: ctx.organizationId,
				id: input.workspaceId,
			});
			if (!cloud) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: `Cloud workspace not found: ${input.workspaceId}`,
				});
			}
			const project = ctx.db.query.projects
				.findFirst({ where: eq(workspaces.projectId, local.projectId) })
				.sync();
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
				oldBranchName: cloud.branch,
				oldWorkspaceName: cloud.name,
				prompt: input.prompt,
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

export { generateWorkspaceNamesFromPrompt as _aiNamesGenerator };
