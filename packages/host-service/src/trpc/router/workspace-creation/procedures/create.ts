import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { getHostId, getHostName } from "@superset/shared/host-info";
import { TRPCError } from "@trpc/server";
import { workspaces } from "../../../../db/schema";
import {
	asRemoteRef,
	type ResolvedRef,
	resolveDefaultBranchName,
	resolveUpstream,
} from "../../../../runtime/git/refs";
import { protectedProcedure } from "../../../index";
import { ensureMainWorkspace } from "../../project/utils/ensure-main-workspace";
import { createInputSchema } from "../schemas";
import { enablePushAutoSetupRemote } from "../shared/git-config";
import { requireLocalProject } from "../shared/local-project";
import { clearProgress, setProgress } from "../shared/progress-store";
import { startSetupTerminalIfPresent } from "../shared/setup-terminal";
import { buildStartPointFromHint } from "../shared/start-point";
import type { TerminalDescriptor } from "../shared/types";
import { safeResolveWorktreePath } from "../shared/worktree-paths";
import { applyAiWorkspaceRename } from "../utils/ai-workspace-names";
import { listBranchNames } from "../utils/list-branch-names";
import { resolveStartPoint } from "../utils/resolve-start-point";
import { deduplicateBranchName } from "../utils/sanitize-branch";

export const create = protectedProcedure
	.input(createInputSchema)
	.mutation(async ({ ctx, input }) => {
		const machineId = getHostId();
		const hostName = getHostName();
		setProgress(input.pendingId, "ensuring_repo");

		const localProject = requireLocalProject(ctx, input.projectId);
		await ensureMainWorkspace(ctx, input.projectId, localProject.repoPath);

		setProgress(input.pendingId, "creating_worktree");

		// Renderer already sanitized/slugified. Host-service only validates
		// and deduplicates — doesn't re-sanitize (which would strip case,
		// slashes, etc. the user intended).
		if (!input.names.branchName.trim()) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "Branch name is empty",
			});
		}

		const existingBranches = await listBranchNames(ctx, localProject.repoPath);
		const branchName = deduplicateBranchName(
			input.names.branchName,
			existingBranches,
		);

		const worktreePath = safeResolveWorktreePath(localProject.id, branchName);
		mkdirSync(dirname(worktreePath), { recursive: true });

		const git = await ctx.git(localProject.repoPath);

		// Trust the picker's hint when provided: it knows whether the row
		// the user clicked was local or remote-only. Re-resolving here
		// races against stale cached refs (a workspace branch with an
		// incidental `refs/remotes/origin/<name>` cache would silently win).
		// Falls back to probing for callers that don't pass the hint.
		let startPoint: ResolvedRef =
			input.composer.baseBranch && input.composer.baseBranchSource
				? buildStartPointFromHint(
						input.composer.baseBranch,
						input.composer.baseBranchSource,
					)
				: await resolveStartPoint(git, input.composer.baseBranch);

		// Local default branches are rarely fast-forwarded; swap to the
		// branch's configured upstream so we fork from the real tip, not a
		// stale local ref. Non-default branches stay local-first by design.
		if (startPoint.kind === "local") {
			const defaultBranchName = await resolveDefaultBranchName(git);
			if (startPoint.shortName === defaultBranchName) {
				const upstream = await resolveUpstream(git, defaultBranchName);
				if (upstream) {
					const remoteRef = asRemoteRef(upstream.remote, upstream.remoteBranch);
					const remoteExists = await git
						.raw(["rev-parse", "--verify", "--quiet", `${remoteRef}^{commit}`])
						.then(() => true)
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
		try {
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
		} catch (err) {
			clearProgress(input.pendingId);
			throw new TRPCError({
				code: "CONFLICT",
				message: err instanceof Error ? err.message : "Failed to add worktree",
			});
		}

		// Enable autoSetupRemote so the first terminal `git push` creates
		// origin/<branchName> and sets it as upstream without requiring
		// `-u`. Note: `--local` in a linked worktree writes to the shared
		// repo config, so this applies repo-wide — intentional, every
		// workspace worktree wants the same ergonomics. Safe against
		// wrong-upstream targeting because --no-track above guarantees no
		// upstream exists at first push, so auto-create always wins and
		// always uses the branch's own name (never the base branch).
		await enablePushAutoSetupRemote(
			git,
			worktreePath,
			"[workspaceCreation.create]",
		);

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

		const rollbackWorktree = async () => {
			try {
				await git.raw(["worktree", "remove", worktreePath]);
			} catch (err) {
				console.warn("[workspaceCreation.create] failed to rollback worktree", {
					worktreePath,
					err,
				});
			}
		};

		let host: { machineId: string };
		try {
			host = await ctx.api.host.ensure.mutate({
				organizationId: ctx.organizationId,
				machineId,
				name: hostName,
			});
		} catch (err) {
			console.error("[workspaceCreation.create] host.ensure failed", err);
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
				hostId: host.machineId,
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

		try {
			ctx.db
				.insert(workspaces)
				.values({
					id: cloudRow.id,
					projectId: input.projectId,
					worktreePath,
					branch: branchName,
				})
				.run();
		} catch (err) {
			console.error(
				"[workspaceCreation.create] local workspaces insert failed",
				err,
			);
			clearProgress(input.pendingId);
			await rollbackWorktree();
			await ctx.api.v2Workspace.delete
				.mutate({ id: cloudRow.id })
				.catch((cleanupErr) => {
					console.warn(
						"[workspaceCreation.create] failed to rollback cloud workspace",
						{ workspaceId: cloudRow.id, err: cleanupErr },
					);
				});
			throw new TRPCError({
				code: "INTERNAL_SERVER_ERROR",
				message: `Failed to persist workspace locally: ${err instanceof Error ? err.message : String(err)}`,
			});
		}

		// Fire-and-forget AI rename from the composer prompt. A single
		// structured-output call generates both a display title and a
		// kebab-case branch name, and we apply each independently.
		// Electric syncs updates to the renderer via v2_workspaces, so
		// the pending/workspace page updates in place once the model
		// responds.
		//
		// Name precedence (matches renderer `resolveNames`):
		//   1. user-typed title → skip AI rename (flag = false)
		//   2. friendly fallback + prompt → AI rename (this branch)
		//   3. friendly fallback, no prompt → keep fallback
		//
		// `expectedCurrentName` covers the race where a user edits the
		// title after create but before the AI response lands.
		const composerPrompt = input.composer.prompt?.trim();
		const allowAiRename = input.names.workspaceNameWasAutoGenerated !== false;
		if (composerPrompt && allowAiRename) {
			void applyAiWorkspaceRename({
				ctx,
				workspaceId: cloudRow.id,
				repoPath: localProject.repoPath,
				worktreePath,
				oldBranchName: branchName,
				oldWorkspaceName: input.names.workspaceName,
				prompt: composerPrompt,
			}).catch((err) => {
				console.warn(
					"[workspaceCreation.create] AI workspace rename failed",
					err,
				);
			});
		}

		const terminals: TerminalDescriptor[] = [];
		const warnings: string[] = [];

		if (input.composer.runSetupScript) {
			const { terminal, warning } = startSetupTerminalIfPresent({
				ctx,
				workspaceId: cloudRow.id,
				worktreePath,
			});
			if (warning) {
				warnings.push(warning);
			}
			if (terminal) {
				terminals.push(terminal);
			}
		}

		clearProgress(input.pendingId);

		return {
			workspace: cloudRow,
			terminals,
			warnings,
		};
	});
