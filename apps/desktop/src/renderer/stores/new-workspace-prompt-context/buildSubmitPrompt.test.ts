import { afterEach, describe, expect, test } from "bun:test";
import type {
	LinkedIssue,
	LinkedPR,
} from "renderer/stores/new-workspace-draft";
import { buildSubmitPrompt } from "./buildSubmitPrompt";
import { issueContextKey } from "./issue-context-key";
import { requestContextKey } from "./request-context-key";
import { useNewWorkspacePromptContextStore } from "./store";

const issueA: LinkedIssue = {
	slug: "gl-a-42",
	title: "First issue",
	source: "gitlab",
	url: "https://gitlab.example.com/group/a/-/issues/42",
	number: 42,
	projectId: "project-a",
	hostId: "host-a",
	instance: "https://gitlab.example.com",
	repoPath: "group/a",
};

const issueB: LinkedIssue = {
	...issueA,
	slug: "gl-b-42",
	title: "Second issue",
	url: "https://gitlab.example.com/group/b/-/issues/42",
	projectId: "project-b",
	repoPath: "group/b",
};

afterEach(() => {
	useNewWorkspacePromptContextStore.setState({ entries: new Map() });
});

describe("buildSubmitPrompt", () => {
	test("keeps same-IID issue bodies scoped to their project", () => {
		useNewWorkspacePromptContextStore.setState({
			entries: new Map([
				[
					issueContextKey(issueA),
					{ state: "ready", body: { text: "First body" } },
				],
				[
					issueContextKey(issueB),
					{ state: "ready", body: { text: "Second body" } },
				],
			]),
		});
		const prompt = buildSubmitPrompt({
			userPrompt: "Please implement these",
			linkedPR: null,
			linkedIssues: [issueA, issueB],
		});
		expect(prompt).toContain(
			"First issue\nhttps://gitlab.example.com/group/a/-/issues/42\n\nFirst body",
		);
		expect(prompt).toContain(
			"Second issue\nhttps://gitlab.example.com/group/b/-/issues/42\n\nSecond body",
		);
	});

	test("keeps the GitLab URL and exposes a missing description", () => {
		useNewWorkspacePromptContextStore.setState({
			entries: new Map([[issueContextKey(issueA), { state: "failed" }]]),
		});
		expect(
			buildSubmitPrompt({
				userPrompt: "",
				linkedPR: null,
				linkedIssues: [issueA],
			}),
		).toContain("GitLab issue description could not be loaded.");
	});

	test("uses a freshly validated issue body over a cached result", () => {
		useNewWorkspacePromptContextStore.setState({
			entries: new Map([
				[
					issueContextKey(issueA),
					{ state: "ready", body: { text: "Stale body" } },
				],
			]),
		});
		const prompt = buildSubmitPrompt({
			userPrompt: "",
			linkedPR: null,
			linkedIssues: [{ ...issueA, body: "Fresh body" }],
		});
		expect(prompt).toContain("Fresh body");
		expect(prompt).not.toContain("Stale body");
	});

	test("keeps same-IID merge request bodies scoped to their instance and host", () => {
		const request: LinkedPR = {
			prNumber: 42,
			title: "Merge changes",
			url: "https://gitlab-a.example.com/group/app/-/merge_requests/42",
			state: "open",
			provider: "gitlab",
			instance: "https://gitlab-a.example.com",
			repoPath: "group/app",
		};
		const otherRequest: LinkedPR = {
			...request,
			url: "https://gitlab-b.example.com/group/app/-/merge_requests/42",
			instance: "https://gitlab-b.example.com",
		};
		useNewWorkspacePromptContextStore.setState({
			entries: new Map([
				[
					requestContextKey(request, {
						projectId: "project-a",
						hostId: "host-a",
					}),
					{ state: "ready", body: { text: "Instance A body" } },
				],
				[
					requestContextKey(otherRequest, {
						projectId: "project-a",
						hostId: "host-b",
					}),
					{ state: "ready", body: { text: "Instance B body" } },
				],
			]),
		});
		const prompt = buildSubmitPrompt({
			userPrompt: "",
			linkedPR: otherRequest,
			linkedIssues: [],
			projectId: "project-a",
			hostId: "host-b",
		});
		expect(prompt).toContain("!42: Merge changes");
		expect(prompt).toContain("Instance B body");
		expect(prompt).not.toContain("Instance A body");
	});
});
