import { describe, expect, mock, test } from "bun:test";
import type { RepositoryIdentity } from "@superset/shared/source-control";
import type { GitLabClient } from "./gitlab";
import {
	getGitLabMergeRequestContent,
	getGitLabMergeRequestThreads,
	mapGitLabChecksStatus,
	mapGitLabPipelineStatus,
} from "./merge-requests";

const identity: RepositoryIdentity = {
	provider: "gitlab",
	instance: "https://gitlab.example.com",
	repoPath: "team/backend/api",
	owner: "team/backend",
	name: "api",
	url: "https://gitlab.example.com/team/backend/api",
	projectId: 42,
};

const mergeRequest = {
	iid: 7,
	title: "Improve API",
	description: "Review this change",
	web_url: "https://gitlab.example.com/team/backend/api/-/merge_requests/7",
	state: "opened",
	draft: false,
	sha: "a".repeat(40),
	source_branch: "feature/api",
	target_branch: "main",
	source_project_id: 42,
	target_project_id: 42,
	author: {
		username: "alice.dev",
		avatar_url: "https://gitlab.example.com/avatar.png",
	},
	head_pipeline: { id: 100, status: "success" },
	user: { can_merge: true },
	detailed_merge_status: "mergeable",
};

describe("GitLab merge requests", () => {
	test("maps pipeline states without treating unknown states as success", () => {
		expect(mapGitLabPipelineStatus("running")).toBe("pending");
		expect(mapGitLabPipelineStatus("manual")).toBe("pending");
		expect(mapGitLabPipelineStatus("failed")).toBe("failure");
		expect(mapGitLabPipelineStatus("canceled")).toBe("cancelled");
		expect(mapGitLabChecksStatus("skipped")).toBe("pending");
		expect(mapGitLabChecksStatus("canceled")).toBe("failure");
	});

	test("keeps optional job failures separate from required status and reads merge settings", async () => {
		const api = mock(async (_identity: unknown, endpoint: string) => {
			if (endpoint.includes("/merge_requests/7")) return mergeRequest;
			if (endpoint.includes("/pipelines/100/jobs")) {
				return [
					{ id: 1, name: "required", status: "success", allow_failure: false },
					{ id: 2, name: "optional", status: "failed", allow_failure: true },
				];
			}
			if (endpoint === "/user") return { username: "alice.dev" };
			return { merge_method: "merge", squash_option: "default_off" };
		});
		const client = { api } as unknown as GitLabClient;
		const content = await getGitLabMergeRequestContent(client, identity, 7);
		expect(content.checksStatus).toBe("success");
		expect(content.checks[1]).toMatchObject({
			status: "failure",
			allowFailure: true,
		});
		expect(content.headSha).toBe("a".repeat(40));
		expect(content.capabilities).toMatchObject({
			canMerge: true,
			mergeMethods: ["merge", "squash"],
			canClose: true,
			canReply: true,
		});
	});

	test("preserves discussion IDs and note IDs for scoped mutations", async () => {
		const client = {
			api: async () => [
				{
					id: "discussion-hash",
					notes: [
						{
							id: 19,
							body: "Please check this line",
							created_at: "2026-01-01T00:00:00Z",
							resolved: false,
							author: { username: "reviewer.one", avatar_url: null },
							position: { new_path: "src/api.ts", new_line: 12 },
						},
					],
				},
			],
		} as unknown as GitLabClient;
		const threads = await getGitLabMergeRequestThreads(client, identity, 7);
		expect(threads[0]).toMatchObject({
			id: "discussion-hash",
			path: "src/api.ts",
			line: 12,
			comments: [{ databaseId: 19, author: { login: "reviewer.one" } }],
		});
	});

	test("loads every job and discussion page without parallel fan-out", async () => {
		const job = { id: 1, name: "build", status: "success" };
		const discussion = {
			id: "discussion-1",
			notes: [{ id: 19, body: "Review", created_at: "2026-01-01T00:00:00Z" }],
		};
		const endpoints: string[] = [];
		let inFlight = 0;
		let peakInFlight = 0;
		const client = {
			api: async (_identity: unknown, endpoint: string) => {
				inFlight += 1;
				peakInFlight = Math.max(peakInFlight, inFlight);
				endpoints.push(endpoint);
				await Promise.resolve();
				inFlight -= 1;
				if (endpoint.includes("/merge_requests/7/discussions")) {
					return endpoint.includes("&page=2")
						? [{ ...discussion, id: "discussion-101" }]
						: Array.from({ length: 100 }, (_, index) => ({
								...discussion,
								id: `discussion-${index + 1}`,
							}));
				}
				if (endpoint.includes("/merge_requests/7")) return mergeRequest;
				if (endpoint.includes("/pipelines/100/jobs")) {
					return endpoint.includes("&page=2")
						? [{ ...job, id: 101 }]
						: Array.from({ length: 100 }, (_, index) => ({
								...job,
								id: index + 1,
							}));
				}
				if (endpoint === "/user") return { username: "alice.dev" };
				return { merge_method: "merge", squash_option: "default_off" };
			},
		} as unknown as GitLabClient;
		const [content, threads] = await Promise.all([
			getGitLabMergeRequestContent(client, identity, 7),
			getGitLabMergeRequestThreads(client, identity, 7),
		]);
		expect(content.checks).toHaveLength(101);
		expect(threads).toHaveLength(101);
		expect(content.checks[100]?.jobId).toBe(101);
		expect(threads[100]?.id).toBe("discussion-101");
		expect(endpoints).toContain(
			"/projects/42/pipelines/100/jobs?per_page=100&page=2",
		);
		expect(endpoints).toContain(
			"/projects/42/merge_requests/7/discussions?per_page=100&page=2",
		);
		expect(peakInFlight).toBeLessThanOrEqual(4);
	});

	test("reports an explicit error when discussions exceed the safety limit", async () => {
		const api = mock(async () =>
			Array.from({ length: 100 }, () => ({
				id: "discussion",
				notes: [{ id: 19, body: "Review", created_at: "2026-01-01T00:00:00Z" }],
			})),
		);
		const client = { api } as unknown as GitLabClient;
		await expect(
			getGitLabMergeRequestThreads(client, identity, 7),
		).rejects.toThrow("too many discussions");
		expect(api).toHaveBeenCalledTimes(20);
	});

	test("reports an explicit error when pipeline jobs exceed the safety limit", async () => {
		const api = mock(async (_identity: unknown, endpoint: string) => {
			if (endpoint.includes("/merge_requests/7")) return mergeRequest;
			if (endpoint.includes("/pipelines/100/jobs")) {
				return Array.from({ length: 100 }, (_, index) => ({
					id: index + 1,
					name: "build",
					status: "success",
				}));
			}
			if (endpoint === "/user") return { username: "alice.dev" };
			return { merge_method: "merge", squash_option: "default_off" };
		});
		const client = { api } as unknown as GitLabClient;
		await expect(
			getGitLabMergeRequestContent(client, identity, 7),
		).rejects.toThrow("too many pipeline jobs");
		expect(
			api.mock.calls.filter((call) =>
				String(call[1]).includes("/pipelines/100/jobs"),
			),
		).toHaveLength(20);
	});
});
