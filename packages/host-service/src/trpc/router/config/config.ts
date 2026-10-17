import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { projects } from "../../../db/schema";
import {
	getProjectConfigPath,
	hasConfiguredScripts,
	loadSetupConfig,
	resolveScript,
	type SetupConfig,
	shellSingleQuote,
} from "../../../runtime/setup/config";
import {
	applySetupImport,
	compareWithCurrentSetup,
	findUnsafeImportPaths,
	fingerprintSetupImport,
	InvalidProjectConfigError,
	inspectSetupImports,
	isProjectConfigInvalid,
	SETUP_IMPORT_SOURCES,
	SetupImportConflictError,
	UnsafeImportPathError,
} from "../../../runtime/setup/import";
import type { HostServiceContext } from "../../../types";
import { protectedProcedure, router } from "../../index";

const projectIdInput = z.object({ projectId: z.string().uuid() });

const stringArray = z.array(z.string());

function requireProject(
	ctx: HostServiceContext,
	projectId: string,
): { id: string; repoPath: string } {
	const row = ctx.db.query.projects
		.findFirst({ where: eq(projects.id, projectId) })
		.sync();
	if (!row || !row.repoPath) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: `Project not set up locally: ${projectId}`,
		});
	}
	return { id: row.id, repoPath: row.repoPath };
}

export const configRouter = router({
	/**
	 * Decide whether the v2 sidebar setup-script CTA should show for a project.
	 * Returns true only when no source (main repo, user override, local overlay)
	 * defines any setup/teardown/run commands. Renderer also gates on a
	 * client-side dismissal store, so this only answers "is config empty".
	 */
	shouldShowSetupCard: protectedProcedure
		.input(projectIdInput)
		.query(({ ctx, input }) => {
			const project = requireProject(ctx, input.projectId);
			const config = loadSetupConfig({
				repoPath: project.repoPath,
				projectId: project.id,
			});
			return !hasConfiguredScripts(config);
		}),

	/**
	 * Read the canonical config file. Returns null content when the file is
	 * absent — the editor renders an empty form in that case and creates the
	 * file on first save via updateConfig.
	 */
	getConfigContent: protectedProcedure
		.input(projectIdInput)
		.query(({ ctx, input }) => {
			const project = requireProject(ctx, input.projectId);
			const configPath = getProjectConfigPath(project.repoPath);
			if (!existsSync(configPath)) {
				return { content: null as string | null, exists: false };
			}
			try {
				return {
					content: readFileSync(configPath, "utf-8") as string | null,
					exists: true,
				};
			} catch (error) {
				console.error(
					`[config.getConfigContent] failed to read ${configPath}: ${error instanceof Error ? error.message : String(error)}`,
				);
				return { content: null as string | null, exists: false };
			}
		}),

	/**
	 * Write setup/teardown to the project's config.json, preserving any other
	 * existing top-level keys. Omitted script keys are preserved so narrow
	 * editors can update one script without clobbering another.
	 */
	updateConfig: protectedProcedure
		.input(
			z.object({
				projectId: z.string().uuid(),
				setup: stringArray.optional(),
				teardown: stringArray.optional(),
				run: stringArray.optional(),
			}),
		)
		.mutation(({ ctx, input }) => {
			const project = requireProject(ctx, input.projectId);
			const configPath = getProjectConfigPath(project.repoPath);
			mkdirSync(dirname(configPath), { recursive: true });

			let existing: Record<string, unknown> = {};
			if (existsSync(configPath)) {
				try {
					const parsed = JSON.parse(readFileSync(configPath, "utf-8"));
					if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
						existing = parsed as Record<string, unknown>;
					}
				} catch {
					existing = {};
				}
			}

			const merged: SetupConfig & Record<string, unknown> = {
				...existing,
				...(input.setup !== undefined && { setup: input.setup }),
				...(input.teardown !== undefined && { teardown: input.teardown }),
				...(input.run !== undefined && { run: input.run }),
			};

			try {
				writeFileSync(configPath, JSON.stringify(merged, null, 2), "utf-8");
			} catch (error) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: `Failed to write config: ${error instanceof Error ? error.message : String(error)}`,
				});
			}
			return { success: true as const };
		}),

	/**
	 * Setups from other tools (Conductor, Orca, Codex, cmux, T3 Code) found in
	 * the repo root, with what each would write, which fields it would change,
	 * and which of those replace an existing Superset setup.
	 */
	getSetupImportCandidates: protectedProcedure
		.input(projectIdInput)
		.query(({ ctx, input }) => {
			const project = requireProject(ctx, input.projectId);
			return {
				configInvalid: isProjectConfigInvalid(project.repoPath),
				candidates: inspectSetupImports(project.repoPath).map((candidate) => ({
					...candidate,
					...compareWithCurrentSetup(project.repoPath, candidate),
					fingerprint: fingerprintSetupImport(project.repoPath, candidate),
					unsafePaths: findUnsafeImportPaths(project.repoPath, candidate),
				})),
			};
		}),

	/**
	 * Re-reads the source and writes it into `.superset/`. Throws CONFLICT
	 * when it would replace an existing field and `overwrite` is not set, or
	 * when `fingerprint` no longer matches what the user reviewed.
	 */
	importSetup: protectedProcedure
		.input(
			z.object({
				projectId: z.string().uuid(),
				source: z.enum(SETUP_IMPORT_SOURCES),
				overwrite: z.boolean().optional(),
				/** From getSetupImportCandidates; omitted by callers that show no preview. */
				fingerprint: z.string().optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const project = requireProject(ctx, input.projectId);
			const candidate = inspectSetupImports(project.repoPath).find(
				(entry) => entry.source === input.source,
			);
			if (!candidate) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: `No ${input.source} setup found in ${project.repoPath}`,
				});
			}
			if (
				input.fingerprint !== undefined &&
				input.fingerprint !==
					fingerprintSetupImport(project.repoPath, candidate)
			) {
				throw new TRPCError({
					code: "CONFLICT",
					message: "The setup changed after it was reviewed",
				});
			}
			try {
				return {
					written: await applySetupImport({
						repoPath: project.repoPath,
						candidate,
						overwrite: input.overwrite ?? false,
					}),
				};
			} catch (error) {
				if (error instanceof SetupImportConflictError) {
					throw new TRPCError({ code: "CONFLICT", message: error.message });
				}
				if (error instanceof UnsafeImportPathError) {
					throw new TRPCError({
						code: "PRECONDITION_FAILED",
						message: error.message,
					});
				}
				if (error instanceof InvalidProjectConfigError) {
					throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
				}
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: `Failed to import setup: ${error instanceof Error ? error.message : String(error)}`,
				});
			}
		}),

	getWorkspaceRunDefinition: protectedProcedure
		.input(projectIdInput)
		.query(({ ctx, input }) => {
			const project = requireProject(ctx, input.projectId);
			const resolved = resolveScript("run", {
				repoPath: project.repoPath,
				projectId: project.id,
			});
			if (!resolved) return null;
			return {
				source: "project-config" as const,
				projectId: project.id,
				commands:
					resolved.kind === "commands"
						? resolved.commands
						: [`bash ${shellSingleQuote(resolved.scriptPath)}`],
				...(resolved.cwd && { cwd: resolved.cwd }),
			};
		}),
});
