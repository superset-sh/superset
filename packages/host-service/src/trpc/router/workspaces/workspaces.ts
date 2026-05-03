import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
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
import { getWorktreeBranchAtPath } from "../workspace-creation/shared/branch-search";
import { enablePushAutoSetupRemote } from "../workspace-creation/shared/git-config";
import { requireLocalProject } from "../workspace-creation/shared/local-project";
import { startSetupTerminalIfPresent } from "../workspace-creation/shared/setup-terminal";
import type { GitClient } from "../workspace-creation/shared/types";
import { safeResolveWorktreePath } from "../workspace-creation/shared/worktree-paths";
import { generateBranchNameFromPrompt } from "../workspace-creation/utils/ai-branch-name";
import {
	applyAiWorkspaceRename,
	generateWorkspaceNamesFromPrompt,
} from "../workspace-creation/utils/ai-workspace-names";
import { execGh } from "../workspace-creation/utils/exec-gh";
import { listBranchNames } from "../workspace-creation/utils/list-branch-names";
import { derivePrLocalBranchName } from "../workspace-creation/utils/pr-branch-name";
import { resolveStartPoint } from "../workspace-creation/utils/resolve-start-point";

const agentLaunchSchema = z.object({
	agent: z.string().min(1),
	prompt: z.string().min(1),
	attachmentIds: z.array(z.string().uuid()).optional(),
});

const createInputSchema = z
	.object({
		projectId: z.string(),
		name: z.string().min(1),
		branch: z.string().min(1).optional(),
		pr: z.number().int().positive().optional(),
		baseBranch: z.string().min(1).optional(),
		taskIds: z.array(z.string().uuid()).optional(),
		autogenerateName: z.boolean().optional(),
		agents: z.array(agentLaunchSchema).optional(),
		id: z.string().uuid().optional(),
	})
	.refine((value) => Boolean(value.branch) !== Boolean(value.pr), {
		message: "Exactly one of `branch` or `pr` must be set",
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
			"number,url,title,headRefName,baseRefName,headRepositoryOwner,isCrossRepository,state",
		],
		{ cwd: args.cwd, timeout: 30_000 },
	);
	const parsed = result as {
		number: number;
		url: string;
		title: string;
		headRefName: string;
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
		baseRefName: parsed.baseRefName,
		headRepositoryOwner: parsed.headRepositoryOwner?.login ?? "",
		isCrossRepository: parsed.isCrossRepository,
		state,
	};
}

async function localBranchExists(
	git: GitClient,
	branchName: string,
): Promise<boolean> {
	try {
		// Same trap as refs.ts: `--quiet` causes simple-git's `raw` to
		// mis-resolve missing refs as success with empty stdout. Verify a
		// sha was printed to confirm the ref actually exists.
		const out = await git.raw([
			"show-ref",
			"--verify",
			`refs/heads/${branchName}`,
		]);
		return /^[0-9a-f]{40,}/.test(out.trim());
	} catch {
		return false;
	}
}

