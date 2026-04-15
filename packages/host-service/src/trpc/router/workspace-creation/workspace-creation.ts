import { existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { getDeviceName, getHashedDeviceId } from "@superset/shared/device-info";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import simpleGit from "simple-git";
import { z } from "zod";
import { projects, workspaces } from "../../../db/schema";
import {
	asLocalRef,
	asRemoteRef,
	type ResolvedRef,
	resolveDefaultBranchName,
	resolveRef,
} from "../../../runtime/git/refs";
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

// ── searchBranches helpers ──────────────────────────────────────────

type BranchRow = {
	name: string;
	lastCommitDate: number;
	isLocal: boolean;
	isRemote: boolean;
	recency: number | null;
	worktreePath: string | null;
	// True when a workspaces row exists for this (project, branch) on this
	// host. A worktree can exist on disk without one (orphan); the Worktree
	// tab distinguishes Open (hasWorkspace) from Create (orphan adopt).
	hasWorkspace: boolean;
	isCheckedOut: boolean;
};

function encodeCursor(offset: number): string {
	return Buffer.from(JSON.stringify({ offset })).toString("base64url");
}

function decodeCursor(cursor: string | undefined): number {
	if (!cursor) return 0;
	try {
		const parsed = JSON.parse(
			Buffer.from(cursor, "base64url").toString("utf8"),
		);
		const offset = typeof parsed.offset === "number" ? parsed.offset : 0;
		return Math.max(0, offset);
	} catch {
		return 0;
	}
}

// 30s TTL on `git fetch` per project — keeps rapid searches from thrashing.
const REMOTE_REFETCH_TTL_MS = 30_000;
const lastRemoteRefetch = new Map<string, number>();

function shouldRefetchRemote(projectId: string): boolean {
	const last = lastRemoteRefetch.get(projectId) ?? 0;
	return Date.now() - last >= REMOTE_REFETCH_TTL_MS;
}

function markRefetchRemote(projectId: string): void {
	lastRemoteRefetch.set(projectId, Date.now());
}

type GitClient = Awaited<ReturnType<HostServiceContext["git"]>>;

async function listWorktreeBranches(
	git: GitClient,
	repoPath: string,
): Promise<{
	// Superset-managed worktrees only (under <repoPath>/.worktrees/).
	// These count as "has a workspace" for the picker.
	worktreeMap: Map<string, string>;
	// Every branch checked out in any git worktree, including the primary
	// working tree. Used to disable the Checkout action when a branch is
	// already in use elsewhere — `git worktree add <path> <branch>` would fail.
	checkedOutBranches: Set<string>;
}> {
	const worktreesRoot = resolve(repoPath, ".worktrees");
	const worktreeMap = new Map<string, string>();
	const checkedOutBranches = new Set<string>();
	try {
		const raw = await git.raw(["worktree", "list", "--porcelain"]);
		let currentPath: string | null = null;
		for (const line of raw.split("\n")) {
			if (line.startsWith("worktree ")) {
				currentPath = line.slice("worktree ".length).trim();
			} else if (line.startsWith("branch refs/heads/") && currentPath) {
				const branch = line.slice("branch refs/heads/".length).trim();
				if (!branch) continue;
				checkedOutBranches.add(branch);
				// Superset-managed worktrees live under <repoPath>/.worktrees/<name>;
				// the primary working tree is at repoPath itself and skipped here.
				if (currentPath.startsWith(worktreesRoot + sep)) {
					worktreeMap.set(branch, currentPath);
				}
			} else if (line === "") {
				currentPath = null;
			}
		}
	} catch (err) {
		console.warn(
			"[workspace-creation] git worktree list failed; treating no branches as checked out:",
			err,
		);
	}
	return { worktreeMap, checkedOutBranches };
}

// Parses `git log -g` to return {branchName: ordinal} where 0 = most recent.
async function getRecentBranchOrder(
	git: GitClient,
	limit: number,
): Promise<Map<string, number>> {
	const order = new Map<string, number>();
	try {
		const raw = await git.raw([
			"log",
			"-g",
			"--pretty=%gs",
			"--grep-reflog=checkout:",
			"-n",
			"500",
			"HEAD",
			"--",
		]);
		const re = /^checkout: moving from .+ to (.+)$/;
		for (const line of raw.split("\n")) {
			const m = re.exec(line);
			if (!m?.[1]) continue;
			const name = m[1].trim();
			if (!name || /^[0-9a-f]{7,40}$/.test(name)) continue; // skip detached SHAs
			if (!order.has(name)) {
				order.set(name, order.size);
				if (order.size >= limit) break;
			}
		}
	} catch {
		// ignore (e.g. unborn branch)
	}
	return order;
}

async function listBranchNames(
	ctx: HostServiceContext,
	repoPath: string,
): Promise<string[]> {
	const git = await ctx.git(repoPath);
	try {
		const raw = await git.raw([
			"for-each-ref",
			"--sort=-committerdate",
			"--format=%(refname)",
			"refs/heads/",
			"refs/remotes/origin/",
		]);
		const names = new Set<string>();
		for (const refname of raw.trim().split("\n").filter(Boolean)) {
			// Use the full refname's structural prefix to classify (safe — a
			// branch name can't contain `refs/heads/`). Stripping `origin/`
			// from the SHORT name would misclassify a local branch named
			// `origin/foo`. See GIT_REFS.md.
			let name: string;
			if (refname.startsWith("refs/heads/")) {
				name = refname.slice("refs/heads/".length);
			} else if (refname.startsWith("refs/remotes/origin/")) {
				name = refname.slice("refs/remotes/origin/".length);
			} else {
				continue;
			}
			if (name && name !== "HEAD") names.add(name);
		}
		return Array.from(names);
	} catch {
		return [];
	}
}

/**
 * Build a `ResolvedRef` directly from the picker-supplied hint without
 * probing git. Used when the caller already knows whether the row was
 * local or remote-only — the picker has this info per row.
 */
function buildStartPointFromHint(
	branch: string,
	source: "local" | "remote-tracking",
): ResolvedRef {
	if (source === "local") {
		return {
			kind: "local",
			fullRef: asLocalRef(branch),
			shortName: branch,
		};
	}
	const remote = "origin";
	return {
		kind: "remote-tracking",
		fullRef: asRemoteRef(remote, branch),
		shortName: branch,
		remote,
		remoteShortName: `${remote}/${branch}`,
	};
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
			const defaultBranch: string | null = await resolveDefaultBranchName(git);

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
				cursor: z.string().optional(),
				limit: z.number().min(1).max(200).optional(),
				refresh: z.boolean().optional(),
				filter: z.enum(["branch", "worktree"]).optional(),
			}),
		)
		.query(async ({ ctx, input }) => {
			const limit = input.limit ?? 50;
			const offset = decodeCursor(input.cursor);

			const localProject = ctx.db.query.projects
				.findFirst({ where: eq(projects.id, input.projectId) })
				.sync();

			if (!localProject) {
				return {
					defaultBranch: null as string | null,
					items: [] as BranchRow[],
					nextCursor: null as string | null,
				};
			}

			const git = await ctx.git(localProject.repoPath);

			// Honor `refresh` only if TTL elapsed — prevents thrashing `git fetch`
			// on every keystroke when the client tags first-page requests.
			if (input.refresh && shouldRefetchRemote(input.projectId)) {
				markRefetchRemote(input.projectId);
				try {
					await git.fetch(["--prune", "--quiet", "--no-tags"]);
				} catch {
					// offline — proceed with cached refs
				}
			}

			const defaultBranch: string | null = await resolveDefaultBranchName(git);

			const { worktreeMap, checkedOutBranches } = await listWorktreeBranches(
				git,
				localProject.repoPath,
			);
			const recencyMap = await getRecentBranchOrder(git, 30);

			// Branches that already have a workspace row on this host. The
			// Worktree tab uses this to distinguish Open (has row) from
			// Create (orphan worktree — worktree on disk, no workspace row).
			const workspaceBranches = new Set<string>(
				ctx.db
					.select()
					.from(workspaces)
					.where(eq(workspaces.projectId, input.projectId))
					.all()
					.map((w) => w.branch)
					.filter((b): b is string => !!b),
			);

			type BranchAccum = {
				name: string;
				lastCommitDate: number;
				isLocal: boolean;
				isRemote: boolean;
			};
			const branchMap = new Map<string, BranchAccum>();
			try {
				const raw = await git.raw([
					"for-each-ref",
					"--sort=-committerdate",
					"--format=%(refname)\t%(refname:short)\t%(committerdate:unix)",
					"refs/heads/",
					"refs/remotes/origin/",
				]);
				for (const line of raw.trim().split("\n").filter(Boolean)) {
					const [refname, _short, ts] = line.split("\t");
					if (!refname) continue;

					// Derive isLocal/isRemote and the user-facing name from
					// the FULL refname's structural prefix — never from the
					// short form. See GIT_REFS.md.
					let name: string;
					let isLocal = false;
					let isRemote = false;
					if (refname.startsWith("refs/heads/")) {
						name = refname.slice("refs/heads/".length);
						isLocal = true;
					} else if (refname.startsWith("refs/remotes/origin/")) {
						name = refname.slice("refs/remotes/origin/".length);
						isRemote = true;
					} else {
						continue;
					}
					if (!name || name === "HEAD") continue;

					const existing = branchMap.get(name);
					if (existing) {
						existing.isLocal = existing.isLocal || isLocal;
						existing.isRemote = existing.isRemote || isRemote;
					} else {
						branchMap.set(name, {
							name,
							lastCommitDate: Number.parseInt(ts ?? "0", 10),
							isLocal,
							isRemote,
						});
					}
				}
			} catch {
				// ignore
			}

			let branches = Array.from(branchMap.values());

			if (input.filter === "worktree") {
				branches = branches.filter((b) => worktreeMap.has(b.name));
			} else {
				// default "branch": any branch (local or remote) without a worktree
				branches = branches.filter((b) => !worktreeMap.has(b.name));
			}

			if (input.query) {
				const q = input.query.toLowerCase();
				branches = branches.filter((b) => b.name.toLowerCase().includes(q));
			}

			// Sort: default → reflog-recent → everything else by committerdate desc.
			// for-each-ref already emits in committerdate-desc order, so the tail
			// of this sort is a stable no-op for branches outside default/recency.
			branches.sort((a, b) => {
				const aDefault = a.name === defaultBranch ? 0 : 1;
				const bDefault = b.name === defaultBranch ? 0 : 1;
				if (aDefault !== bDefault) return aDefault - bDefault;

				const aRecency = recencyMap.get(a.name);
				const bRecency = recencyMap.get(b.name);
				if (aRecency !== undefined && bRecency !== undefined) {
					return aRecency - bRecency;
				}
				if (aRecency !== undefined) return -1;
				if (bRecency !== undefined) return 1;

				return b.lastCommitDate - a.lastCommitDate;
			});

			const page = branches.slice(offset, offset + limit);
			const hasMore = offset + limit < branches.length;
			const nextCursor = hasMore ? encodeCursor(offset + limit) : null;

			const items: BranchRow[] = page.map((b) => ({
				name: b.name,
				lastCommitDate: b.lastCommitDate,
				isLocal: b.isLocal,
				isRemote: b.isRemote,
				recency: recencyMap.get(b.name) ?? null,
				worktreePath: worktreeMap.get(b.name) ?? null,
				hasWorkspace: workspaceBranches.has(b.name),
				isCheckedOut: checkedOutBranches.has(b.name),
			}));

			return { defaultBranch, items, nextCursor };
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
					// Hint from the picker about which form of the base branch
					// was selected. When provided, the server uses it directly
					// instead of probing — avoids racing against stale cached
					// remote refs that could win in a re-resolve. See
					// `resolve-start-point.ts` for the fallback semantics.
					baseBranchSource: z.enum(["local", "remote-tracking"]).optional(),
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

			// Trust the picker's hint when provided: it knows whether the row
			// the user clicked was local or remote-only. Re-resolving here
			// races against stale cached refs (a workspace branch with an
			// incidental `refs/remotes/origin/<name>` cache would silently win).
			// Falls back to probing for callers that don't pass the hint.
			const startPoint =
				input.composer.baseBranch && input.composer.baseBranchSource
					? buildStartPointFromHint(
							input.composer.baseBranch,
							input.composer.baseBranchSource,
						)
					: await resolveStartPoint(git, input.composer.baseBranch);
			console.log(
				`[workspaceCreation.create] start point: ${startPoint.kind} (${
					input.composer.baseBranchSource ? "from hint" : "resolved"
				})`,
			);

			// If we resolved to a remote-tracking ref, fetch just that branch
			// to ensure we're branching from the latest remote state.
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
						`[workspaceCreation.create] fetch ${startPoint.remoteShortName} failed, proceeding with local ref:`,
						err,
					);
				}
			}

			// Always create a new branch — never check out an existing one.
			// Checking out existing branches is a separate intent (createFromPr,
			// or the picker's Check out action via the `checkout` procedure).
			// --no-track keeps `git pull` / ahead-behind counts from treating
			// the start point as the branch's home. Push targeting is handled
			// separately by push.autoSetupRemote (set below).
			const startPointArg =
				startPoint.kind === "head" ? "HEAD" : startPoint.shortName;
			await git.raw([
				"worktree",
				"add",
				"--no-track",
				"-b",
				branchName,
				worktreePath,
				startPoint.kind === "remote-tracking"
					? startPoint.remoteShortName
					: startPointArg,
			]);

			// Enable autoSetupRemote so the first terminal `git push` creates
			// origin/<branchName> and sets it as upstream without requiring
			// `-u`. Note: `--local` in a linked worktree writes to the shared
			// repo config, so this applies repo-wide — intentional, every
			// workspace worktree wants the same ergonomics. Safe against
			// wrong-upstream targeting because --no-track above guarantees no
			// upstream exists at first push, so auto-create always wins and
			// always uses the branch's own name (never the base branch).
			await git
				.raw([
					"-C",
					worktreePath,
					"config",
					"--local",
					"push.autoSetupRemote",
					"true",
				])
				.catch((err) => {
					console.warn(
						"[workspaceCreation.create] failed to set push.autoSetupRemote:",
						err,
					);
				});

			// Record the base branch in git config so the Changes tab knows what
			// to compare against on first open. startPoint.shortName is the ref
			// we actually forked from (user selection, resolved against local /
			// remote). Skipped for "head" start point — no meaningful base.
			if (startPoint.kind !== "head") {
				await git
					.raw(["config", `branch.${branchName}.base`, startPoint.shortName])
					.catch((err) => {
						console.warn(
							`[workspaceCreation.create] failed to record base branch ${startPoint.shortName}:`,
							err,
						);
					});
			}

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

	/**
	 * Check out an existing branch into a new workspace. Unlike `create`, this
	 * reuses the branch name as-is (no new branch) — `git worktree add` without
	 * `-b`. Fails if the branch is already checked out elsewhere.
	 */
	checkout: protectedProcedure
		.input(
			z.object({
				pendingId: z.string(),
				projectId: z.string(),
				workspaceName: z.string(),
				branch: z.string(),
				composer: z.object({
					prompt: z.string().optional(),
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

			// 1. Ensure project locally (clone if missing) — same as create
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

			const branch = input.branch.trim();
			if (!branch) {
				clearProgress(input.pendingId);
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Branch name is empty",
				});
			}

			let worktreePath: string;
			try {
				worktreePath = safeResolveWorktreePath(localProject.repoPath, branch);
			} catch (err) {
				clearProgress(input.pendingId);
				throw err;
			}
			const git = await ctx.git(localProject.repoPath);

			// Resolve via the discriminated-ref helper so we don't infer kind
			// from a refname string (a local branch named `origin/foo` would
			// otherwise be misclassified). See GIT_REFS.md.
			const resolved = await resolveRef(git, branch);
			if (!resolved || resolved.kind === "head" || resolved.kind === "tag") {
				clearProgress(input.pendingId);
				throw new TRPCError({
					code: "BAD_REQUEST",
					message:
						resolved?.kind === "tag"
							? `"${branch}" is a tag, not a branch — cannot check out into a workspace`
							: `Branch "${branch}" does not exist locally or on origin`,
				});
			}

			if (resolved.kind === "remote-tracking") {
				try {
					await git.fetch([
						resolved.remote,
						resolved.shortName,
						"--quiet",
						"--no-tags",
					]);
				} catch (err) {
					console.warn(
						`[workspaceCreation.checkout] fetch ${resolved.remoteShortName} failed:`,
						err,
					);
				}
			}

			try {
				// For a remote-only branch, create a local tracking branch
				// explicitly. `git worktree add <path> origin/<branch>` without
				// --track/-b produces a detached HEAD because the fully-qualified
				// ref is treated as a commit-ish, not a branch shorthand.
				await git.raw(
					resolved.kind === "remote-tracking"
						? [
								"worktree",
								"add",
								"--track",
								"-b",
								branch,
								worktreePath,
								resolved.remoteShortName,
							]
						: ["worktree", "add", worktreePath, resolved.shortName],
				);
			} catch (err) {
				clearProgress(input.pendingId);
				const message =
					err instanceof Error ? err.message : "Failed to add worktree";
				// Most common cause here is "branch already checked out elsewhere".
				// Client disables the button for known cases via isCheckedOut, but
				// we still get here for races.
				throw new TRPCError({ code: "CONFLICT", message });
			}

			// Enable autoSetupRemote so the first terminal `git push` on a
			// local-only branch creates origin/<branch> without requiring -u.
			// Branches checked out from a remote already have upstream set
			// via --track above, so this config is a no-op for them.
			// `--local` in a linked worktree writes to the shared repo config,
			// so this applies repo-wide — intentional.
			await git
				.raw([
					"-C",
					worktreePath,
					"config",
					"--local",
					"push.autoSetupRemote",
					"true",
				])
				.catch((err) => {
					console.warn(
						"[workspaceCreation.checkout] failed to set push.autoSetupRemote:",
						err,
					);
				});

			setProgress(input.pendingId, "registering");

			const rollbackWorktree = async () => {
				try {
					await git.raw(["worktree", "remove", worktreePath]);
				} catch (err) {
					console.warn(
						"[workspaceCreation.checkout] failed to rollback worktree",
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
				console.error("[workspaceCreation.checkout] ensureV2Host failed", err);
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
					name: input.workspaceName,
					branch,
					hostId: host.id,
				})
				.catch(async (err) => {
					console.error(
						"[workspaceCreation.checkout] v2Workspace.create failed",
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
					branch,
				})
				.run();

			const terminals: Array<{ id: string; role: string; label: string }> = [];
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

			return { workspace: cloudRow, terminals, warnings };
		}),

	/**
	 * Adopt an existing git worktree as a workspace. Used when the Worktree
	 * tab surfaces a branch whose `.worktrees/<branch>` directory exists on
	 * disk but has no corresponding workspaces row (e.g. created by an older
	 * flow, or partial create rollback). No git ops — just registers the
	 * cloud + local workspace row over the existing worktree path.
	 */
	adopt: protectedProcedure
		.input(
			z.object({
				projectId: z.string(),
				workspaceName: z.string(),
				branch: z.string(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const deviceClientId = getHashedDeviceId();
			const deviceName = getDeviceName();

			const localProject = ctx.db.query.projects
				.findFirst({ where: eq(projects.id, input.projectId) })
				.sync();
			if (!localProject) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Project is not set up locally",
				});
			}

			const branch = input.branch.trim();
			if (!branch) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Branch name is empty",
				});
			}

			const git = await ctx.git(localProject.repoPath);
			const { worktreeMap } = await listWorktreeBranches(
				git,
				localProject.repoPath,
			);
			const worktreePath = worktreeMap.get(branch);
			if (!worktreePath) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: `No existing worktree for branch "${branch}"`,
				});
			}

			// We used to short-circuit on an existing local `workspaces` row
			// (returning its id without calling cloud). That returned a
			// phantom id when the cloud row had been hard-deleted — the
			// picker would navigate to a workspace that no longer exists.
			// Always create a fresh cloud row; if a stale local row leftover
			// from a prior delete exists, replace it below. Proper host-side
			// cleanup on delete is owned by the follow-up delete PR.
			const host = await ctx.api.device.ensureV2Host.mutate({
				organizationId: ctx.organizationId,
				machineId: deviceClientId,
				name: deviceName,
			});

			const cloudRow = await ctx.api.v2Workspace.create.mutate({
				organizationId: ctx.organizationId,
				projectId: input.projectId,
				name: input.workspaceName,
				branch,
				hostId: host.id,
			});

			if (!cloudRow) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Cloud workspace create returned no row",
				});
			}

			// Replace any stale local row for this (project, branch) — its
			// id likely points at a deleted cloud row. The new cloudRow.id
			// is the authoritative mapping.
			const stale = ctx.db
				.select()
				.from(workspaces)
				.where(eq(workspaces.projectId, input.projectId))
				.all()
				.find((w) => w.branch === branch);
			if (stale && stale.id !== cloudRow.id) {
				ctx.db.delete(workspaces).where(eq(workspaces.id, stale.id)).run();
			}

			ctx.db
				.insert(workspaces)
				.values({
					id: cloudRow.id,
					projectId: input.projectId,
					worktreePath,
					branch,
				})
				.run();

			return {
				workspace: cloudRow,
				terminals: [] as Array<{ id: string; role: string; label: string }>,
				warnings: [] as string[],
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
