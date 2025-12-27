import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { projects } from "@superset/local-db";
import { eq } from "drizzle-orm";
import { localDb } from "main/lib/local-db";
import { z } from "zod";
import { publicProcedure, router } from "../..";

function configExists(mainRepoPath: string): boolean {
	const configPath = join(mainRepoPath, ".superset", "config.json");
	return existsSync(configPath);
}

const CONFIG_TEMPLATE = `{
  "setup": [],
  "teardown": []
}
`;

function getConfigPath(mainRepoPath: string): string {
	return join(mainRepoPath, ".superset", "config.json");
}

function ensureConfigExists(mainRepoPath: string): string {
	const configPath = getConfigPath(mainRepoPath);
	const supersetDir = join(mainRepoPath, ".superset");

	if (!existsSync(configPath)) {
		// Create .superset directory if it doesn't exist
		if (!existsSync(supersetDir)) {
			mkdirSync(supersetDir, { recursive: true });
		}
		// Create config.json with template
		writeFileSync(configPath, CONFIG_TEMPLATE, "utf-8");
	}

	return configPath;
}

export const createConfigRouter = () => {
	return router({
		// Check if we should show the config toast for a project
		shouldShowConfigToast: publicProcedure
			.input(z.object({ projectId: z.string() }))
			.query(({ input }) => {
				const project = localDb
					.select()
					.from(projects)
					.where(eq(projects.id, input.projectId))
					.get();
				if (!project) {
					return false;
				}

				// Don't show if already dismissed or if config exists
				if (project.configToastDismissed) {
					return false;
				}

				return !configExists(project.mainRepoPath);
			}),

		// Mark the config toast as dismissed for a project
		dismissConfigToast: publicProcedure
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
				const project = localDb
					.select()
					.from(projects)
					.where(eq(projects.id, input.projectId))
					.get();
				if (!project) {
					return null;
				}
				return ensureConfigExists(project.mainRepoPath);
			}),

		// Get the config file content
		getConfigContent: publicProcedure
			.input(z.object({ projectId: z.string() }))
			.query(({ input }) => {
				const project = localDb
					.select()
					.from(projects)
					.where(eq(projects.id, input.projectId))
					.get();
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
	});
};

export type ConfigRouter = ReturnType<typeof createConfigRouter>;