interface BranchSourcePlan {
	branch: string;
	startPoint: ResolvedRef;
	usedExistingBranch: boolean;
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

async function registerCloudAndLocal(args: {
	ctx: HostServiceContext;
	id: string | undefined;
	projectId: string;
	name: string;
	branch: string;
	worktreePath: string;
	taskIds: string[] | undefined;
	rollbackWorktree: () => Promise<void>;
}): Promise<{ id: string; projectId: string; name: string; branch: string }> {
	const { ctx } = args;
	const { getHostId, getHostName } = await import("@superset/shared/host-info");
	let host: { machineId: string };
	try {
		host = await ctx.api.host.ensure.mutate({
			organizationId: ctx.organizationId,
			machineId: getHostId(),
			name: getHostName(),
		});
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
			taskIds: args.taskIds,
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
			await ensureMainWorkspace(ctx, input.projectId, localProject.repoPath);

			const git = await ctx.git(localProject.repoPath);

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
					if (await localBranchExists(git, resolvedBranch)) {
						throw new TRPCError({
							code: "CONFLICT",
							message: `Local branch "${resolvedBranch}" already exists outside Superset. Delete it (\`git branch -D ${resolvedBranch}\`) or rename it, then retry.`,
						});
					}

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
						await rollbackWorktree();
						throw new TRPCError({
							code: "INTERNAL_SERVER_ERROR",
							message: `gh pr checkout failed: ${err instanceof Error ? err.message : String(err)}`,
						});
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
						name: input.name,
						branch: resolvedBranch,
						worktreePath,
						taskIds: input.taskIds,
						rollbackWorktree,
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
			} else {
				if (!input.branch) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: "branch is required when pr is not set",
					});
				}
				resolvedBranch = input.branch.trim();

				const existing = await findExistingWorkspaceByBranch(
					ctx,
					input.projectId,
					resolvedBranch,
				);
				if (existing) {
					workspaceRow = existing;
					alreadyExists = true;
				} else {
					worktreePath = safeResolveWorktreePath(
						localProject.id,
						resolvedBranch,
					);

					// Adopt: a worktree already exists at the standard path with the
					// matching branch checked out (e.g. left behind by a prior session
					// or registered outside Superset). Skip `git worktree add` and
					// proceed straight to register.
					const adopted =
						(await getWorktreeBranchAtPath(git, worktreePath)) ===
						resolvedBranch;

					mkdirSync(dirname(worktreePath), { recursive: true });

					const rollbackWorktree = async () => {
						if (adopted) return;
						try {
							await git.raw(["worktree", "remove", "--force", worktreePath]);
						} catch (err) {
							console.warn("[workspaces.create] failed to rollback worktree", {
								worktreePath,
								err,
							});
						}
					};

					const plan = adopted
						? null
						: await planBranchSource(git, resolvedBranch, input.baseBranch);

					if (plan) {
						try {
							await addBranchWorktree({ git, plan, worktreePath });
						} catch (err) {
							throw new TRPCError({
								code: "CONFLICT",
								message:
									err instanceof Error ? err.message : "Failed to add worktree",
							});
						}
					}

					await enablePushAutoSetupRemote(
						git,
						worktreePath,
						"[workspaces.create]",
					);

					if (
						plan &&
						!plan.usedExistingBranch &&
						plan.startPoint.kind !== "head"
					) {
						await git
							.raw([
								"config",
								`branch.${resolvedBranch}.base`,
								plan.startPoint.shortName,
							])
							.catch((err) => {
								console.warn(
									`[workspaces.create] failed to record base branch ${plan.startPoint.kind === "head" ? "" : plan.startPoint.shortName}:`,
									err,
								);
							});
					}

					workspaceRow = await registerCloudAndLocal({
						ctx,
						id: input.id,
						projectId: input.projectId,
						name: input.name,
						branch: resolvedBranch,
						worktreePath,
						taskIds: input.taskIds,
						rollbackWorktree,
					});
				}
			}

			const terminalsResult: Array<{ terminalId: string; label?: string }> = [];

			if (!alreadyExists) {
				// worktreePath is set in the !alreadyExists branches above.
				const setupWorktreePath = ctx.db.query.workspaces
					.findFirst({
						where: eq(workspaces.id, workspaceRow.id),
					})
					.sync()?.worktreePath;
				if (setupWorktreePath) {
					const { terminal, warning } = await startSetupTerminalIfPresent({
						ctx,
						workspaceId: workspaceRow.id,
						worktreePath: setupWorktreePath,
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

				if (input.autogenerateName) {
					const composerPrompt = input.agents?.[0]?.prompt?.trim() ?? "";
					if (composerPrompt) {
						const setupPath = setupWorktreePath ?? "";
						void applyAiWorkspaceRename({
							ctx,
							workspaceId: workspaceRow.id,
							repoPath: localProject.repoPath,
							worktreePath: setupPath,
							oldBranchName: workspaceRow.branch,
							oldWorkspaceName: workspaceRow.name,
							prompt: composerPrompt,
						}).catch((err) => {
							console.warn(
								"[workspaces.create] AI workspace rename failed",
								err,
							);
						});
					}
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
