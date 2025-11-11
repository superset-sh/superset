import { execSync } from "node:child_process";
import type { CloudSandbox } from "shared/types";

interface CreateSandboxParams {
	name: string;
	githubRepo?: string;
	taskDescription?: string;
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
			const requestBody = {
				name: params.name,
				template: "yolocode",
				githubRepo: params.githubRepo,
				taskDescription: params.taskDescription,
			};

			console.log("Creating sandbox with params:", requestBody);

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

			const sandbox: CloudSandbox = {
				id: data.id,
				name: data.name,
				status: "running",
				websshHost: data.websshHost,
				claudeHost: data.claudeHost,
				createdAt: data.createdAt,
			};

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
}

export const cloudApiClient = new CloudApiClient();
export default cloudApiClient;
