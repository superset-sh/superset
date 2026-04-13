import { existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { getDeviceName, getHashedDeviceId } from "@superset/shared/device-info";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import simpleGit from "simple-git";
import { z } from "zod";
import { projects, workspaces } from "../../../db/schema";
import { createTerminalSessionInternal } from "../../../terminal/terminal";
import type { HostServiceContext } from "../../../types";
import { protectedProcedure, router } from "../../index";
import { resolveStartPoint } from "./utils/resolve-start-point";
import { deduplicateBranchName } from "./utils/sanitize-branch";

// ── In-memory create progress (polled by renderer) ──────────────────

interface ProgressStep {
	id: string;
	label: string;
	status: "pending" | "active" | "done";
}

interface ProgressState {
	steps: ProgressStep[];
	updatedAt: number;
}

const STEP_DEFINITIONS = [
	{ id: "ensuring_repo", label: "Ensuring local repository" },
	{ id: "creating_worktree", label: "Creating worktree" },
	{ id: "registering", label: "Registering workspace" },
] as const;

const createProgress = new Map<string, ProgressState>();

function setProgress(pendingId: string, activeStepId: string): void {
	let reachedActive = false;
	const steps: ProgressStep[] = STEP_DEFINITIONS.map((def) => {
		if (def.id === activeStepId) {
			reachedActive = true;
			return { id: def.id, label: def.label, status: "active" as const };
		}
		if (!reachedActive) {
			return { id: def.id, label: def.label, status: "done" as const };
		}
		return { id: def.id, label: def.label, status: "pending" as const };
	});
	createProgress.set(pendingId, { steps, updatedAt: Date.now() });
}

function clearProgress(pendingId: string): void {
	createProgress.delete(pendingId);
}

function sweepStaleProgress(): void {
	const cutoff = Date.now() - 5 * 60 * 1000;
	for (const [id, entry] of createProgress) {
		if (entry.updatedAt < cutoff) createProgress.delete(id);
	}
}

// ── Helpers ──────────────────────────────────────────────────────────

function safeResolveWorktreePath(repoPath: string, branchName: string): string {
	const worktreesRoot = resolve(repoPath, ".worktrees");
	const worktreePath = resolve(worktreesRoot, branchName);
	if (
		worktreePath !== worktreesRoot &&
		!worktreePath.startsWith(worktreesRoot + sep)
	) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `Invalid branch name: path traversal detected (${branchName})`,
		});
	}
	return worktreePath;
}

async function resolveGithubRepo(
	ctx: HostServiceContext,
	projectId: string,
): Promise<{ owner: string; name: string }> {
	const cloudProject = await ctx.api.v2Project.get.query({
		organizationId: ctx.organizationId,
		id: projectId,
	});
	const repo = cloudProject.githubRepository;
	if (!repo?.owner || !repo?.name) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Project has no linked GitHub repository",
		});
	}
	return { owner: repo.owner, name: repo.name };
}

import { normalizeGitHubQuery } from "./normalize-github-query";

async function listBranchNames(
	ctx: HostServiceContext,
	repoPath: string,
): Promise<string[]> {
	const git = await ctx.git(repoPath);
	try {
		const raw = await git.raw([
			"for-each-ref",
			"--sort=-committerdate",
			"--format=%(refname:short)",
			"refs/heads/",
			"refs/remotes/origin/",
		]);
		const names = new Set<string>();
		for (const line of raw.trim().split("\n").filter(Boolean)) {
			let name = line;
			if (name.startsWith("origin/")) name = name.slice("origin/".length);
			if (name !== "HEAD") names.add(name);
		}
		return Array.from(names);
	} catch {
		return [];
	}
}

// ── Router ───────────────────────────────────────────────────────────

