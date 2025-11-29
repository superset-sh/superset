import { execSync } from "node:child_process";
import { ipcMain } from "electron";
import { cloudApiClient } from "./cloud-api-client";
import { db } from "./db";
import type { CloudSandbox } from "./db/schemas";

/**
 * Extract GitHub repo URL from a local git repository path
 */
function getGithubRepoUrl(repoPath: string): string | null {
	try {
		const remoteUrl = execSync("git remote get-url origin", {
			cwd: repoPath,
			encoding: "utf-8",
			stdio: ["pipe", "pipe", "pipe"],
		}).trim();

		// Convert SSH URL to HTTPS if needed
		// git@github.com:user/repo.git -> https://github.com/user/repo
		if (remoteUrl.startsWith("git@github.com:")) {
			const path = remoteUrl
				.replace("git@github.com:", "")
				.replace(/\.git$/, "");
			return `https://github.com/${path}`;
		}

		// Already HTTPS, just clean up
		if (remoteUrl.includes("github.com")) {
			return remoteUrl.replace(/\.git$/, "");
		}

		return remoteUrl;
	} catch (error) {
		console.error("Failed to get GitHub repo URL:", error);
		return null;
	}
}

/**
 * Register cloud sandbox IPC handlers
 */
export function registerCloudHandlers() {
	ipcMain.handle(
		"cloud-sandbox-create",
		async (
			_event,
			input: { name: string; projectId: string; taskDescription?: string },
		) => {
			// Look up project to get mainRepoPath
			const project = db.data.projects.find((p) => p.id === input.projectId);
			if (!project) {
				return {
					success: false,
					error: `Project ${input.projectId} not found`,
				};
			}

			// Extract GitHub URL from local repo path
			const githubRepo = getGithubRepoUrl(project.mainRepoPath);
			if (!githubRepo) {
				return {
					success: false,
					error:
						"Could not determine GitHub repository URL. Make sure the repo has a GitHub origin.",
				};
			}

			return cloudApiClient.createSandbox({
				name: input.name,
				githubRepo,
				taskDescription: input.taskDescription,
			});
		},
	);

	ipcMain.handle(
		"cloud-sandbox-delete",
		async (_event, input: { sandboxId: string }) => {
			return cloudApiClient.deleteSandbox(input.sandboxId);
		},
	);

	ipcMain.handle("cloud-sandbox-list", async () => {
		return cloudApiClient.listSandboxes();
	});

	ipcMain.handle(
		"cloud-sandbox-status",
		async (_event, input: { sandboxId: string }) => {
			return cloudApiClient.getSandboxStatus(input.sandboxId);
		},
	);

	ipcMain.handle(
		"worktree-set-cloud-sandbox",
		async (
			_event,
			input: { worktreeId: string; cloudSandbox: CloudSandbox | null },
		) => {
			try {
				await db.update((data) => {
					const worktree = data.worktrees.find(
						(wt) => wt.id === input.worktreeId,
					);
					if (worktree) {
						worktree.cloudSandbox = input.cloudSandbox ?? undefined;
					}
				});
				return { success: true };
			} catch (error) {
				console.error("Failed to update worktree sandbox:", error);
				return {
					success: false,
					error: error instanceof Error ? error.message : String(error),
				};
			}
		},
	);
}
