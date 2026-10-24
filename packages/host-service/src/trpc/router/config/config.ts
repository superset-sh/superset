import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { parseProjectConfig } from "@superset/shared/project-config";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { projects } from "../../../db/schema";
import {
	getProjectConfigPath,
	hasProjectConfig,
	resolveScript,
	type SetupConfig,
	shellSingleQuote,
} from "../../../runtime/setup/config";
import {
	getLocalTomlConfigPath,
	getTomlConfigPath,
} from "../../../runtime/setup/project-config-toml";
import type { HostServiceContext } from "../../../types";
import { protectedProcedure, router } from "../../index";

const projectIdInput = z.object({ projectId: z.string().uuid() });

const stringArray = z.array(z.string());

const LOCAL_CONFIG_IGNORE_ENTRY = "/.superset/config.local.toml";

/**
 * Keeps the personal file out of commits on this machine without touching the
 * repository: `.git/info/exclude` is a per-clone ignore list. Best effort.
 */
function excludeLocalConfig(repoPath: string): void {
	const gitDir = join(repoPath, ".git");
	if (!existsSync(gitDir)) return;
	const excludePath = join(gitDir, "info", "exclude");
	try {
		const current = readIfExists(excludePath) ?? "";
		if (current.split("\n").includes(LOCAL_CONFIG_IGNORE_ENTRY)) return;
		mkdirSync(dirname(excludePath), { recursive: true });
		const separator = current === "" || current.endsWith("\n") ? "" : "\n";
		writeFileSync(
			excludePath,
			`${current}${separator}${LOCAL_CONFIG_IGNORE_ENTRY}\n`,
			"utf-8",
		);
	} catch (error) {
		console.warn(
			"[config] could not add config.local.toml to .git/info/exclude",
			error,
		);
	}
}

function readIfExists(path: string): string | null {
	return existsSync(path) ? readFileSync(path, "utf-8") : null;
}

/** Problems with a config file's text, empty when it can be saved. */
function validateConfigText(
	format: "toml" | "json",
	content: string,
): string[] {
	if (format === "toml") {
		const result = parseProjectConfig(content);
		return result.ok
			? []
			: result.errors.map(
					(error) =>
						`${error.line ? `line ${error.line}: ` : ""}${error.message}`,
				);
	}
	try {
		const parsed: unknown = JSON.parse(content);
		return parsed && typeof parsed === "object" && !Array.isArray(parsed)
			? []
			: ["config.json must be a JSON object"];
	} catch (error) {
		return [error instanceof Error ? error.message : String(error)];
	}
}

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
			return !hasProjectConfig({
				repoPath: project.repoPath,
				projectId: project.id,
			});
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
	 * The project's config files as text, for the Settings editor: the shared
	 * file (`config.toml`, else the v1 `config.json`) and the personal
	 * `config.local.toml`, both from the main checkout.
	 */
	getConfigFiles: protectedProcedure
		.input(projectIdInput)
		.query(({ ctx, input }) => {
			const project = requireProject(ctx, input.projectId);
			const tomlPath = getTomlConfigPath(project.repoPath);
			const jsonPath = getProjectConfigPath(project.repoPath);
			const tomlContent = readIfExists(tomlPath);
			const jsonContent = tomlContent === null ? readIfExists(jsonPath) : null;
			const localPath = getLocalTomlConfigPath(project.repoPath);
			return {
				shared:
					tomlContent !== null
						? { format: "toml" as const, path: tomlPath, content: tomlContent }
						: jsonContent !== null
							? {
									format: "json" as const,
									path: jsonPath,
									content: jsonContent,
								}
							: null,
				local: { path: localPath, content: readIfExists(localPath) },
				tomlPath,
			};
		}),

	/**
	 * Writes one config file exactly as given, after validating it, so comments
	 * and formatting survive. Saving `config.toml` when only `config.json`
	 * exists is how a project converts; the JSON file is left in place.
	 */
	writeConfigFile: protectedProcedure
		.input(
			z.object({
				projectId: z.string().uuid(),
				file: z.enum(["shared", "local"]),
				format: z.enum(["toml", "json"]),
				content: z.string().max(200_000),
			}),
		)
		.mutation(({ ctx, input }) => {
			const project = requireProject(ctx, input.projectId);
			if (input.file === "local" && input.format !== "toml") {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "config.local.toml must be TOML",
				});
			}
			const problems = validateConfigText(input.format, input.content);
			if (problems.length > 0) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: `Invalid config: ${problems.join("; ")}`,
				});
			}
			const path =
				input.file === "local"
					? getLocalTomlConfigPath(project.repoPath)
					: input.format === "toml"
						? getTomlConfigPath(project.repoPath)
						: getProjectConfigPath(project.repoPath);
			try {
				mkdirSync(dirname(path), { recursive: true });
				writeFileSync(path, input.content, "utf-8");
				if (input.file === "local") excludeLocalConfig(project.repoPath);
			} catch (error) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: `Failed to write config: ${error instanceof Error ? error.message : String(error)}`,
				});
			}
			return { path };
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
