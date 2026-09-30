import { describe, expect, test } from "bun:test";
import type { RepositoryIdentity } from "@superset/shared/source-control";
import { searchGitLabIssuesForProjects } from "./search-gitlab-issues";

type TestRepo = RepositoryIdentity & { repoPathLocal: string };

function repo(instance: string, repoPath: string, projectId: number): TestRepo {
	const segments = repoPath.split("/");
	return {
		provider: "gitlab",
		instance,
		repoPath,
		owner: segments.slice(0, -1).join("/"),
		name: segments.at(-1) ?? "",
		url: `${instance}/${repoPath}`,
		projectId,
		repoPathLocal: "/tmp/test-repo",
	};
}

function issue(identity: TestRepo, iid: number, updatedAt: string) {
	return {
		iid,
		title: `Issue ${iid}`,
		description: `Body from ${identity.instance}`,
		web_url: `${identity.instance}/${identity.repoPath}/-/issues/${iid}`,
		state: "opened",
		author: { username: "alice.name_1" },
		updated_at: updatedAt,
		project_id: identity.projectId,
	};
}

function deps(
	projects: Record<string, TestRepo>,
	api: (identity: RepositoryIdentity, endpoint: string) => Promise<unknown>,
) {
	return {
		resolve: async (projectId: string) => {
			const identity = projects[projectId];
			if (!identity) throw new Error("Project is unavailable");
			return identity;
		},
		client: {
			api: async <T>(identity: RepositoryIdentity, endpoint: string) =>
				(await api(identity, endpoint)) as T,
		},
	};
}

