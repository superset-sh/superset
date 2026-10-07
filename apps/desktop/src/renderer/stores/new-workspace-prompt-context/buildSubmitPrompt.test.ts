import { beforeEach, expect, test } from "bun:test";
import { gitLabIssuePromptKey } from "renderer/routes/_authenticated/utils/linkedIssueFromGitLab";
import type { LinkedIssue } from "../new-workspace-draft";
import { buildSubmitPrompt } from "./buildSubmitPrompt";
import { pullRequestPromptKey } from "./pullRequestPromptKey";
import { useNewWorkspacePromptContextStore } from "./store";

beforeEach(() =>
	useNewWorkspacePromptContextStore.setState({ entries: new Map() }),
);

test("the actual builder includes a native GitLab issue rather than dropping it", () => {
	const issue = {
		source: "gitlab",
		slug: "gitlab-reference",
		title: "Native issue",
		number: 7,
		url: "https://git.example:8443/Group/Sub/Repo/-/issues/7",
		gitlab: {
			projectId: "p",
			hostId: "h",
			hostUrl: "https://relay.example/h",
			host: "git.example:8443",
			owner: "Group/Sub",
			repo: "Repo",
			issueNumber: 7,
			expectedIssueUrl: "https://git.example:8443/Group/Sub/Repo/-/issues/7",
		},
	} as unknown as LinkedIssue;
	const target = {
		organizationId: "o",
		projectId: "p",
		hostId: "h",
		hostUrl: "https://relay.example/h",
	};
	const key = required(gitLabIssuePromptKey(issue, target));
	useNewWorkspacePromptContextStore.setState({
		entries: new Map([
			[key, { state: "ready", body: { text: "Verified native description" } }],
		]),
	});
	const result = buildSubmitPrompt({
		userPrompt: "Investigate",
		linkedPR: null,
		linkedIssues: [issue],
		gitlabTarget: target,
	});
	expect(result).toBe(
		"Investigate\n\n## Linked GitLab issue — #7: Native issue\nhttps://git.example:8443/Group/Sub/Repo/-/issues/7\n\nVerified native description",
	);
	expect(() =>
		buildSubmitPrompt({
			userPrompt: "Investigate",
			linkedPR: null,
			linkedIssues: [issue],
		}),
	).toThrow();
	useNewWorkspacePromptContextStore.setState({
		entries: new Map([[key, { state: "failed" }]]),
	});
	expect(() =>
		buildSubmitPrompt({
			userPrompt: "Investigate",
			linkedPR: null,
			linkedIssues: [issue],
			gitlabTarget: target,
		}),
	).toThrow();
});

test("existing provider context and heading order stay exact", () => {
	expect(
		buildSubmitPrompt({
			userPrompt: " Investigate ",
			linkedPR: {
				prNumber: 9,
				title: "Change",
				url: "https://github.com/T/R/pull/9",
				state: "open",
			},
			linkedIssues: [
				{ slug: "task-a", title: "Task", source: "internal", taskId: "task-a" },
				{
					slug: "LIN-1",
					title: "Linear",
					source: "linear",
					url: "https://linear.app/1",
				},
				{
					slug: "gh-7",
					title: "Issue",
					source: "github",
					number: 7,
					url: "https://github.com/T/R/issues/7",
				},
			],
		}),
	).toBe(
		"Investigate\n\n## Linked task — task-a: Task\n\n## Linked Linear issue — LIN-1: Linear\nhttps://linear.app/1\n\n## Linked GitHub issue — #7: Issue\nhttps://github.com/T/R/issues/7\n\n## Linked PR — #9: Change\nhttps://github.com/T/R/pull/9",
	);
});

function required<T>(value: T | null | undefined): T {
	if (value == null) throw Error("Required fixture value missing");
	return value;
}

test("native linked MR has its own label and complete body cache scope", () => {
	const linkedPR = {
		prNumber: 7,
		title: "Native change",
		state: "open",
		url: "https://git.example:8443/Group/Sub/Repo/-/merge_requests/7",
	};
	const target = { projectId: "p", hostUrl: "https://relay.example/o/h" };
	const key = required(pullRequestPromptKey(linkedPR, target));
	useNewWorkspacePromptContextStore.setState({
		entries: new Map([
			[key, { state: "ready", body: { text: "Verified native MR body" } }],
			["pr:7", { state: "ready", body: { text: "Foreign Github body" } }],
		]),
	});
	const result = buildSubmitPrompt({
		userPrompt: "",
		linkedIssues: [],
		linkedPR,
		pullRequestTarget: target,
	});
	expect(result).toContain("## Linked GitLab MR — #7");
	expect(result).toContain("Verified native MR body");
	expect(result).not.toContain("Foreign Github body");
	for (const changed of [
		{ ...target, projectId: "other" },
		{ ...target, hostUrl: "https://relay.example/other" },
	])
		expect(
			buildSubmitPrompt({
				userPrompt: "",
				linkedIssues: [],
				linkedPR,
				pullRequestTarget: changed,
			}),
		).not.toContain("Verified native MR body");
});
