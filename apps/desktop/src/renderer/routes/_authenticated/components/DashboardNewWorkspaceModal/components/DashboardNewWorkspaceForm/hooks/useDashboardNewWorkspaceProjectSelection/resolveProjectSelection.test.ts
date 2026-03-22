import { describe, expect, it } from "bun:test";
import {
	resolveGithubRepositoryFromLocalProject,
	resolveLocalProject,
} from "./resolveProjectSelection";

describe("resolveLocalProject", () => {
	const localProjects = [
		{
			id: "local-1",
			name: "superset",
			mainRepoPath: "/Users/example/code/superset",
			githubOwner: "superset",
		},
		{
			id: "local-2",
			name: "other",
			mainRepoPath: "/Users/example/code/other",
			githubOwner: "superset",
		},
	];

	it("matches a linked GitHub repository by owner and repo name", () => {
		const result = resolveLocalProject({
			selectedProject: null,
			linkedGithubRepository: {
				id: "repo-1",
				owner: "superset",
				name: "superset",
			},
			localProjects,
		});

		expect(result?.id).toBe("local-1");
	});

	it("falls back to matching by selected project slug", () => {
		const result = resolveLocalProject({
			selectedProject: {
				id: "cloud-1",
				name: "Superset App",
				slug: "superset",
				githubRepositoryId: null,
			},
			linkedGithubRepository: null,
			localProjects,
		});

		expect(result?.id).toBe("local-1");
	});

	it("returns null when the fallback match is ambiguous", () => {
		const result = resolveLocalProject({
			selectedProject: {
				id: "cloud-1",
				name: "Local Repo",
				slug: "missing-slug",
				githubRepositoryId: null,
			},
			linkedGithubRepository: null,
			localProjects: [
				{
					id: "local-1",
					name: "Local Repo",
					mainRepoPath: "/Users/example/code/first-repo",
					githubOwner: "superset",
				},
				{
					id: "local-2",
					name: "Local Repo",
					mainRepoPath: "/Users/example/work/second-repo",
					githubOwner: "superset",
				},
			],
		});

		expect(result).toBeNull();
	});
});

describe("resolveGithubRepositoryFromLocalProject", () => {
	const githubRepositories = [
		{ id: "repo-1", owner: "superset", name: "superset" },
		{ id: "repo-2", owner: "superset", name: "other" },
	];

	it("matches by cached owner and repo directory name", () => {
		const result = resolveGithubRepositoryFromLocalProject({
			localProject: {
				id: "local-1",
				name: "Superset Desktop",
				mainRepoPath: "/Users/example/code/superset",
				githubOwner: "superset",
			},
			githubRepositories,
		});

		expect(result?.id).toBe("repo-1");
	});

	it("uses the fetched GitHub owner when the local cache is empty", () => {
		const result = resolveGithubRepositoryFromLocalProject({
			localProject: {
				id: "local-1",
				name: "Superset Desktop",
				mainRepoPath: "/Users/example/code/superset",
				githubOwner: null,
			},
			githubRepositories,
			githubOwner: "superset",
		});

		expect(result?.id).toBe("repo-1");
	});

	it("returns null when multiple repositories match", () => {
		const result = resolveGithubRepositoryFromLocalProject({
			localProject: {
				id: "local-1",
				name: "superset",
				mainRepoPath: "/Users/example/code/superset",
				githubOwner: "superset",
			},
			githubRepositories: [
				...githubRepositories,
				{ id: "repo-3", owner: "superset", name: "superset" },
			],
		});

		expect(result).toBeNull();
	});
});