describe("searchGitLabIssuesForProjects", () => {
	const first = repo("https://gitlab.com", "group/subgroup/project", 11);
	const second = repo(
		"https://gitlab.example.com:8443",
		"group/subgroup/project",
		22,
	);

	test("keeps identical IIDs from different instances separate", async () => {
		const calls: string[] = [];
		const result = await searchGitLabIssuesForProjects(
			{ projectId: "first", projectIds: ["first", "second"], query: "#42" },
			deps({ first, second }, async (identity, endpoint) => {
				calls.push(`${identity.instance} ${endpoint}`);
				return [issue(identity as TestRepo, 42, "2026-09-01T00:00:00Z")];
			}),
		);
		expect(
			result.issues.map(({ instance, issueNumber }) => [instance, issueNumber]),
		).toEqual([
			[first.instance, 42],
			[second.instance, 42],
		]);
		expect(result.issues[0]?.body).toBe("Body from https://gitlab.com");
		expect(calls).toHaveLength(2);
		expect(calls[0]).toContain("iids%5B%5D=42");
		expect(result.totalCount).toBe(2);
	});

	test("routes a full URL only to its matching nested project", async () => {
		const calls: string[] = [];
		const query = `${second.instance}/${second.repoPath}/-/issues/42`;
		const result = await searchGitLabIssuesForProjects(
			{ projectId: "first", projectIds: ["first", "second"], query },
			deps({ first, second }, async (identity, endpoint) => {
				calls.push(`${identity.instance} ${endpoint}`);
				return [issue(second, 42, "2026-09-01T00:00:00Z")];
			}),
		);
		expect(result.issues).toHaveLength(1);
		expect(result.issues[0]?.projectId).toBe("second");
		expect(calls).toHaveLength(1);
		expect(calls[0]).toContain(second.instance);

		const mismatch = await searchGitLabIssuesForProjects(
			{
				projectId: "first",
				projectIds: ["first", "second"],
				query: "https://other.example.com/group/subgroup/project/-/issues/42",
			},
			deps({ first, second }, async () => {
				throw new Error("The API must not be called");
			}),
		);
		expect(mismatch.issues).toEqual([]);
		expect(mismatch.repoMismatch).toContain(first.instance);
	});

	test("paginates multiple projects with unknown totals and no repeated rows", async () => {
		const data = new Map([
			[
				first.instance,
				Array.from({ length: 35 }, (_, index) =>
					issue(
						first,
						index + 1,
						new Date(Date.UTC(2026, 8, 30 - index)).toISOString(),
					),
				),
			],
			[
				second.instance,
				Array.from({ length: 35 }, (_, index) =>
					issue(
						second,
						index + 1,
						new Date(Date.UTC(2026, 8, 29 - index)).toISOString(),
					),
				),
			],
		]);
		const dependencies = deps({ first, second }, async (identity, endpoint) => {
			const url = new URL(endpoint, "https://unused.example/");
			const page = Number(url.searchParams.get("page"));
			const perPage = Number(url.searchParams.get("per_page"));
			return (
				data
					.get(identity.instance)
					?.slice((page - 1) * perPage, page * perPage) ?? []
			);
		});
		const seen = new Set<string>();
		let cursor: string | undefined;
		let page = 1;
		while (page <= 9) {
			const result = await searchGitLabIssuesForProjects(
				{
					projectId: "first",
					projectIds: ["first", "second"],
					query: "bug",
					limit: 10,
					page,
					cursor,
				},
				dependencies,
			);
			expect(result.totalCount).toBeUndefined();
			for (const item of result.issues) {
				const key = `${item.instance}/${item.repoPath}#${item.issueNumber}`;
				expect(seen.has(key)).toBe(false);
				seen.add(key);
			}
			if (!result.hasNextPage) break;
			expect(result.nextCursor).toBeTruthy();
			cursor = result.nextCursor;
			page++;
		}
		expect(seen.size).toBe(70);
	});

	test("limits concurrent API requests to four", async () => {
		const projects = Object.fromEntries(
			Array.from({ length: 9 }, (_, index) => [
				String(index),
				repo("https://gitlab.com", `group/project-${index}`, index + 1),
			]),
		);
		let active = 0;
		let peak = 0;
		await searchGitLabIssuesForProjects(
			{ projectId: "0", projectIds: Object.keys(projects) },
			deps(projects, async () => {
				active++;
				peak = Math.max(peak, active);
				await new Promise((resolve) => setTimeout(resolve, 2));
				active--;
				return [];
			}),
		);
		expect(peak).toBe(4);
	});

	test("reports a failed project without hiding another project's issues", async () => {
		const result = await searchGitLabIssuesForProjects(
			{ projectId: "first", projectIds: ["first", "second"], query: "bug" },
			deps({ first, second }, async (identity) => {
				if (identity.instance === second.instance) {
					throw new Error("GitLab is rate limiting this instance");
				}
				return [issue(first, 1, "2026-09-01T00:00:00Z")];
			}),
		);
		expect(result.issues).toHaveLength(1);
		expect(result.partialErrors).toEqual([
			{ projectId: "second", message: "GitLab is rate limiting this instance" },
		]);
	});

	test("does not report success when every project is unavailable", async () => {
		await expect(
			searchGitLabIssuesForProjects(
				{ projectId: "first", projectIds: ["first", "second"] },
				deps({}, async () => []),
			),
		).rejects.toThrow("Project is unavailable");
	});

	test("does not report success when every API request fails", async () => {
		await expect(
			searchGitLabIssuesForProjects(
				{ projectId: "first", projectIds: ["first", "second"] },
				deps({ first, second }, async () => {
					throw new Error("GitLab authentication failed");
				}),
			),
		).rejects.toThrow("GitLab authentication failed");
	});

	test("rejects a cursor after the query changes", async () => {
		const data = Array.from({ length: 30 }, (_, index) =>
			issue(first, index + 1, "2026-09-01T00:00:00Z"),
		);
		const dependencies = deps({ first }, async () => data);
		const firstPage = await searchGitLabIssuesForProjects(
			{ projectId: "first", query: "bug", limit: 5 },
			dependencies,
		);
		await expect(
			searchGitLabIssuesForProjects(
				{
					projectId: "first",
					query: "other",
					limit: 5,
					cursor: firstPage.nextCursor,
				},
				dependencies,
			),
		).rejects.toThrow("Refresh the results");
	});
});
