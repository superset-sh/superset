import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { projects } from "@superset/local-db";
import { eq } from "drizzle-orm";
import { localDb } from "main/lib/local-db";
import { CONFIG_FILE_NAME, PROJECT_SUPERSET_DIR_NAME } from "shared/constants";
import { z } from "zod";
import { publicProcedure, router } from "../..";
import {
	getTerminalPresetsEnsuringInitialized,
	saveTerminalPresets,
} from "../settings/preset-store";
import {
	exportPresetsToFile,
	getPresetsFilePath,
	importPresetsFromFile,
	previewImportPresetsFromFile,
} from "./presets-io";

async function hasConfiguredScripts(mainRepoPath: string): Promise<boolean> {
	const configPath = join(
		mainRepoPath,
		PROJECT_SUPERSET_DIR_NAME,
		CONFIG_FILE_NAME,
	);
	try {
		const content = await readFile(configPath, "utf-8");
		const parsed = JSON.parse(content);
		const setup = Array.isArray(parsed.setup)
			? parsed.setup.filter((s: string) => s.trim().length > 0)
			: [];
		const teardown = Array.isArray(parsed.teardown)
			? parsed.teardown.filter((s: string) => s.trim().length > 0)
			: [];
		return setup.length > 0 || teardown.length > 0;
	} catch {
		return false;
	}
}

const CONFIG_TEMPLATE = `{
  "setup": [],
  "teardown": []
}
`;

function getConfigPath(mainRepoPath: string): string {
	return join(mainRepoPath, PROJECT_SUPERSET_DIR_NAME, CONFIG_FILE_NAME);
}

function ensureProjectSupersetDir(mainRepoPath: string): string {
	const supersetDir = join(mainRepoPath, PROJECT_SUPERSET_DIR_NAME);
	if (!existsSync(supersetDir)) {
		mkdirSync(supersetDir, { recursive: true });
	}
	return supersetDir;
}

function getProjectById(projectId: string) {
	return localDb
		.select()
		.from(projects)
		.where(eq(projects.id, projectId))
		.get();
}

function ensureConfigExists(mainRepoPath: string): string {
	const configPath = getConfigPath(mainRepoPath);

	if (!existsSync(configPath)) {
		ensureProjectSupersetDir(mainRepoPath);
		// Create config.json with template
		writeFileSync(configPath, CONFIG_TEMPLATE, "utf-8");
	}

	return configPath;
}

export const createConfigRouter = () => {
	return router({
		// Check if we should show the setup card for a project
		shouldShowSetupCard: publicProcedure
			.input(z.object({ projectId: z.string() }))
			.query(async ({ input }) => {
				const project = getProjectById(input.projectId);
				if (!project) {
					return false;
				}

				// Don't show if already dismissed or if config has scripts
				if (project.configToastDismissed) {
					return false;
				}

				return !(await hasConfiguredScripts(project.mainRepoPath));
			}),

		// Mark the setup card as dismissed for a project
		dismissSetupCard: publicProcedure
			.input(z.object({ projectId: z.string() }))
			.mutation(({ input }) => {
				localDb
					.update(projects)
					.set({ configToastDismissed: true })
					.where(eq(projects.id, input.projectId))
					.run();
				return { success: true };
			}),

		// Get the config file path (creates it if it doesn't exist)
		getConfigFilePath: publicProcedure
			.input(z.object({ projectId: z.string() }))
			.query(({ input }) => {
				const project = getProjectById(input.projectId);
				if (!project) {
					return null;
				}
				return ensureConfigExists(project.mainRepoPath);
			}),

		getPresetsFilePath: publicProcedure.query(() => getPresetsFilePath()),

		getPresetsFileStatus: publicProcedure.query(() => {
			const path = getPresetsFilePath();
			return {
				path,
				exists: existsSync(path),
			};
		}),

		exportPresets: publicProcedure.mutation(() => {
			const presets = getTerminalPresetsEnsuringInitialized();
			return exportPresetsToFile({
				presets,
			});
		}),

		previewImportPresets: publicProcedure
			.input(
				z
					.object({
						filePath: z.string().min(1).optional(),
					})
					.optional(),
			)
			.query(({ input }) => {
				const existingPresets = getTerminalPresetsEnsuringInitialized();
				return previewImportPresetsFromFile({
					existingPresets,
					importFilePath: input?.filePath,
				});
			}),

		importPresets: publicProcedure
			.input(
				z.object({
					selectedIndices: z.array(z.number().int().min(0)).optional(),
					filePath: z.string().min(1).optional(),
				}),
			)
			.mutation(({ input }) => {
				const existingPresets = getTerminalPresetsEnsuringInitialized();

				const result = importPresetsFromFile({
					existingPresets,
					selectedIndices: input.selectedIndices,
					importFilePath: input.filePath,
				});

				saveTerminalPresets(result.presets);

				return {
					path: result.path,
					created: result.created,
					updated: result.updated,
					unchanged: result.unchanged,
					skipped: result.skipped,
				};
			}),

		// Get the config file content
		getConfigContent: publicProcedure
			.input(z.object({ projectId: z.string() }))
			.query(({ input }) => {
				const project = getProjectById(input.projectId);
				if (!project) {
					return { content: null, exists: false };
				}

				const configPath = getConfigPath(project.mainRepoPath);
				if (!existsSync(configPath)) {
					return { content: null, exists: false };
				}

				try {
					const content = readFileSync(configPath, "utf-8");
					return { content, exists: true };
				} catch {
					return { content: null, exists: false };
				}
			}),

		// Update the config file with new setup/teardown scripts
		updateConfig: publicProcedure
			.input(
				z.object({
					projectId: z.string(),
					setup: z.array(z.string()),
					teardown: z.array(z.string()),
				}),
			)
			.mutation(({ input }) => {
				const project = getProjectById(input.projectId);
				if (!project) {
					throw new Error("Project not found");
				}

				const configPath = ensureConfigExists(project.mainRepoPath);

				// Read and parse existing config, preserving other fields
				let existingConfig: Record<string, unknown> = {};
				try {
					const existingContent = readFileSync(configPath, "utf-8");
					const parsed = JSON.parse(existingContent);
					if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
						existingConfig = parsed;
					}
				} catch {
					// If file doesn't exist or has invalid JSON, start fresh
					existingConfig = {};
				}

				// Merge existing config with new setup/teardown values
				const config = {
					...existingConfig,
					setup: input.setup,
					teardown: input.teardown,
				};

				try {
					writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8");
					return { success: true };
				} catch (error) {
					console.error("[config/updateConfig] Failed to write config:", error);
					throw new Error("Failed to save config");
				}
			}),
	});
};

export type ConfigRouter = ReturnType<typeof createConfigRouter>;
