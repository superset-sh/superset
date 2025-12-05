import { execSync } from "node:child_process";
import { cloudApiClient } from "main/lib/cloud-api-client";
import { db } from "main/lib/db";
import type { CloudSandbox } from "main/lib/db/schemas";
import { z } from "zod";
import { publicProcedure, router } from "../..";

/**
 * Extract GitHub repo URL from a local git repository path
 * Returns null for non-GitHub remotes
 */
function getGithubRepoUrl(repoPath: string): string | null {
	try {
		const remoteUrl = execSync("git remote get-url origin", {
			cwd: repoPath,
			encoding: "utf-8",
			stdio: ["pipe", "pipe", "pipe"],
		}).trim();

		// Convert SSH URL to HTTPS
		// git@github.com:user/repo.git -> https://github.com/user/repo
		if (remoteUrl.startsWith("git@github.com:")) {
			const path = remoteUrl
				.replace("git@github.com:", "")
				.replace(/\.git$/, "");
			return `https://github.com/${path}`;
		}

		// HTTPS GitHub URL, clean up trailing .git
		if (remoteUrl.includes("github.com")) {
			return remoteUrl.replace(/\.git$/, "");
		}

		// Non-GitHub remote, treat as absent
		return null;
	} catch (error) {
		console.error("Failed to get GitHub repo URL:", error);
		return null;
	}
}

const cloudSandboxSchema = z.object({
	id: z.string(),
	name: z.string(),
	status: z.enum(["creating", "running", "stopped", "error"]),
	websshHost: z.string().optional(),
	claudeHost: z.string().optional(),
	createdAt: z.string(),
	error: z.string().optional(),
});

export const createCloudRouter = () => {
	return router({
		createSandbox: publicProcedure
			.input(
				z.object({
					name: z.string(),
					projectId: z.string(),
					taskDescription: z.string().optional(),
				}),
			)
			.mutation(async ({ input }) => {
				// Look up project to get mainRepoPath
				const project = db.data.projects.find((p) => p.id === input.projectId);
				if (!project) {
					return {
						success: false as const,
						error: `Project ${input.projectId} not found`,
					};
				}

				// Extract GitHub URL from local repo path
				const githubRepo = getGithubRepoUrl(project.mainRepoPath);
				if (!githubRepo) {
					return {
						success: false as const,
						error:
							"Could not determine GitHub repository URL. Make sure the repo has a GitHub origin.",
					};
				}

				return cloudApiClient.createSandbox({
					name: input.name,
					githubRepo,
					taskDescription: input.taskDescription,
				});
			}),

		deleteSandbox: publicProcedure
			.input(
				z.object({
					sandboxId: z.string(),
				}),
			)
			.mutation(async ({ input }) => {
				return cloudApiClient.deleteSandbox(input.sandboxId);
			}),

		listSandboxes: publicProcedure.query(async () => {
			return cloudApiClient.listSandboxes();
		}),

		getSandboxStatus: publicProcedure
			.input(
				z.object({
					sandboxId: z.string(),
				}),
			)
			.query(async ({ input }) => {
				return cloudApiClient.getSandboxStatus(input.sandboxId);
			}),

		getWorktreeCloudStatus: publicProcedure
			.input(
				z.object({
					worktreeId: z.string(),
				}),
			)
			.query(async ({ input }) => {
				const worktree = db.data.worktrees.find(
					(wt) => wt.id === input.worktreeId,
				);
				if (!worktree?.cloudSandbox?.id) {
					return { hasCloud: false as const };
				}

				const result = await cloudApiClient.getSandboxStatus(
					worktree.cloudSandbox.id,
				);
				return {
					hasCloud: true as const,
					sandboxId: worktree.cloudSandbox.id,
					status: result.success ? result.status : "stopped",
				};
			}),

		setWorktreeSandbox: publicProcedure
			.input(
				z.object({
					worktreeId: z.string(),
					cloudSandbox: cloudSandboxSchema.nullable(),
				}),
			)
			.mutation(async ({ input }) => {
				try {
					await db.update((data) => {
						const worktree = data.worktrees.find(
							(wt) => wt.id === input.worktreeId,
						);
						if (worktree) {
							worktree.cloudSandbox =
								(input.cloudSandbox as CloudSandbox) ?? undefined;
						}
					});
					return { success: true as const };
				} catch (error) {
					console.error("Failed to update worktree sandbox:", error);
					return {
						success: false as const,
						error: error instanceof Error ? error.message : String(error),
					};
				}
			}),
	});
};

export type CloudRouter = ReturnType<typeof createCloudRouter>;
