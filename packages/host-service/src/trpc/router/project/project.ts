import { existsSync } from "node:fs";
import { basename, resolve as resolvePath } from "node:path";
import {
	type ParsedGitHubRemote,
	parseGitHubRemote,
} from "@superset/shared/github-remote";
import { BRANCH_PREFIX_MODES } from "@superset/shared/workspace-launch";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { projects, tagFolderSettings, workspaces } from "../../../db/schema";
import type { TagSettingSnapshot } from "../../../events/types";
import {
	emitProjectChanged,
	getLocalProject,
	toProjectSnapshot,
	updateLocalProject,
} from "../../../projects/local-project-store";
import { createUserSimpleGit } from "../../../runtime/git/simple-git";
import {
	deleteTagFolderSetting,
	getAllTagFolderSettings,
	upsertTagFolderSetting,
} from "../../../tag-folders";
import { emitLocalWorkspaceDeleted } from "../../../workspaces/local-workspace-store";
import { machineOnlyProcedure, protectedProcedure, router } from "../../index";
import {
	normalizeSparseCheckoutPaths,
	parseSparseCheckoutPaths,
	serializeSparseCheckoutPaths,
} from "../workspace-creation/shared/sparse-checkout";
import { normalizeWorktreeBaseDir } from "../workspace-creation/shared/worktree-paths";
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
	tryRevParseGitRoot,
	validateDirectoryPath,
} from "./utils/resolve-repo";

// Icons are downscaled to a small square PNG data-URI client-side; this caps
// the stored/broadcast value (it rides in project.list and project:changed).
const MAX_PROJECT_ICON_LENGTH = 256 * 1024;

// Naming instructions ride inside the naming model's system prompt; a couple
// of sentences is the intended size, so cap well below prompt-bloat territory.
const MAX_NAMING_INSTRUCTIONS_LENGTH = 2000;

/** One findByPath match: an existing v2 project this repo path could link
 * to — either the authoritative local-DB row (`local-path`) or a cloud
 * project found via a GitHub remote URL (`remote`). Module-scoped so the
 * exported router's declaration emit can name it. */
export interface FindByPathCandidate {
	id: string;
	name: string;
	repoCloneUrl: string | null;
	source: "local-path" | "remote";
	matchesExpected: boolean;
}

