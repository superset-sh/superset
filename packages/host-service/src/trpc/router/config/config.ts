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
	type SetupConfig,
} from "../../../runtime/setup/config";
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
	 * existing top-level keys (notably `run`, which v2 doesn't expose yet).
	 */
	updateConfig: protectedProcedure
		.input(
			z.object({
				projectId: z.string().uuid(),
				setup: stringArray,
				teardown: stringArray,
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
				setup: input.setup,
				teardown: input.teardown,
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
});
