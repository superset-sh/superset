import type { OnedevConfig } from "./git-provider";

interface OnedevProject {
	id: number;
	name: string;
	path: string;
	key: string | null;
	issueManagement: boolean;
}

interface OnedevPullRequest {
	id: number;
	number: number;
	title: string;
	sourceBranch: string;
	targetBranch: string;
	status: string;
}

export interface OnedevIssue {
	id: number;
	number: number;
	title: string;
	description: string | null;
	state: string;
	stateOrdinal: number;
	submitDate: string;
	projectId: number;
	submitterId: number;
	lastActivity: {
		date: string;
		description: string;
		userId: number;
	};
	confidential: boolean;
	commentCount: number;
	voteCount: number;
}

interface OnedevIssueFields {
	Type?: string;
	Priority?: string;
	Assignees?: string | null;
	[key: string]: string | null | undefined;
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
			const query = encodeURIComponent(`"Path" is "${projectPath}"`);
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
			_projectId: number,
			sourceBranch: string,
			projectPath: string,
		): Promise<{ id: number; number: number; url: string; title: string } | null> {
			const query = encodeURIComponent(
				`"Source Branch" is "${sourceBranch}" and open`,
			);
			const prs = await apiGet<OnedevPullRequest[]>(
				`/~api/pulls?query=${query}&offset=0&count=1`,
			);
			if (prs.length === 0) {
				return null;
			}
			const pr = prs[0];
			return {
				id: pr.id,
				number: pr.number ?? pr.id,
				url: `${baseUrl}/${projectPath}/~pulls/${pr.id}`,
				title: pr.title ?? "",
			};
		},

		async transitionIssueState(issueId: number, state: string): Promise<void> {
			const res = await fetch(`${baseUrl}/~api/issues/${issueId}/state-transitions`, {
				method: "POST",
				headers: { ...headers, "Content-Type": "application/json" },
				body: JSON.stringify({ state }),
			});
			if (!res.ok) {
				console.warn(`[onedev] Failed to transition issue ${issueId} to ${state}: ${res.status}`);
			}
		},

		async findReferencedOpenIssues(text: string, projectId: number): Promise<{ id: number; number: number }[]> {
			const matches = new Set<number>();
			const hashPattern = /#(\d+)/g;
			const slugPattern = /\b[a-zA-Z]+-(\d+)\b/g;
			let m: RegExpExecArray | null;
			while ((m = hashPattern.exec(text)) !== null) matches.add(Number(m[1]));
			while ((m = slugPattern.exec(text)) !== null) matches.add(Number(m[1]));
			if (matches.size === 0) return [];
			const allIssues = await apiGet<OnedevIssue[]>("/~api/issues?offset=0&count=100");
			return allIssues
				.filter((i) => i.projectId === projectId && matches.has(i.number) && i.state !== "Closed")
				.map((i) => ({ id: i.id, number: i.number }));
		},

		async findAllPRsForBranch(sourceBranch: string): Promise<{ id: number; status: string; title: string }[]> {
			const query = encodeURIComponent(`"Source Branch" is "${sourceBranch}"`);
			const prs = await apiGet<OnedevPullRequest[]>(
				`/~api/pulls?query=${query}&offset=0&count=5`,
			);
			return prs.map((pr) => ({ id: pr.id, status: pr.status ?? "UNKNOWN", title: pr.title ?? "" }));
		},

		async mergePR(prId: number, commitMessage?: string): Promise<void> {
			const res = await fetch(`${baseUrl}/~api/pulls/${prId}/merge`, {
				method: "POST",
				headers: {
					...headers,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					commitMessage: commitMessage ?? "",
					deleteSourceBranch: false,
				}),
			});
			if (!res.ok) {
				const text = await res.text().catch(() => "");
				throw new Error(`Merge failed: ${res.status} ${text}`);
			}
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

		async getProjectWithKey(projectPath: string): Promise<{
			id: number;
			key: string | null;
			issueManagement: boolean;
		} | null> {
			const query = encodeURIComponent(`"Path" is "${projectPath}"`);
			const projects = await apiGet<OnedevProject[]>(
				`/~api/projects?query=${query}&offset=0&count=1`,
			);
			if (projects.length === 0) {
				return null;
			}
			return {
				id: projects[0].id,
				key: projects[0].key,
				issueManagement: projects[0].issueManagement,
			};
		},

		async getIssues(
			projectId: number,
			options?: { query?: string; offset?: number; count?: number },
		): Promise<OnedevIssue[]> {
			const offset = options?.offset ?? 0;
			const count = options?.count ?? 100;
			const queryParts: string[] = [`"Project" is "project-${projectId}"`];
			if (options?.query) {
				queryParts.push(options.query);
			}
			// Default: show open issues, sorted by newest first
			const query = encodeURIComponent(
				`${queryParts.join(" and ")} order by "Submit Date" desc`,
			);
			return apiGet<OnedevIssue[]>(
				`/~api/issues?query=${query}&offset=${offset}&count=${count}`,
			);
		},

		async getIssuesByProjectPath(
			projectPath: string,
			options?: { stateFilter?: string; offset?: number; count?: number },
		): Promise<{ issues: OnedevIssue[]; projectKey: string | null }> {
			const project = await apiGet<OnedevProject[]>(
				`/~api/projects?query=${encodeURIComponent(`"Path" is "${projectPath}"`)}&offset=0&count=1`,
			);
			if (project.length === 0) {
				return { issues: [], projectKey: null };
			}
			const projectId = project[0].id;
			const offset = options?.offset ?? 0;
			const count = options?.count ?? 100;
			const stateFilter = options?.stateFilter ?? "all";
			// OneDev query API is limited — fetch all issues and filter client-side
			const allIssues = await apiGet<OnedevIssue[]>(
				`/~api/issues?offset=${offset}&count=${count}`,
			);
			const issues = allIssues.filter((issue) => {
				if (issue.projectId !== projectId) return false;
				if (stateFilter === "open") return issue.state !== "Closed";
				if (stateFilter === "closed") return issue.state === "Closed";
				return true;
			});
			return { issues, projectKey: project[0].key };
		},

		async getIssueFields(issueId: number): Promise<OnedevIssueFields> {
			return apiGet<OnedevIssueFields>(`/~api/issues/${issueId}/fields`);
		},

		async testConnection(): Promise<boolean> {
			try {
				await apiGet<OnedevProject[]>("/~api/projects?offset=0&count=1");
				return true;
			} catch {
				return false;
			}
		},
	};
}
