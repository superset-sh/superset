import { execSync } from "node:child_process";
import type { CloudSandbox } from "shared/types";

interface CreateSandboxParams {
	name: string;
	githubRepo?: string;
	taskDescription?: string;
	envVars?: Record<string, string>;
}

interface CreateSandboxResponse {
	id: string;
	name: string;
	template: string;
	status: string;
	createdAt: string;
	metadata: {
		userId: string;
		userLogin: string;
		displayName: string;
		name: string;
		actualSandboxName: string;
		githubRepo?: string;
		autoPause: string;
	};
	githubRepo?: string;
	host: string;
	websshHost: string;
	claudeHost: string;
}

interface ListSandboxResponse {
	id: string;
	name: string;
	status: string;
	websshHost?: string;
	claudeHost?: string;
	createdAt: string;
}

/**
 * Client for interacting with yolocode cloud API
 * Uses GitHub token for authentication
 */
class CloudApiClient {
	private baseUrl = "https://staging.yolocode.ai/api/e2b-sandboxes";

	/**
	 * Get GitHub token from gh CLI
	 */
	private getGithubToken(): string | null {
		try {
			const token = execSync("gh auth token", {
				encoding: "utf-8",
				stdio: ["pipe", "pipe", "pipe"],
			}).trim();
			return token;
		} catch (error) {
			console.error("Failed to get GitHub token:", error);
			return null;
		}
	}

	/**
	 * Create a new cloud sandbox
	 */
	async createSandbox(
		params: CreateSandboxParams,
	): Promise<{ success: boolean; sandbox?: CloudSandbox; error?: string }> {
		const token = this.getGithubToken();
		if (!token) {
			return {
				success: false,
				error: "GitHub authentication required. Please run 'gh auth login'",
			};
		}

		try {
			// Get Claude Code auth token from .env.local
			const claudeAuthToken = process.env.CLAUDE_CODE_OAUTH_TOKEN;

			const requestBody = {
				name: params.name,
				template: "yolocode",
				githubRepo: params.githubRepo,
				githubToken: token, // Pass gh token for repo cloning
				taskDescription: params.taskDescription,
				envVars: {
					...params.envVars,
					...(claudeAuthToken && {
						CLAUDE_CODE_OAUTH_TOKEN: claudeAuthToken,
					}),
				},
			};

			// Log request but mask sensitive data
			console.log("Creating sandbox with params:", {
				name: requestBody.name,
				template: requestBody.template,
				githubRepo: requestBody.githubRepo,
				taskDescription: requestBody.taskDescription,
				envVars: claudeAuthToken
					? { CLAUDE_CODE_OAUTH_TOKEN: "***" }
					: undefined,
			});

			const response = await fetch(this.baseUrl, {
				method: "POST",
				headers: {
					Authorization: `Bearer ${token}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify(requestBody),
			});

			if (!response.ok) {
				const errorText = await response.text();
				console.error("API error:", errorText);
				console.error("Response status:", response.status);
				console.error("Response statusText:", response.statusText);
				return {
					success: false,
					error: `Failed to create sandbox: ${response.statusText}. Details: ${errorText}`,
				};
			}

			const data: CreateSandboxResponse = await response.json();

			// Override claudeHost to use port 7030 for web UI
			const claudeHost =
				data.claudeHost?.replace(/:\d+/, ":7030") || data.claudeHost;

			const sandbox: CloudSandbox = {
				id: data.id,
				name: data.name,
				status: "running",
				websshHost: data.websshHost,
				claudeHost: claudeHost,
				createdAt: data.createdAt,
			};

			console.log("Created sandbox:", sandbox);

			return { success: true, sandbox };
		} catch (error) {
			console.error("Failed to create sandbox:", error);
			return {
				success: false,
				error: error instanceof Error ? error.message : String(error),
			};
		}
	}

	/**
	 * Delete a cloud sandbox
	 */
	async deleteSandbox(
		sandboxId: string,
	): Promise<{ success: boolean; error?: string }> {
		const token = this.getGithubToken();
		if (!token) {
			return {
				success: false,
				error: "GitHub authentication required",
			};
		}

		try {
			const response = await fetch(`${this.baseUrl}/${sandboxId}`, {
				method: "DELETE",
				headers: {
					Authorization: `Bearer ${token}`,
				},
			});

			if (!response.ok) {
				return {
					success: false,
					error: `Failed to delete sandbox: ${response.statusText}`,
				};
			}

			return { success: true };
		} catch (error) {
			console.error("Failed to delete sandbox:", error);
			return {
				success: false,
				error: error instanceof Error ? error.message : String(error),
			};
		}
	}

	/**
	 * List all sandboxes for the current user
	 */
	async listSandboxes(): Promise<{
		success: boolean;
		sandboxes?: CloudSandbox[];
		error?: string;
	}> {
		const token = this.getGithubToken();
		if (!token) {
			return {
				success: false,
				error: "GitHub authentication required",
			};
		}

		try {
			const response = await fetch(this.baseUrl, {
				method: "GET",
				headers: {
					Authorization: `Bearer ${token}`,
				},
			});

			if (!response.ok) {
				return {
					success: false,
					error: `Failed to list sandboxes: ${response.statusText}`,
				};
			}

			const data: ListSandboxResponse[] = await response.json();

			const sandboxes: CloudSandbox[] = data.map((s) => ({
				id: s.id,
				name: s.name,
				status: s.status === "running" ? "running" : "stopped",
				websshHost: s.websshHost,
				claudeHost: s.claudeHost?.replace(/https:\/\/\d+-/, (match) =>
					match.replace(/\d+/, "7030"),
				),
				createdAt: s.createdAt,
			}));

			return { success: true, sandboxes };
		} catch (error) {
			console.error("Failed to list sandboxes:", error);
			return {
				success: false,
				error: error instanceof Error ? error.message : String(error),
			};
		}
	}

	/**
	 * Get status of a specific sandbox
	 */
	async getSandboxStatus(sandboxId: string): Promise<{
		success: boolean;
		status?: "running" | "stopped" | "error";
		error?: string;
	}> {
		const result = await this.listSandboxes();
		if (!result.success || !result.sandboxes) {
			return { success: false, error: result.error };
		}

		const sandbox = result.sandboxes.find((s) => s.id === sandboxId);
		if (!sandbox) {
			// Sandbox not found - might have been deleted
			return { success: true, status: "stopped" };
		}

		return {
			success: true,
			status: sandbox.status as "running" | "stopped",
		};
	}
}

export const cloudApiClient = new CloudApiClient();
export default cloudApiClient;
