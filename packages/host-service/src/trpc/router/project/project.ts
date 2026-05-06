import { basename, resolve as resolvePath } from "node:path";
import {
	type ParsedGitHubRemote,
	parseGitHubRemote,
} from "@superset/shared/github-remote";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import simpleGit from "simple-git";
import { z } from "zod";
import { projects, workspaces } from "../../../db/schema";
import { protectedProcedure, router } from "../../index";
import {
	createFromClone,
	createFromEmpty,
	createFromImportLocal,
	createFromTemplate,
} from "./handlers";
import { ensureMainWorkspace } from "./utils/ensure-main-workspace";
import { getGitHubRemotes } from "./utils/git-remote";
import { persistLocalProject } from "./utils/persist-project";
import {
	cloneRepoInto,
	type ResolvedRepo,
	resolveLocalRepo,
	resolveMatchingSlug,
} from "./utils/resolve-repo";

export const projectRouter = router({
	list: protectedProcedure.query(({ ctx }) => {
		return ctx.db
			.select({
				id: projects.id,
				repoPath: projects.repoPath,
				repoOwner: projects.repoOwner,
				repoName: projects.repoName,
				repoUrl: projects.repoUrl,
			})
			.from(projects)
			.all();
	}),

	get: protectedProcedure
		.input(z.object({ projectId: z.string().uuid() }))
		.query(({ ctx, input }) => {
			return (
				ctx.db
					.select({
						id: projects.id,
						repoPath: projects.repoPath,
						repoOwner: projects.repoOwner,
						repoName: projects.repoName,
						repoUrl: projects.repoUrl,
					})
					.from(projects)
					.where(eq(projects.id, input.projectId))
					.get() ?? null
			);
		}),

	findBackfillConflict: protectedProcedure
		.input(
			z.object({
				projectId: z.string().uuid(),
				repoPath: z.string().min(1),
			}),
		)
		.query(() => {
			// Multiple v2 projects may point at the same GitHub URL, so a matching
			// repo URL is no longer a conflict. Kept for backwards-compatible
			// clients while older settings screens still call the endpoint.
			return { conflict: null };
		}),

	findByPath: protectedProcedure
		.input(
			z.object({
				repoPath: z.string().min(1),
				/**
				 * Opt-in to the v1→v2 importer's discovery semantics: walk
				 * every GitHub remote on the repo (not just origin/first),
				 * try `expectedRemoteUrl` against cloud, and surface stale
				 * local-DB rows. Default `false` preserves the long-standing
				 * folder-first import behavior — local-DB hit short-circuits
				 * before any cloud call, and only the primary remote is
				 * cloud-queried.
				 */
				walkAllRemotes: z.boolean().optional(),
				/**
				 * Hint about the remote URL the caller *thinks* this project
				 * tracks (e.g. v1's recorded githubOwner). Only consulted
				 * when `walkAllRemotes` is true.
				 */
				expectedRemoteUrl: z.string().optional(),
			}),
		)
		.query(async ({ ctx, input }) => {
			const resolved = await resolveLocalRepo(input.repoPath);
			const gitRoot = resolved.repoPath;

			const expectedParsed =
				input.walkAllRemotes && input.expectedRemoteUrl
					? parseGitHubRemote(input.expectedRemoteUrl)
					: null;
			const expectedUrlLower = expectedParsed?.url.toLowerCase();
			const matches = (cloneUrl: string | null) =>
				!!expectedUrlLower &&
				!!cloneUrl &&
				cloneUrl.toLowerCase() === expectedUrlLower;

			interface Candidate {
				id: string;
				name: string;
				repoCloneUrl: string | null;
				source: "local-path" | "remote";
				matchesExpected: boolean;
				/** True when the cloud-URL loop returned this id, which means
				 *  it's reachable in cloud — lets us skip the per-id v2Project.get
				 *  staleness check. Internal; not part of the wire response. */
				cloudConfirmed: boolean;
				/** True when this v2 project is no longer reachable in cloud
				 *  (e.g. deleted) but a stale row still lives in this device's
				 *  local DB. Caller-side filter drops these. */
				staleLocalLink: boolean;
			}

			const localProject = ctx.db.query.projects
				.findFirst({ where: eq(projects.repoPath, gitRoot) })
				.sync();

			// Default behavior (folder-first import): local-DB hit wins,
			// otherwise one cloud query against origin/first. Preserves the
			// pre-importer-rewrite contract.
			if (!input.walkAllRemotes) {
				if (localProject) {
					return {
						candidates: [
							{
								id: localProject.id,
								name: localProject.repoName ?? basename(gitRoot),
								repoCloneUrl: localProject.repoUrl ?? null,
								source: "local-path" as const,
								matchesExpected: false,
								staleLocalLink: false,
							},
						],
						cloudErrors: [] as { url: string; message: string }[],
					};
				}
				const { parsed } = resolved;
				if (!parsed) return { candidates: [], cloudErrors: [] };
				try {
					const { candidates } =
						await ctx.api.v2Project.findByGitHubRemote.query({
							organizationId: ctx.organizationId,
							repoCloneUrl: parsed.url,
						});
					return {
						candidates: candidates.map((c) => ({
							id: c.id,
							name: c.name,
							repoCloneUrl: parsed.url,
							source: "remote" as const,
							matchesExpected: false,
							staleLocalLink: false,
						})),
						cloudErrors: [] as { url: string; message: string }[],
					};
				} catch (err) {
					return {
						candidates: [],
						cloudErrors: [
							{
								url: parsed.url,
								message: err instanceof Error ? err.message : String(err),
							},
						],
					};
				}
			}

			// walkAllRemotes branch — v1→v2 importer.
			const allRemotes = await getGitHubRemotes(simpleGit(gitRoot));

			const urlsToQuery = new Map<string, ParsedGitHubRemote>();
			for (const parsed of allRemotes.values()) {
				urlsToQuery.set(parsed.url.toLowerCase(), parsed);
			}
			if (expectedParsed) {
				urlsToQuery.set(expectedParsed.url.toLowerCase(), expectedParsed);
			}

			const byId = new Map<string, Candidate>();

			if (localProject) {
				byId.set(localProject.id, {
					id: localProject.id,
					name: localProject.repoName ?? basename(gitRoot),
					repoCloneUrl: localProject.repoUrl ?? null,
					source: "local-path",
					matchesExpected: matches(localProject.repoUrl ?? null),
					cloudConfirmed: false,
					staleLocalLink: false,
				});
			}

			// Cloud lookup for every URL we know about.
			const cloudErrors: { url: string; message: string }[] = [];
			for (const parsed of urlsToQuery.values()) {
				try {
					const { candidates } =
						await ctx.api.v2Project.findByGitHubRemote.query({
							organizationId: ctx.organizationId,
							repoCloneUrl: parsed.url,
						});
					for (const c of candidates) {
						const existing = byId.get(c.id);
						if (existing) {
							// Already have it from local-DB lookup; the cloud
							// confirms it's reachable, so keep `local-path`
							// source but populate matchesExpected if needed
							// and flip `cloudConfirmed` so we skip the post-
							// loop staleness round-trip.
							existing.matchesExpected =
								existing.matchesExpected || matches(parsed.url);
							existing.repoCloneUrl = existing.repoCloneUrl ?? parsed.url;
							existing.cloudConfirmed = true;
						} else {
							byId.set(c.id, {
								id: c.id,
								name: c.name,
								repoCloneUrl: parsed.url,
								source: "remote",
								matchesExpected: matches(parsed.url),
								cloudConfirmed: true,
								staleLocalLink: false,
							});
						}
					}
				} catch (err) {
					const message = err instanceof Error ? err.message : String(err);
					cloudErrors.push({ url: parsed.url, message });
					console.warn(
						"[project.findByPath] cloud findByGitHubRemote failed for",
						parsed.url,
						err,
					);
				}
			}

			// Detect stale local-DB row: returned by the path lookup but
			// cloud never confirmed it via any remote URL. Most likely the
			// cloud project was deleted by another device or user. Skip
			// when the cloud loop already saw this id (cloudConfirmed) —
			// no need for a second round-trip.
			if (localProject) {
				const candidate = byId.get(localProject.id);
				if (
					candidate &&
					candidate.source === "local-path" &&
					!candidate.cloudConfirmed
				) {
					try {
						await ctx.api.v2Project.get.query({
							organizationId: ctx.organizationId,
							id: localProject.id,
						});
					} catch (err) {
						// Only treat a confirmed not-found as stale. Transient
						// network/auth/5xx errors should leave the local link
						// intact and surface via cloudErrors instead, so we
						// don't drop a probably-still-valid candidate on a
						// blip.
						const code =
							typeof err === "object" && err !== null
								? ((err as { data?: { code?: string } }).data?.code ?? null)
								: null;
						if (code === "NOT_FOUND") {
							candidate.staleLocalLink = true;
						} else {
							cloudErrors.push({
								url: `v2Project.get(${localProject.id})`,
								message: err instanceof Error ? err.message : String(err),
							});
						}
					}
				}
			}

			// Sort: matchesExpected first, then alphabetic. Strip the
			// internal `cloudConfirmed` flag — it's a server-side
			// optimization, not part of the wire contract.
			const candidates = Array.from(byId.values())
				.filter((c) => !c.staleLocalLink)
				.sort((a, b) => {
					if (a.matchesExpected !== b.matchesExpected) {
						return a.matchesExpected ? -1 : 1;
					}
					return a.name.localeCompare(b.name);
				})
				.map(({ cloudConfirmed: _omit, ...rest }) => rest);

			// Caller surfaces this when there are no candidates and at least
			// one cloud query failed — so users see a clear "couldn't reach
			// cloud" instead of a misleading "Import" (which would create a
			// duplicate v2 project).
			return { candidates, cloudErrors };
		}),

	create: protectedProcedure
		.input(
			z.object({
				name: z.string().min(1),
				mode: z.discriminatedUnion("kind", [
					z.object({
						kind: z.literal("empty"),
						parentDir: z.string().min(1),
					}),
					z.object({
						kind: z.literal("clone"),
						parentDir: z.string().min(1),
						url: z.string().min(1),
					}),
					z.object({
						kind: z.literal("importLocal"),
						repoPath: z.string().min(1),
					}),
					z.object({
						kind: z.literal("template"),
						parentDir: z.string().min(1),
						templateId: z.string().min(1),
					}),
				]),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			switch (input.mode.kind) {
				case "empty":
					return createFromEmpty(ctx, {
						name: input.name,
						parentDir: input.mode.parentDir,
					});
				case "template":
					return createFromTemplate(ctx, {
						name: input.name,
						parentDir: input.mode.parentDir,
						templateId: input.mode.templateId,
					});
				case "clone":
					return createFromClone(ctx, {
						name: input.name,
						parentDir: input.mode.parentDir,
						url: input.mode.url,
					});
				case "importLocal":
					return createFromImportLocal(ctx, {
						name: input.name,
						repoPath: input.mode.repoPath,
					});
			}
		}),

	setup: protectedProcedure
		.input(
			z.object({
				projectId: z.string().uuid(),
				mode: z.discriminatedUnion("kind", [
					z.object({
						kind: z.literal("clone"),
						parentDir: z.string().min(1),
					}),
					z.object({
						kind: z.literal("import"),
						repoPath: z.string().min(1),
						allowRelocate: z.boolean().default(false),
					}),
				]),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const existing = ctx.db
				.select({ id: projects.id, repoPath: projects.repoPath })
				.from(projects)
				.where(eq(projects.id, input.projectId))
				.get();

			const cloudProject = await ctx.api.v2Project.get.query({
				organizationId: ctx.organizationId,
				id: input.projectId,
			});

			const allowRelocate =
				input.mode.kind === "import" && input.mode.allowRelocate;

			const rejectIfRepoint = (targetPath: string) => {
				if (!existing) return;
				if (existing.repoPath === targetPath) return;
				if (allowRelocate) return;
				throw new TRPCError({
					code: "CONFLICT",
					message: `Project is already set up on this device at ${existing.repoPath}. Remove it first to re-import at a different location.`,
				});
			};

			switch (input.mode.kind) {
				case "clone": {
					if (!cloudProject.repoCloneUrl) {
						throw new TRPCError({
							code: "BAD_REQUEST",
							message:
								"Project has no linked GitHub repository — cannot clone. Import an existing local folder instead.",
						});
					}
					const expectedParsed = parseGitHubRemote(cloudProject.repoCloneUrl);
					if (!expectedParsed) {
						throw new TRPCError({
							code: "BAD_REQUEST",
							message: `Could not parse GitHub remote from ${cloudProject.repoCloneUrl}`,
						});
					}
					const predictedPath = resolvePath(
						input.mode.parentDir,
						expectedParsed.name,
					);
					rejectIfRepoint(predictedPath);
					if (existing) {
						const mainWorkspace = await ensureMainWorkspace(
							ctx,
							input.projectId,
							existing.repoPath,
						);
						return {
							repoPath: existing.repoPath,
							mainWorkspaceId: mainWorkspace?.id ?? null,
						};
					}
					const resolved = await cloneRepoInto(
						cloudProject.repoCloneUrl,
						input.mode.parentDir,
					);
					persistLocalProject(ctx, input.projectId, resolved);
					const mainWorkspace = await ensureMainWorkspace(
						ctx,
						input.projectId,
						resolved.repoPath,
					);
					return {
						repoPath: resolved.repoPath,
						mainWorkspaceId: mainWorkspace?.id ?? null,
					};
				}
				case "import": {
					let resolved: ResolvedRepo;
					if (cloudProject.repoCloneUrl) {
						const parsed = parseGitHubRemote(cloudProject.repoCloneUrl);
						if (!parsed) {
							throw new TRPCError({
								code: "BAD_REQUEST",
								message: `Could not parse GitHub remote from ${cloudProject.repoCloneUrl}`,
							});
						}
						resolved = await resolveMatchingSlug(
							input.mode.repoPath,
							`${parsed.owner}/${parsed.name}`,
						);
					} else {
						resolved = await resolveLocalRepo(input.mode.repoPath);
					}

					// Each on-disk repo path maps to at most one project in the
					// local DB; importing the same folder under a second project
					// would clobber the first. Cloud-side GitHub URL collisions
					// are allowed (see findBackfillConflict), but local-path
					// collisions are not.
					const localOwner = ctx.db
						.select({ id: projects.id })
						.from(projects)
						.where(eq(projects.repoPath, resolved.repoPath))
						.get();
					if (localOwner && localOwner.id !== input.projectId) {
						throw new TRPCError({
							code: "CONFLICT",
							message:
								"Repository is already set up as another project on this device.",
						});
					}

					rejectIfRepoint(resolved.repoPath);
					if (existing && existing.repoPath === resolved.repoPath) {
						const mainWorkspace = await ensureMainWorkspace(
							ctx,
							input.projectId,
							existing.repoPath,
						);
						return {
							repoPath: existing.repoPath,
							mainWorkspaceId: mainWorkspace?.id ?? null,
						};
					}

					if (!cloudProject.repoCloneUrl && resolved.parsed) {
						await ctx.api.v2Project.linkRepoCloneUrl.mutate({
							organizationId: ctx.organizationId,
							id: input.projectId,
							repoCloneUrl: resolved.parsed.url,
						});
					}
					persistLocalProject(ctx, input.projectId, resolved);
					const mainWorkspace = await ensureMainWorkspace(
						ctx,
						input.projectId,
						resolved.repoPath,
					);
					return {
						repoPath: resolved.repoPath,
						mainWorkspaceId: mainWorkspace?.id ?? null,
					};
				}
			}
		}),

	/**
	 * Project-delete saga. Cloud is reality — cloud delete is the kill point:
	 *
	 *   1. Cloud v2Project.delete   ← kill point. Cascades cloud workspaces.
	 *      on fail → abort, leave local untouched, surface error to user.
	 *
	 *   2. Local DB rows (workspaces + project)
	 *      on fail → log; user can re-run later. Cloud is already gone.
	 *
	 *   3. Best-effort `git worktree remove` for each non-main local
	 *      workspace so subsequent worktree commands aren't confused.
	 *
	 * The on-disk repo directory is NEVER auto-removed. The user's code is
	 * their code; deletion of the working tree must be an explicit action,
	 * not a side-effect of project removal. Returns repoPath so a future
	 * UI can offer an explicit "delete files too" follow-up.
	 */
	remove: protectedProcedure
		.input(z.object({ projectId: z.string().uuid() }))
		.mutation(async ({ ctx, input }) => {
			await ctx.api.v2Project.delete.mutate({
				organizationId: ctx.organizationId,
				id: input.projectId,
			});

			const localProject = ctx.db.query.projects
				.findFirst({ where: eq(projects.id, input.projectId) })
				.sync();

			if (!localProject) return { success: true, repoPath: null };

			const localWorkspaces = ctx.db
				.select()
				.from(workspaces)
				.where(eq(workspaces.projectId, input.projectId))
				.all();

			for (const ws of localWorkspaces) {
				if (ws.worktreePath === localProject.repoPath) continue;
				try {
					const git = await ctx.git(localProject.repoPath);
					await git.raw(["worktree", "remove", ws.worktreePath]);
				} catch (err) {
					console.warn("[project.remove] failed to remove worktree", {
						projectId: input.projectId,
						worktreePath: ws.worktreePath,
						err,
					});
				}
			}

			try {
				ctx.db
					.delete(workspaces)
					.where(eq(workspaces.projectId, input.projectId))
					.run();
				ctx.db.delete(projects).where(eq(projects.id, input.projectId)).run();
			} catch (err) {
				console.warn("[project.remove] failed to delete local rows", {
					projectId: input.projectId,
					err,
				});
			}

			return { success: true, repoPath: localProject.repoPath };
		}),
});
