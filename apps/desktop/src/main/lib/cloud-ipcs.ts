import { execSync } from "node:child_process";
import { ipcMain } from "electron";
import { cloudApiClient } from "./cloud-api-client";
import { db } from "./db";

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
}