export const projectRouter = router({
	list: protectedProcedure.query(({ ctx }) => {
		const tagSettingsByProject = new Map<string, TagSettingSnapshot[]>();
		for (const { scope, ...setting } of getAllTagFolderSettings(
			ctx.db,
			ctx.userId,
		)) {
			const settings = tagSettingsByProject.get(scope) ?? [];
			settings.push(setting);
			tagSettingsByProject.set(scope, settings);
		}
		return ctx.db
			.select()
			.from(projects)
			.all()
			.map((row) => ({
				id: row.id,
				// Deprecated wire compatibility for desktops that predate the
				// tagFolders router. Storage still has one canonical table.
				tagSettings: tagSettingsByProject.get(row.id) ?? [],
				// Empty until the backfill sweep fills it; folder name is the
				// honest fallback (same rule as toProjectSnapshot).
				name: row.name || basename(row.repoPath),
				repoPath: row.repoPath,
				repoOwner: row.repoOwner,
				repoName: row.repoName,
				repoUrl: row.repoUrl,
				worktreeBaseDir: row.worktreeBaseDir,
				icon: row.icon,
				color: row.color,
				createdAt: row.createdAt,
				updatedAt: row.updatedAt || row.createdAt,
			}));
	}),

	/** Rename. Commits locally — projects have no cloud dependency. */
	update: protectedProcedure
		.input(
			z.object({
				projectId: z.string().uuid(),
				name: z.string().min(1),
			}),
		)
		.mutation(({ ctx, input }) => {
			const row = updateLocalProject(
				{ db: ctx.db, eventBus: ctx.eventBus },
				input.projectId,
				{ name: input.name },
			);
			if (!row) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Project is not set up on this host",
				});
			}
			return toProjectSnapshot(row);
		}),

	/** @deprecated Use tagFolders.upsert. Kept for mixed desktop/host versions. */
	setTagSetting: protectedProcedure
		.input(
			z.object({
				projectId: z.string().uuid(),
				tag: z.string().min(1),
				displayName: z.string().min(1).max(200).nullish(),
				color: z.string().max(50).nullish(),
				tabOrder: z.number().int().nullish(),
			}),
		)
		.mutation(({ ctx, input }) => {
			const project = getLocalProject(ctx.db, input.projectId);
			if (!project) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Project is not set up on this host",
				});
			}
			const settings = upsertTagFolderSetting(
				{ db: ctx.db, eventBus: ctx.eventBus, userId: ctx.userId },
				input.projectId,
				input.tag,
				{
					...(input.displayName !== undefined
						? { displayName: input.displayName }
						: {}),
					...(input.color !== undefined ? { color: input.color } : {}),
					...(input.tabOrder !== undefined ? { tabOrder: input.tabOrder } : {}),
				},
			);
			if (settings === undefined) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Invalid tag",
				});
			}
			// Old desktops only listen for project:changed.
			emitProjectChanged(ctx.eventBus, "updated", project, settings);
			return { tagSettings: settings };
		}),

	/** @deprecated Use tagFolders.delete. Kept for mixed desktop/host versions. */
	deleteTagSetting: protectedProcedure
		.input(z.object({ projectId: z.string().uuid(), tag: z.string().min(1) }))
		.mutation(({ ctx, input }) => {
			const project = getLocalProject(ctx.db, input.projectId);
			if (!project) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Project is not set up on this host",
				});
			}
			const settings = deleteTagFolderSetting(
				{ db: ctx.db, eventBus: ctx.eventBus, userId: ctx.userId },
				input.projectId,
				input.tag,
			);
			if (settings === undefined) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Invalid tag",
				});
			}
			emitProjectChanged(ctx.eventBus, "updated", project, settings);
			return { tagSettings: settings };
		}),

	get: protectedProcedure
		.input(z.object({ projectId: z.string().uuid() }))
		.query(({ ctx, input }) => {
			const row = ctx.db
				.select()
				.from(projects)
				.where(eq(projects.id, input.projectId))
				.get();
			if (!row) return null;
			return {
				id: row.id,
				// Same fallback rule as project.list / toProjectSnapshot.
				name: row.name || basename(row.repoPath),
				repoPath: row.repoPath,
				repoOwner: row.repoOwner,
				repoName: row.repoName,
				repoUrl: row.repoUrl,
				worktreeBaseDir: row.worktreeBaseDir,
				branchPrefixMode: row.branchPrefixMode,
				branchPrefixCustom: row.branchPrefixCustom,
				icon: row.icon,
				color: row.color,
				// Always an array; the column's JSON encoding stays internal.
				sparseCheckoutPaths: parseSparseCheckoutPaths(row.sparseCheckoutPaths),
				namingInstructions: row.namingInstructions,
			};
		}),

	/**
	 * Set (or clear) this project's custom icon. Local-first: the icon is a
	 * small downscaled data-URI stored on the host row. The "none" sentinel
	 * means "explicitly no icon" (renderers show the letter placeholder); a
	 * null clears back to the default (GitHub owner avatar / placeholder).
	 */
	setIcon: protectedProcedure
		.input(
			z.object({
				projectId: z.string().uuid(),
				icon: z
					.union([
						z
							.string()
							.max(MAX_PROJECT_ICON_LENGTH, "Icon image is too large")
							.regex(/^data:image\//, "Icon must be an image data URI"),
						z.literal("none"),
					])
					.nullable(),
			}),
		)
		.mutation(({ ctx, input }) => {
			const row = updateLocalProject(
				{ db: ctx.db, eventBus: ctx.eventBus },
				input.projectId,
				{ icon: input.icon },
			);
			if (!row) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Project is not set up on this host",
				});
			}
			return toProjectSnapshot(row);
		}),

	/**
	 * Set (or clear) this project's accent color. Stored as a `#rrggbb` hex on
	 * the host row; a null clears it back to the default (no accent).
	 */
	setColor: protectedProcedure
		.input(
			z.object({
				projectId: z.string().uuid(),
				color: z
					.string()
					.regex(/^#[0-9a-fA-F]{6}$/, "Color must be a #rrggbb hex")
					.nullable(),
			}),
		)
		.mutation(({ ctx, input }) => {
			const row = updateLocalProject(
				{ db: ctx.db, eventBus: ctx.eventBus },
				input.projectId,
				{ color: input.color },
			);
			if (!row) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Project is not set up on this host",
				});
			}
			return toProjectSnapshot(row);
		}),

	setWorktreeBaseDir: protectedProcedure
		.input(
			z.object({
				projectId: z.string().uuid(),
				path: z.string().nullable(),
			}),
		)
		.mutation(({ ctx, input }) => {
			const worktreeBaseDir = normalizeWorktreeBaseDir(input.path);
			ctx.db
				.update(projects)
				.set({ worktreeBaseDir })
				.where(eq(projects.id, input.projectId))
				.run();

			const project = ctx.db.query.projects
				.findFirst({ where: eq(projects.id, input.projectId) })
				.sync();
			if (!project) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Project is not set up on this host",
				});
			}

			return {
				id: project.id,
				worktreeBaseDir: project.worktreeBaseDir ?? null,
			};
		}),

	/**
	 * Set (or clear) this project's AI naming instructions — free text
	 * injected into workspace/branch name generation. Null or blank clears
	 * the setting so naming falls back to the default behavior.
	 */
	setNamingInstructions: protectedProcedure
		.input(
			z.object({
				projectId: z.string().uuid(),
				instructions: z
					.string()
					.max(
						MAX_NAMING_INSTRUCTIONS_LENGTH,
						"Naming instructions are too long",
					)
					.nullable(),
			}),
		)
		.mutation(({ ctx, input }) => {
			const namingInstructions = input.instructions?.trim() || null;
			const updated = ctx.db
				.update(projects)
				.set({ namingInstructions })
				.where(eq(projects.id, input.projectId))
				.returning({ id: projects.id })
				.get();
			if (!updated) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Project is not set up on this host",
				});
			}
			return { namingInstructions };
		}),

	/**
	 * Set the folders new worktrees are sparse-checked-out to. An empty list
	 * clears the setting so new worktrees get a full checkout again. Existing
	 * worktrees are left as they are.
	 */
	setSparseCheckoutPaths: protectedProcedure
		.input(
			z.object({
				projectId: z.string().uuid(),
				// Bounded well above the post-dedupe cap in
				// `normalizeSparseCheckoutPaths`, so a runaway payload is
				// rejected before we bother normalizing every entry.
				paths: z.array(z.string().max(1024)).max(1000),
			}),
		)
		.mutation(({ ctx, input }) => {
			const paths = normalizeSparseCheckoutPaths(input.paths);
			const updated = ctx.db
				.update(projects)
				.set({ sparseCheckoutPaths: serializeSparseCheckoutPaths(paths) })
				.where(eq(projects.id, input.projectId))
				.returning({ id: projects.id })
				.get();
			if (!updated) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Project is not set up on this host",
				});
			}
			return { sparseCheckoutPaths: paths };
		}),

	/**
	 * Set this project's branch-prefix override. A `null` mode clears the
	 * override so the project falls back to the host-wide default.
	 */
	setBranchPrefix: protectedProcedure
		.input(
			z.object({
				projectId: z.string().uuid(),
				mode: z.enum(BRANCH_PREFIX_MODES).nullable(),
				customPrefix: z.string().nullable().optional(),
			}),
		)
		.mutation(({ ctx, input }) => {
			const updated = ctx.db
				.update(projects)
				.set({
					branchPrefixMode: input.mode,
					branchPrefixCustom: input.customPrefix ?? null,
				})
				.where(eq(projects.id, input.projectId))
				.returning({ id: projects.id })
				.get();
			if (!updated) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: `Project not set up locally: ${input.projectId}`,
				});
			}
			return { success: true as const };
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
				 * Opt-in to the v1→v2 importer's discovery semantics: when no
				 * local-DB row exists, walk every GitHub remote on the repo
				 * (not just origin/first) and try `expectedRemoteUrl` against
				 * cloud. In BOTH modes a local-DB hit short-circuits before
				 * any cloud call — a local row means the repo is already a v2
				 * project on this device ("local is reality"), regardless of
				 * what the cloud knows.
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
			// Detect "folder isn't a git repo yet" without throwing, so the import
			// UI can offer to `git init` it (create importLocal + initIfNeeded)
			// instead of dead-ending on a BAD_REQUEST. Additive optional field —
			// repo paths never carry needsGitInit, so existing callers are
			// unaffected.
			const root = await tryRevParseGitRoot(input.repoPath);
			if (root === null) {
				validateDirectoryPath(input.repoPath, "Path"); // 400 on missing / not-a-dir
				return {
					candidates: [],
					cloudErrors: [] as { url: string; message: string }[],
					needsGitInit: true as const,
				};
			}

			const resolved = await resolveLocalRepo(root);
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

			const localProject = ctx.db.query.projects
				.findFirst({ where: eq(projects.repoPath, gitRoot) })
				.sync();

			// A local-DB row keyed by this repo's git root is authoritative:
			// the repo is already a v2 project on this device ("local is
			// reality" — see the delete saga below). Return it without
			// consulting the cloud. This covers both modes: the folder-first
			// default has always worked this way, and the v1 importer must
			// too — local-first projects have no cloud row, so any cloud
			// probe here misreads them as stale and makes the importer
			// create duplicates.
			if (localProject) {
				return {
					candidates: [
						{
							id: localProject.id,
							name:
								localProject.name || localProject.repoName || basename(gitRoot),
							repoCloneUrl: localProject.repoUrl ?? null,
							source: "local-path" as const,
							matchesExpected: matches(localProject.repoUrl ?? null),
						},
					],
					cloudErrors: [] as { url: string; message: string }[],
				};
			}

			// Default behavior (folder-first import): purely local. No local
			// hit means the caller creates a fresh local project; the cloud
			// is never consulted.
			if (!input.walkAllRemotes) {
				return { candidates: [], cloudErrors: [] };
			}

			// walkAllRemotes branch — v1→v2 importer, no local row: discover
			// linkable cloud candidates across every GitHub remote.
			const allRemotes = await getGitHubRemotes(createUserSimpleGit(gitRoot));

			const urlsToQuery = new Map<string, ParsedGitHubRemote>();
			for (const parsed of allRemotes.values()) {
				urlsToQuery.set(parsed.url.toLowerCase(), parsed);
			}
			if (expectedParsed) {
				urlsToQuery.set(expectedParsed.url.toLowerCase(), expectedParsed);
			}

			const byId = new Map<string, FindByPathCandidate>();

			// Cloud lookup for every URL we know about. This is the last
			// consumer of the cloud v2_projects table; it dies with the v1
			// importer (the only caller that sets walkAllRemotes).
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
							// Same project reachable via two remote URLs; keep one
							// candidate and merge the match flag.
							existing.matchesExpected =
								existing.matchesExpected || matches(parsed.url);
							existing.repoCloneUrl = existing.repoCloneUrl ?? parsed.url;
						} else {
							byId.set(c.id, {
								id: c.id,
								name: c.name,
								repoCloneUrl: parsed.url,
								source: "remote",
								matchesExpected: matches(parsed.url),
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

			// Sort: matchesExpected first, then alphabetic.
			const candidates = Array.from(byId.values()).sort((a, b) => {
				if (a.matchesExpected !== b.matchesExpected) {
					return a.matchesExpected ? -1 : 1;
				}
				return a.name.localeCompare(b.name);
			});

			// Caller surfaces this when there are no candidates and at least
			// one cloud query failed — so users see a clear "couldn't reach
			// cloud" instead of a misleading "Import" (which would create a
			// duplicate v2 project).
			return { candidates, cloudErrors };
		}),

	create: machineOnlyProcedure
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
						// When set, `git init` a non-git folder in place before
						// importing. The UI sets this only after confirming intent
						// with the user (see findByPath's needsGitInit).
						initIfNeeded: z.boolean().optional().default(false),
					}),
					z.object({
						kind: z.literal("template"),
						parentDir: z.string().min(1),
						url: z
							.string()
							.min(1)
							.refine((value) => /^https?:\/\//i.test(value), {
								message: "Template URL must be http(s)",
							}),
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
						url: input.mode.url,
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
						initIfNeeded: input.mode.initIfNeeded,
					});
			}
		}),

	setup: machineOnlyProcedure
		.input(
			z.object({
				projectId: z.string().uuid(),
				/**
				 * Repo coordinates supplied by the caller (from the host
				 * fan-out) so a local-first project created on ANOTHER host can
				 * be set up on this device. Required whenever this host has no
				 * local row for the project — nothing else knows the repo.
				 */
				origin: z
					.object({
						repoCloneUrl: z.string().nullish(),
						name: z.string().min(1).optional(),
					})
					.optional(),
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

			// Projects are host-owned, so a local row is this host's only
			// self-contained source of repo coordinates. Without one the
			// caller must supply them from the host fan-out — there is no
			// registry left to ask.
			if (!existing && !input.origin) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message:
						input.mode.kind === "clone"
							? `Project ${input.projectId} is not set up on this host. Pass origin.repoCloneUrl to clone it.`
							: `Project ${input.projectId} is not set up on this host. Pass origin to import it.`,
				});
			}
			const origin = {
				repoCloneUrl: input.origin?.repoCloneUrl ?? null,
				name: input.origin?.name,
			};

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
					if (existing) {
						// Already on this device — same folder name predicted from
						// the local row; a different parentDir means a repoint.
						rejectIfRepoint(
							resolvePath(input.mode.parentDir, basename(existing.repoPath)),
						);
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
					if (!origin.repoCloneUrl) {
						throw new TRPCError({
							code: "BAD_REQUEST",
							message:
								"Project has no linked GitHub repository — cannot clone. Import an existing local folder instead.",
						});
					}
					const expectedParsed = parseGitHubRemote(origin.repoCloneUrl);
					if (!expectedParsed) {
						throw new TRPCError({
							code: "BAD_REQUEST",
							message: `Could not parse GitHub remote from ${origin.repoCloneUrl}`,
						});
					}
					const resolved = await cloneRepoInto(
						origin.repoCloneUrl,
						input.mode.parentDir,
						ctx.credentials,
					);
					persistLocalProject(ctx, input.projectId, resolved, {
						name: origin.name,
					});
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
					if (origin.repoCloneUrl) {
						const parsed = parseGitHubRemote(origin.repoCloneUrl);
						if (!parsed) {
							throw new TRPCError({
								code: "BAD_REQUEST",
								message: `Could not parse GitHub remote from ${origin.repoCloneUrl}`,
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

					persistLocalProject(ctx, input.projectId, resolved, {
						name: origin.name,
					});
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
	 * Project-delete saga. Local is reality — the local deletes are the
	 * commit point, run first, and are fully offline-capable:
	 *
	 *   1. Ownership check: an id this host doesn't serve is a no-op —
	 *      never a legacy cloud delete.
	 *
	 *   2. Best-effort `git worktree remove` for each non-main local
	 *      workspace so subsequent worktree commands aren't confused.
	 *
	 *   3. Local DB rows (workspaces + project). A failure here surfaces as
	 *      an error — the local table is what the UI lists from, so a
	 *      swallowed failure would toast "Deleted" over a surviving row.
	 *
	 * The on-disk repo directory is NEVER auto-removed. The user's code is
	 * their code; deletion of the working tree must be an explicit action,
	 * not a side-effect of project removal. Returns repoPath so a future
	 * UI can offer an explicit "delete files too" follow-up.
	 */
	remove: machineOnlyProcedure
		.input(z.object({ projectId: z.string().uuid() }))
		.mutation(async ({ ctx, input }) => {
			const localProject = ctx.db.query.projects
				.findFirst({ where: eq(projects.id, input.projectId) })
				.sync();
			if (!localProject) return { success: true, repoPath: null };

			// The project-row delete below cascades tombstones away — removing a
			// project intentionally drops its workspace history. Sweep worktrees
			// for live rows AND stranded tombstones (crash-interrupted deletes
			// whose worktree survives): once the cascade runs, the startup
			// reconciler can no longer see them.
			const localWorkspaces = ctx.db
				.select()
				.from(workspaces)
				.where(eq(workspaces.projectId, input.projectId))
				.all()
				.filter((ws) => ws.archivedAt == null || existsSync(ws.worktreePath));

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
				// The project cascade removes its workspaces. Folder settings have no
				// FK because the same scope column also holds Sessions, so delete both
				// owners in one transaction: neither can survive a partial failure.
				ctx.db.transaction((tx) => {
					tx.delete(projects).where(eq(projects.id, input.projectId)).run();
					tx.delete(tagFolderSettings)
						.where(eq(tagFolderSettings.scope, input.projectId))
						.run();
				});
				// Events describe committed state and must not escape the transaction.
				for (const ws of localWorkspaces) emitLocalWorkspaceDeleted(ctx, ws);
				ctx.eventBus.broadcastTagFoldersChanged({
					scope: input.projectId,
					settings: [],
					occurredAt: Date.now(),
				});
				emitProjectChanged(ctx.eventBus, "deleted", input.projectId);
			} catch (err) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: `Failed to delete project locally: ${err instanceof Error ? err.message : String(err)}`,
				});
			}

			return { success: true, repoPath: localProject.repoPath };
		}),
});
