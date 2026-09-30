import { describe, expect, test } from "bun:test";
import type { RepositoryIdentity } from "@superset/shared/source-control";
import { createGitLabClient } from "./gitlab";

const repository: RepositoryIdentity = {
	provider: "gitlab",
	instance: "https://gitlab.example.com",
	repoPath: "team/subgroup/widgets",
	owner: "team/subgroup",
	name: "widgets",
	url: "https://gitlab.example.com/team/subgroup/widgets",
};

describe("GitLab project client", () => {
	test("uses the full encoded namespace and retains the numeric project ID", async () => {
		const calls: string[] = [];
		const client = createGitLabClient({
			runner: async ({ endpoint }) => {
				calls.push(endpoint);
				return {
					id: 123,
					path_with_namespace: "team/subgroup/widgets",
					web_url: repository.url,
				};
			},
		});
		expect(await client.getProject(repository)).toEqual({
			id: 123,
			path_with_namespace: "team/subgroup/widgets",
			web_url: repository.url,
		});
		expect(calls).toEqual(["projects/team%2Fsubgroup%2Fwidgets"]);
	});
});