export const workspaceCreationRouter = router({
	getContext: protectedProcedure
		.input(z.object({ projectId: z.string() }))
		.query(async ({ ctx, input }) => {
			const localProject = ctx.db.query.projects
				.findFirst({ where: eq(projects.id, input.projectId) })
				.sync();

			if (!localProject) {
				return {
					projectId: input.projectId,
					hasLocalRepo: false,
					defaultBranch: null as string | null,
				};
			}

			const git = await ctx.git(localProject.repoPath);
			let defaultBranch: string | null = null;
			try {
				const originHead = await git.raw([
					"symbolic-ref",
					"refs/remotes/origin/HEAD",
					"--short",
				]);
				defaultBranch = originHead.trim().replace("origin/", "");
			} catch {
				defaultBranch = "main";
			}

			return {
				projectId: input.projectId,
				hasLocalRepo: true,
				defaultBranch,
			};
		}),

	searchBranches: protectedProcedure
		.input(
			z.object({
				projectId: z.string(),
				query: z.string().optional(),
				limit: z.number().min(1).max(500).optional(),
			}),
		)
		.query(async ({ ctx, input }) => {
			const localProject = ctx.db.query.projects
				.findFirst({ where: eq(projects.id, input.projectId) })
				.sync();

			if (!localProject) {
				return {
					defaultBranch: null as string | null,
					branches: [] as Array<{
						name: string;
						lastCommitDate: number;
						isLocal: boolean;
						hasWorkspace: boolean;
					}>,
				};
			}

			const git = await ctx.git(localProject.repoPath);

			let defaultBranch: string | null = null;
			try {
				const originHead = await git.raw([
					"symbolic-ref",
					"refs/remotes/origin/HEAD",
					"--short",
				]);
				defaultBranch = originHead.trim().replace("origin/", "");
			} catch {
				defaultBranch = "main";
			}

			const localBranchNames = new Set<string>();
			try {
				const raw = await git.raw([
					"branch",
					"--list",
					"--format=%(refname:short)",
				]);
				for (const name of raw.trim().split("\n").filter(Boolean)) {
					localBranchNames.add(name);
				}
			} catch {
				// ignore
			}

			type BranchInfo = {
				name: string;
				lastCommitDate: number;
				isLocal: boolean;
			};
			const branchMap = new Map<string, BranchInfo>();
			try {
				const raw = await git.raw([
					"for-each-ref",
					"--sort=-committerdate",
					"--format=%(refname:short)\t%(committerdate:unix)",
					"refs/heads/",
					"refs/remotes/origin/",
				]);
				for (const line of raw.trim().split("\n").filter(Boolean)) {
					const [rawRef, ts] = line.split("\t");
					if (!rawRef) continue;
					let name = rawRef;
					if (name.startsWith("origin/")) name = name.slice("origin/".length);
					if (name === "HEAD") continue;
					if (!branchMap.has(name)) {
						branchMap.set(name, {
							name,
							lastCommitDate: Number.parseInt(ts ?? "0", 10),
							isLocal: localBranchNames.has(name),
						});
					}
				}
			} catch {
				// ignore
			}

			let branches = Array.from(branchMap.values());

			if (input.query) {
				const q = input.query.toLowerCase();
				branches = branches.filter((b) => b.name.toLowerCase().includes(q));
			}

			branches = branches.slice(0, input.limit ?? 200);

			const localWorkspaceBranches = new Set(
				ctx.db
					.select()
					.from(workspaces)
					.where(eq(workspaces.projectId, input.projectId))
					.all()
					.map((w) => w.branch),
			);

			return {
				defaultBranch,
				branches: branches.map((b) => ({
					...b,
					hasWorkspace: localWorkspaceBranches.has(b.name),
				})),
			};
		}),

	/**
	 * Create a new workspace. Always creates — never opens an existing one.
	 * Branch name is sanitized and deduplicated server-side.
	 */
	getProgress: protectedProcedure
		.input(z.object({ pendingId: z.string() }))
		.query(({ input }) => {
			sweepStaleProgress();
			const entry = createProgress.get(input.pendingId);
			return entry ? { steps: entry.steps } : null;
		}),

	create: protectedProcedure
		.input(
			z.object({
				pendingId: z.string(),
				projectId: z.string(),
				names: z.object({
					workspaceName: z.string(),
					branchName: z.string(),
				}),
				composer: z.object({
					prompt: z.string().optional(),
					baseBranch: z.string().optional(),
					runSetupScript: z.boolean().optional(),
				}),
				linkedContext: z
					.object({
						internalIssueIds: z.array(z.string()).optional(),
						githubIssueUrls: z.array(z.string()).optional(),
						linkedPrUrl: z.string().optional(),
						attachments: z
							.array(
								z.object({
									data: z.string(),
									mediaType: z.string(),
									filename: z.string().optional(),
								}),
							)
							.optional(),
					})
					.optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const deviceClientId = getHashedDeviceId();
			const deviceName = getDeviceName();
			setProgress(input.pendingId, "ensuring_repo");

			// 1. Resolve / ensure project locally
			let localProject = ctx.db.query.projects
				.findFirst({ where: eq(projects.id, input.projectId) })
				.sync();

			if (!localProject) {
				const cloudProject = await ctx.api.v2Project.get.query({
					organizationId: ctx.organizationId,
					id: input.projectId,
				});

				if (!cloudProject.repoCloneUrl) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: "Project has no linked GitHub repository — cannot clone",
					});
				}

				const homeDir = process.env.HOME || process.env.USERPROFILE || "/tmp";
				const repoPath = join(homeDir, ".superset", "repos", input.projectId);

				if (!existsSync(repoPath)) {
					mkdirSync(dirname(repoPath), { recursive: true });
					await simpleGit().clone(cloudProject.repoCloneUrl, repoPath);
				}

				localProject = ctx.db
					.insert(projects)
					.values({ id: input.projectId, repoPath })
					.returning()
					.get();
			}

			setProgress(input.pendingId, "creating_worktree");

			// 2. Validate + deduplicate branch name
			// Renderer already sanitized/slugified. Host-service only validates
			// and deduplicates — doesn't re-sanitize (which would strip case,
			// slashes, etc. the user intended).
			if (!input.names.branchName.trim()) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Branch name is empty",
				});
			}

			const existingBranches = await listBranchNames(
				ctx,
				localProject.repoPath,
			);
			const branchName = deduplicateBranchName(
				input.names.branchName,
				existingBranches,
			);

			// 3. Create worktree
			const worktreePath = safeResolveWorktreePath(
				localProject.repoPath,
				branchName,
			);

			const git = await ctx.git(localProject.repoPath);

			// Resolve the best start point: prefer origin/<branch> for freshest code,
			// fall back to local branch, then HEAD.
			const { ref: startPoint, resolvedFrom } = await resolveStartPoint(
				git,
				input.composer.baseBranch,
			);
			console.log(
				`[workspaceCreation.create] start point resolved: ${startPoint} (${resolvedFrom})`,
			);

			// If we resolved to a remote-tracking ref, fetch just that branch
			// to ensure we're branching from the latest remote state.
			if (startPoint.startsWith("origin/")) {
				const remoteBranch = startPoint.replace(/^origin\//, "");
				try {
					await git.fetch(["origin", remoteBranch, "--quiet", "--no-tags"]);
				} catch (err) {
					console.warn(
						`[workspaceCreation.create] fetch origin ${remoteBranch} failed, proceeding with local ref:`,
						err,
					);
				}
			}

			// Always create a new branch — never check out an existing one.
			// Checking out existing branches is a separate intent (e.g. createFromPr).
			// --no-track prevents the new branch from tracking the remote ref
			// (e.g. origin/main); push.autoSetupRemote handles first-push tracking.
			await git.raw([
				"worktree",
				"add",
				"--no-track",
				"-b",
				branchName,
				worktreePath,
				startPoint,
			]);

			setProgress(input.pendingId, "registering");

			// 4. Register cloud workspace row
			const rollbackWorktree = async () => {
				try {
					await git.raw(["worktree", "remove", worktreePath]);
				} catch (err) {
					console.warn(
						"[workspaceCreation.create] failed to rollback worktree",
						{ worktreePath, err },
					);
				}
			};

			let host: { id: string };
			try {
				host = await ctx.api.device.ensureV2Host.mutate({
					organizationId: ctx.organizationId,
					machineId: deviceClientId,
					name: deviceName,
				});
			} catch (err) {
				console.error("[workspaceCreation.create] ensureV2Host failed", err);
				clearProgress(input.pendingId);
				await rollbackWorktree();
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: `Failed to register host: ${err instanceof Error ? err.message : String(err)}`,
				});
			}

			const cloudRow = await ctx.api.v2Workspace.create
				.mutate({
					organizationId: ctx.organizationId,
					projectId: input.projectId,
					name: input.names.workspaceName,
					branch: branchName,
					hostId: host.id,
				})
				.catch(async (err) => {
					console.error(
						"[workspaceCreation.create] v2Workspace.create failed",
						err,
					);
					clearProgress(input.pendingId);
					await rollbackWorktree();
					throw err;
				});

			if (!cloudRow) {
				clearProgress(input.pendingId);
				await rollbackWorktree();
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Cloud workspace create returned no row",
				});
			}

			ctx.db
				.insert(workspaces)
				.values({
					id: cloudRow.id,
					projectId: input.projectId,
					worktreePath,
					branch: branchName,
				})
				.run();

			// 5. Create setup terminal if setup script exists
			const terminals: Array<{
				id: string;
				role: string;
				label: string;
			}> = [];
			const warnings: string[] = [];

			if (input.composer.runSetupScript) {
				const setupScriptPath = join(worktreePath, ".superset", "setup.sh");
				if (existsSync(setupScriptPath)) {
					const terminalId = crypto.randomUUID();
					const result = createTerminalSessionInternal({
						terminalId,
						workspaceId: cloudRow.id,
						db: ctx.db,
						initialCommand: `bash "${setupScriptPath}"`,
					});
					if ("error" in result) {
						warnings.push(`Failed to start setup terminal: ${result.error}`);
					} else {
						terminals.push({
							id: terminalId,
							role: "setup",
							label: "Workspace Setup",
						});
					}
				}
			}

			clearProgress(input.pendingId);

			return {
				workspace: cloudRow,
				terminals,
				warnings,
			};
		}),

	// ── GitHub endpoints for the link commands ────────────────────────

	searchGitHubIssues: protectedProcedure
		.input(
			z.object({
				projectId: z.string(),
				query: z.string().optional(),
				limit: z.number().min(1).max(100).optional(),
			}),
		)
		.query(async ({ ctx, input }) => {
			const repo = await resolveGithubRepo(ctx, input.projectId);
			const limit = input.limit ?? 30;

			// Normalize the query: detect GitHub issue URLs, strip `#` shorthand
			const raw = input.query?.trim() ?? "";
			const normalized = normalizeGitHubQuery(raw, repo, "issue");

			if (normalized.repoMismatch) {
				return {
					issues: [],
					repoMismatch: `${repo.owner}/${repo.name}`,
				};
			}

			const effectiveQuery = normalized.query;
			const octokit = await ctx.github();

			try {
				// Direct lookup by issue number (from URL paste or `#123` shorthand)
				if (normalized.isDirectLookup) {
					const issueNumber = Number.parseInt(effectiveQuery, 10);
					const { data: issue } = await octokit.issues.get({
						owner: repo.owner,
						repo: repo.name,
						issue_number: issueNumber,
					});
					// issues.get returns PRs too — filter them out
					if (issue.pull_request) {
						return { issues: [] };
					}
					return {
						issues: [
							{
								issueNumber: issue.number,
								title: issue.title,
								url: issue.html_url,
								state: issue.state,
								authorLogin: issue.user?.login ?? null,
							},
						],
					};
				}

				const q =
					`repo:${repo.owner}/${repo.name} is:issue ${effectiveQuery}`.trim();
				const { data } = await octokit.search.issuesAndPullRequests({
					q,
					per_page: limit,
					sort: "updated",
					order: "desc",
				});
				return {
					issues: data.items
						.filter((item) => !item.pull_request)
						.map((item) => ({
							issueNumber: item.number,
							title: item.title,
							url: item.html_url,
							state: item.state,
							authorLogin: item.user?.login ?? null,
						})),
				};
			} catch (err) {
				console.warn("[workspaceCreation.searchGitHubIssues] failed", err);
				return { issues: [] };
			}
		}),

	searchPullRequests: protectedProcedure
		.input(
			z.object({
				projectId: z.string(),
				query: z.string().optional(),
				limit: z.number().min(1).max(100).optional(),
			}),
		)
		.query(async ({ ctx, input }) => {
			const repo = await resolveGithubRepo(ctx, input.projectId);
			const limit = input.limit ?? 30;

			// Normalize the query: detect GitHub PR URLs, strip `#` shorthand
			const raw = input.query?.trim() ?? "";
			const normalized = normalizeGitHubQuery(raw, repo, "pull");

			if (normalized.repoMismatch) {
				return {
					pullRequests: [],
					repoMismatch: `${repo.owner}/${repo.name}`,
				};
			}

			const effectiveQuery = normalized.query;
			const octokit = await ctx.github();

			try {
				// Direct lookup by PR number (from URL paste or `#123` shorthand)
				if (normalized.isDirectLookup) {
					const prNumber = Number.parseInt(effectiveQuery, 10);
					const { data: pr } = await octokit.pulls.get({
						owner: repo.owner,
						repo: repo.name,
						pull_number: prNumber,
					});
					return {
						pullRequests: [
							{
								prNumber: pr.number,
								title: pr.title,
								url: pr.html_url,
								state: pr.state,
								isDraft: pr.draft ?? false,
								authorLogin: pr.user?.login ?? null,
							},
						],
					};
				}

				const q =
					`repo:${repo.owner}/${repo.name} is:pr ${effectiveQuery}`.trim();
				const { data } = await octokit.search.issuesAndPullRequests({
					q,
					per_page: limit,
					sort: "updated",
					order: "desc",
				});
				return {
					pullRequests: data.items
						.filter((item) => item.pull_request)
						.map((item) => ({
							prNumber: item.number,
							title: item.title,
							url: item.html_url,
							state: item.state,
							isDraft: item.draft ?? false,
							authorLogin: item.user?.login ?? null,
						})),
				};
			} catch (err) {
				console.warn("[workspaceCreation.searchPullRequests] failed", err);
				return { pullRequests: [] };
			}
		}),

	getGitHubIssueContent: protectedProcedure
		.input(
			z.object({
				projectId: z.string(),
				issueNumber: z.number().int().positive(),
			}),
		)
		.query(async ({ ctx, input }) => {
			const repo = await resolveGithubRepo(ctx, input.projectId);
			const octokit = await ctx.github();
			try {
				const { data } = await octokit.issues.get({
					owner: repo.owner,
					repo: repo.name,
					issue_number: input.issueNumber,
				});
				return {
					number: data.number,
					title: data.title,
					body: data.body ?? "",
					url: data.html_url,
					state: data.state,
					author: data.user?.login ?? null,
					createdAt: data.created_at,
					updatedAt: data.updated_at,
				};
			} catch (err) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: `Failed to fetch issue #${input.issueNumber}: ${err instanceof Error ? err.message : String(err)}`,
				});
			}
		}),
});
