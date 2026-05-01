import { describe, expect, test } from "bun:test";
import {
	type CloudProjectInput,
	type GithubRepoInput,
	joinSidebarProjects,
	type SidebarProjectInput,
} from "./joinSidebarProjects";

function sidebar(
	projectId: string,
	overrides: Partial<SidebarProjectInput> = {},
): SidebarProjectInput {
	return {
		projectId,
		tabOrder: 1,
		isCollapsed: false,
		...overrides,
	};
}

function cloudProject(
	id: string,
	overrides: Partial<CloudProjectInput> = {},
): CloudProjectInput {
	return {
		id,
		name: `Project ${id}`,
		slug: id,
		githubRepositoryId: null,
		createdAt: new Date("2026-01-01T00:00:00Z"),
		updatedAt: new Date("2026-01-02T00:00:00Z"),
		...overrides,
	};
}

function repo(
	id: string,
	overrides: Partial<GithubRepoInput> = {},
): GithubRepoInput {
	return {
		id,
		owner: "acme",
		name: `repo-${id}`,
		...overrides,
	};
}

describe("joinSidebarProjects", () => {
	// Reproduces #3818: after a project is created the local sidebar collection
	// gets an entry synchronously, but the cloud-synced v2_projects row only
	// arrives once Electric replays the new row. With an inner join the sidebar
	// would render no rows during this window — the symptom users report.
	test("returns the sidebar entry even when the cloud project row has not synced yet", () => {
		const result = joinSidebarProjects([sidebar("new-project")], [], []);

		expect(result).toHaveLength(1);
		expect(result[0]?.id).toBe("new-project");
		expect(result[0]?.isCollapsed).toBe(false);
	});

	test("populates project + repo fields once the cloud rows are synced", () => {
		const result = joinSidebarProjects(
			[sidebar("p1")],
			[
				cloudProject("p1", {
					name: "Apex",
					slug: "apex",
					githubRepositoryId: "repo-1",
				}),
			],
			[repo("repo-1", { owner: "superset-sh", name: "apex" })],
		);

		expect(result[0]).toMatchObject({
			id: "p1",
			name: "Apex",
			slug: "apex",
			githubRepositoryId: "repo-1",
			githubOwner: "superset-sh",
			githubRepoName: "apex",
		});
	});

	test("orders sidebar projects by tabOrder ascending", () => {
		const result = joinSidebarProjects(
			[
				sidebar("c", { tabOrder: 3 }),
				sidebar("a", { tabOrder: 1 }),
				sidebar("b", { tabOrder: 2 }),
			],
			[],
			[],
		);

		expect(result.map((p) => p.id)).toEqual(["a", "b", "c"]);
	});

	test("leaves repo fields null when the project has no linked GitHub repo", () => {
		const result = joinSidebarProjects(
			[sidebar("p1")],
			[cloudProject("p1", { githubRepositoryId: null })],
			[repo("repo-1")],
		);

		expect(result[0]?.githubRepositoryId).toBe(null);
		expect(result[0]?.githubOwner).toBe(null);
		expect(result[0]?.githubRepoName).toBe(null);
	});

	test("leaves repo fields null when the linked repo has not synced yet", () => {
		const result = joinSidebarProjects(
			[sidebar("p1")],
			[cloudProject("p1", { githubRepositoryId: "repo-missing" })],
			[],
		);

		expect(result[0]?.githubRepositoryId).toBe("repo-missing");
		expect(result[0]?.githubOwner).toBe(null);
		expect(result[0]?.githubRepoName).toBe(null);
	});
});
