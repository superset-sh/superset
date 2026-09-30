import { describe, expect, test } from "bun:test";
import type { RepositoryIdentity } from "@superset/shared/source-control";
import { TRPCError } from "@trpc/server";
import type { GitLabClient } from "../../../../source-control/gitlab/gitlab";
import { searchGitLabMergeRequestsPage } from "./search-gitlab-merge-requests";

function identity(
	repoPath: string,
	instance = "https://gitlab.example.com",
): RepositoryIdentity {
	const slash = repoPath.lastIndexOf("/");
	return {
		provider: "gitlab",
		instance,
		repoPath,
		owner: repoPath.slice(0, slash),
		name: repoPath.slice(slash + 1),
		url: `${instance}/${repoPath}`,
	};
}

function mr(iid: number, updatedAt: string, repoPath: string) {
	return {
		iid,
		title: `MR ${iid}`,
		web_url: `https://gitlab.example.com/${repoPath}/-/merge_requests/${iid}`,
		state: "opened",
		draft: false,
		source_branch: `branch-${iid}`,
		target_branch: "main",
		updated_at: updatedAt,
	};
}

describe("GitLab merge request search", () => {
	test("keeps equal IIDs from different projects and preserves cursor order", async () => {
		const projectA = identity("group/one");
		const projectB = identity("group/two");
		const first = mr(42, "2026-01-03T00:00:00Z", projectA.repoPath);
		const second = mr(42, "2026-01-02T00:00:00Z", projectB.repoPath);
		const third = mr(41, "2026-01-01T00:00:00Z", projectA.repoPath);
		const client = {
			api: async (_identity: unknown, endpoint: string) =>
				endpoint.includes("group%2Fone") ? [first, third] : [second],
		} as unknown as GitLabClient;
		const projects = [
			{ projectId: "one", identity: projectA },
			{ projectId: "two", identity: projectB },
		];
		const page1 = await searchGitLabMergeRequestsPage({
			client,
			projects,
			query: "",
			limit: 2,
			page: 1,
		});
		expect(
			page1.pullRequests.map((row) => [row.projectId, row.prNumber]),
		).toEqual([
			["one", 42],
			["two", 42],
		]);
		expect(page1.hasNextPage).toBe(true);
		if (!page1.nextCursor) throw new Error("Expected continuation cursor");
		const page2 = await searchGitLabMergeRequestsPage({
			client,
			projects,
			query: "",
			limit: 2,
			page: 2,
			cursor: page1.nextCursor,
		});
		expect(
			page2.pullRequests.map((row) => [row.projectId, row.prNumber]),
		).toEqual([["one", 41]]);
		expect(page2.hasNextPage).toBe(false);
	});

	test("rejects a URL for another instance without making an API call", async () => {
		let calls = 0;
		const client = {
			api: async () => {
				calls += 1;
				return [];
			},
		} as unknown as GitLabClient;
		const page = await searchGitLabMergeRequestsPage({
			client,
			projects: [{ projectId: "one", identity: identity("group/one") }],
			query: "https://another.example.com/group/one/-/merge_requests/42",
			limit: 30,
			page: 1,
		});
		expect(page.repoMismatch).toContain("gitlab.example.com");
		expect(calls).toBe(0);
	});

	test("rejects an altered cursor instead of trusting its project rows", async () => {
		const project = identity("group/one");
		const client = {
			api: async () =>
				Array.from({ length: 30 }, (_, index) =>
					mr(index + 1, "2026-01-03T00:00:00Z", project.repoPath),
				),
		} as unknown as GitLabClient;
		const args = {
			client,
			projects: [{ projectId: "one", identity: project }],
			query: "",
			limit: 1,
			page: 1,
		};
		const page = await searchGitLabMergeRequestsPage(args);
		expect(page.nextCursor).toBeTruthy();
		await expect(
			searchGitLabMergeRequestsPage({
				...args,
				page: 2,
				cursor: `${page.nextCursor}changed`,
			}),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
	});

	test("limits fan-out to four calls and reports a failed project beside results", async () => {
		const projects = Array.from({ length: 6 }, (_, index) => ({
			projectId: String(index),
			identity: identity(`group/project-${index}`),
		}));
		let active = 0;
		let peak = 0;
		const client = {
			api: async (_identity: unknown, endpoint: string) => {
				active += 1;
				peak = Math.max(peak, active);
				await new Promise((resolve) => setTimeout(resolve, 1));
				active -= 1;
				if (endpoint.includes("project-2")) {
					throw new TRPCError({
						code: "TOO_MANY_REQUESTS",
						message: "Rate limited",
					});
				}
				return [mr(42, "2026-01-03T00:00:00Z", "group/project-1")];
			},
		} as unknown as GitLabClient;
		const page = await searchGitLabMergeRequestsPage({
			client,
			projects,
			query: "",
			limit: 30,
			page: 1,
		});
		expect(peak).toBe(4);
		expect(page.pullRequests).toHaveLength(5);
		expect(page.partialErrors).toEqual([
			{ projectId: "2", message: "Rate limited" },
		]);
	});
});
