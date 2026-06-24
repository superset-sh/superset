import { assertSafeGitLabHost } from "@/lib/gitlab/ssrf";

export interface GitLabUser {
	id: number;
	username: string;
	name: string;
}

export interface GitLabGroup {
	id: number;
	name: string;
	full_path: string;
}

export interface GitLabProject {
	id: number;
	path: string;
	path_with_namespace: string;
	default_branch: string | null;
	visibility: string;
	namespace: { full_path: string };
}

/** GitLab MR with the fields needed for the §6 review/merge fidelity model. */
export interface GitLabMergeRequest {
	id: number;
	iid: number;
	project_id: number;
	title: string;
	web_url: string;
	source_branch: string;
	target_branch: string;
	sha: string | null;
	state: string; // opened | closed | merged | locked
	draft?: boolean;
	author: { username: string; avatar_url: string | null } | null;
	detailed_merge_status?: string;
	has_conflicts?: boolean;
	blocking_discussions_resolved?: boolean;
	merged_at: string | null;
	closed_at: string | null;
	updated_at: string;
	head_pipeline?: { status: string; web_url: string } | null;
}

export interface GitLabApprovals {
	approvals_required?: number;
	approvals_left?: number;
	approved_by?: { user: { username: string } }[];
}

export interface GitLabProjectHook {
	id: number;
	url: string;
}

/**
 * Minimal server-side GitLab REST (v4) client, bound to a validated host + token.
 * Use `create()` so the host is SSRF-checked each lifecycle (spec §7). Both OAuth
 * access tokens and Group/Personal Access Tokens authenticate via Bearer.
 */
export class GitLabClient {
	private constructor(
		private readonly origin: string,
		private readonly token: string,
	) {}

	static async create(host: string, token: string): Promise<GitLabClient> {
		const origin = await assertSafeGitLabHost(host);
		return new GitLabClient(origin, token);
	}

	async request<T>(path: string, init?: RequestInit): Promise<T> {
		const res = await fetch(`${this.origin}/api/v4${path}`, {
			...init,
			headers: {
				Authorization: `Bearer ${this.token}`,
				...init?.headers,
			},
		});
		if (!res.ok) {
			throw new Error(`GitLab API ${res.status} for ${path}`);
		}
		return (await res.json()) as T;
	}

	/** Fetches all pages of a list endpoint, following GitLab's `x-next-page` header. */
	async paginate<T>(path: string): Promise<T[]> {
		const out: T[] = [];
		let page = 1;
		for (;;) {
			const sep = path.includes("?") ? "&" : "?";
			const res = await fetch(
				`${this.origin}/api/v4${path}${sep}per_page=100&page=${page}`,
				{ headers: { Authorization: `Bearer ${this.token}` } },
			);
			if (!res.ok) {
				throw new Error(`GitLab API ${res.status} for ${path}`);
			}
			out.push(...((await res.json()) as T[]));
			const next = res.headers.get("x-next-page");
			if (!next) break;
			page = Number(next);
		}
		return out;
	}

	getCurrentUser(): Promise<GitLabUser> {
		return this.request<GitLabUser>("/user");
	}

	getGroup(groupId: string | number): Promise<GitLabGroup> {
		return this.request<GitLabGroup>(
			`/groups/${encodeURIComponent(String(groupId))}`,
		);
	}

	/** Projects in the group and its subgroups (becomes repositories rows). */
	listGroupProjects(groupId: string | number): Promise<GitLabProject[]> {
		const enc = encodeURIComponent(String(groupId));
		return this.paginate<GitLabProject>(
			`/groups/${enc}/projects?include_subgroups=true&archived=false&with_shared=false`,
		);
	}

	/**
	 * MRs across the group + subgroups. `GET /groups/:id/merge_requests` is Free on
	 * all tiers and supports `updated_after` for cheap incremental sync (spec §13).
	 */
	listGroupMergeRequests(
		groupId: string | number,
		updatedAfter?: Date,
	): Promise<GitLabMergeRequest[]> {
		const enc = encodeURIComponent(String(groupId));
		let path = `/groups/${enc}/merge_requests?state=all&scope=all`;
		if (updatedAfter) {
			path += `&updated_after=${encodeURIComponent(updatedAfter.toISOString())}`;
		}
		return this.paginate<GitLabMergeRequest>(path);
	}

	getMergeRequest(projectId: number, iid: number): Promise<GitLabMergeRequest> {
		return this.request<GitLabMergeRequest>(
			`/projects/${projectId}/merge_requests/${iid}`,
		);
	}

	getMergeRequestApprovals(
		projectId: number,
		iid: number,
	): Promise<GitLabApprovals> {
		return this.request<GitLabApprovals>(
			`/projects/${projectId}/merge_requests/${iid}/approvals`,
		);
	}

	listProjectHooks(projectId: number): Promise<GitLabProjectHook[]> {
		return this.request<GitLabProjectHook[]>(`/projects/${projectId}/hooks`);
	}

	/** Registers a project webhook. Free on all GitLab tiers (unlike group hooks). */
	createProjectHook(
		projectId: number,
		body: { url: string; token: string },
	): Promise<GitLabProjectHook> {
		return this.request<GitLabProjectHook>(`/projects/${projectId}/hooks`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				url: body.url,
				token: body.token,
				merge_requests_events: true,
				pipeline_events: true,
				note_events: true,
				push_events: false,
				enable_ssl_verification: true,
			}),
		});
	}
}
