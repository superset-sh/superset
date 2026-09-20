import { expect, test } from "bun:test";
import { parseGitHubRepositories } from "./github-repositories";

test("flattens paginated GitHub repository results", () => {
	expect(
		parseGitHubRepositories([
			[
				{
					full_name: "superset-sh/superset",
					clone_url: "https://github.com/superset-sh/superset.git",
				},
			],
			[
				{
					full_name: "superset-sh/acme",
					clone_url: "https://github.com/superset-sh/acme.git",
				},
			],
		]),
	).toEqual([
		{
			fullName: "superset-sh/superset",
			cloneUrl: "https://github.com/superset-sh/superset.git",
		},
		{
			fullName: "superset-sh/acme",
			cloneUrl: "https://github.com/superset-sh/acme.git",
		},
	]);
});
