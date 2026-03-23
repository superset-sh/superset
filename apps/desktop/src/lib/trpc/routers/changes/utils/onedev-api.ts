import type { OnedevConfig } from "./git-provider";

interface OnedevProject {
	id: number;
	name: string;
	path: string;
}

interface OnedevPullRequest {
	id: number;
	number: number;
	title: string;
	sourceBranch: string;
	targetBranch: string;
}

interface CreatePRParams {
	projectId: number;
	sourceBranch: string;
	targetBranch: string;
	title: string;
	description?: string;
}

export function createOnedevClient(config: OnedevConfig) {
	const baseUrl = config.url.replace(/\/+$/, "");
	const headers = {
		Authorization: `Bearer ${config.accessToken}`,
		"Content-Type": "application/json",
	};

	async function apiGet<T>(path: string): Promise<T> {
		const response = await fetch(`${baseUrl}${path}`, { headers });
		if (!response.ok) {
			throw new Error(
				`OneDev API error ${response.status}: ${await response.text()}`,
			);
		}
		return response.json() as Promise<T>;
	}

	async function apiGetText(path: string): Promise<string> {
		const response = await fetch(`${baseUrl}${path}`, { headers });
		if (!response.ok) {
			throw new Error(
				`OneDev API error ${response.status}: ${await response.text()}`,
			);
		}
		return response.text();
	}

	async function apiPost<T>(path: string, body: unknown): Promise<T> {
		const response = await fetch(`${baseUrl}${path}`, {
			method: "POST",
			headers,
			body: JSON.stringify(body),
		});
		if (!response.ok) {
			throw new Error(
				`OneDev API error ${response.status}: ${await response.text()}`,
			);
		}
		return response.json() as Promise<T>;
	}

	return {
		async getProjectByPath(
			projectPath: string,
		): Promise<{ id: number; defaultBranch: string } | null> {
			const query = encodeURIComponent(
				`"Path" is "${projectPath}"`,
			);
			const projects = await apiGet<OnedevProject[]>(
				`/~api/projects?query=${query}&offset=0&count=1`,
			);
			if (projects.length === 0) {
				return null;
			}
			// Default branch is a separate endpoint
			const defaultBranch = await apiGetText(
				`/~api/repositories/${projects[0].id}/default-branch`,
			);
			return {
				id: projects[0].id,
				defaultBranch: defaultBranch.trim() || "main",
			};
		},

		async findOpenPRWithUrl(
			projectId: number,
			sourceBranch: string,
			projectPath: string,
		): Promise<string | null> {
			const query = encodeURIComponent(
				`"Source Branch" is "${sourceBranch}" and open`,
			);
			const prs = await apiGet<OnedevPullRequest[]>(
				`/~api/pulls?query=${query}&offset=0&count=1`,
			);
			if (prs.length === 0) {
				return null;
			}
			return `${baseUrl}/${projectPath}/~pulls/${prs[0].id}`;
		},

		async createPR(
			params: CreatePRParams,
			projectPath: string,
		): Promise<{ id: number; url: string }> {
			const prId = await apiPost<number>("/~api/pulls", {
				targetProjectId: params.projectId,
				sourceProjectId: params.projectId,
				sourceBranch: params.sourceBranch,
				targetBranch: params.targetBranch,
				title: params.title,
				description: params.description ?? "",
				mergeStrategy: "CREATE_MERGE_COMMIT",
			});
			return {
				id: prId,
				url: `${baseUrl}/${projectPath}/~pulls/${prId}`,
			};
		},

		async testConnection(): Promise<boolean> {
			try {
				await apiGet<OnedevProject[]>(
					"/~api/projects?offset=0&count=1",
				);
				return true;
			} catch {
				return false;
			}
		},
	};
}
