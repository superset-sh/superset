import { expect, test } from "bun:test";
import { getPullRequestReadInput } from "./getPullRequestReadInput";

test("native reads bind the selected project inside canonical host input", () => {
	expect(
		getPullRequestReadInput(
			{
				provider: "gitlab",
				host: "git.example:8443",
				repoFullName: "Team/Sub Group/Repo",
				number: 7,
			},
			"selected-project",
		),
	).toEqual({
		provider: "gitlab",
		expectedPullRequest: {
			projectId: "selected-project",
			provider: "gitlab",
			host: "git.example:8443",
			owner: "Team/Sub Group",
			repo: "Repo",
			pullNumber: 7,
			expectedUrl:
				"https://git.example:8443/Team/Sub%20Group/Repo/-/merge_requests/7",
		},
	});
});
test("GitHub legacy reads keep the original additive input", () => {
	expect(
		getPullRequestReadInput(
			{ repoFullName: "team/repo", number: 7 },
			"selected-project",
		),
	).toEqual({});
});
