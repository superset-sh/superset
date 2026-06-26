import { beforeEach, describe, expect, test } from "bun:test";
import { buildSubmitPrompt } from "./buildSubmitPrompt";
import {
	makePromptContextKey,
	makePromptContextScope,
	useNewWorkspacePromptContextStore,
} from "./store";

const SHARED_ISSUE_NUMBER = 7;
const SHARED_PR_NUMBER = 17;

const sameNumberContextFixtures = [
	{
		projectId: "project-alpha",
		hostUrl: "https://host-one.superset.test",
		issueBody: "fixture issue body: alpha on host one",
		prBody: "fixture PR body: alpha on host one",
	},
	{
		projectId: "project-alpha",
		hostUrl: "https://host-two.superset.test",
		issueBody: "fixture issue body: alpha on host two",
		prBody: "fixture PR body: alpha on host two",
	},
	{
		projectId: "project-beta",
		hostUrl: "https://host-one.superset.test",
		issueBody: "fixture issue body: beta on host one",
		prBody: "fixture PR body: beta on host one",
	},
	{
		projectId: "project-beta",
		hostUrl: "https://host-two.superset.test",
		issueBody: "fixture issue body: beta on host two",
		prBody: "fixture PR body: beta on host two",
	},
] as const;

describe("buildSubmitPrompt", () => {
	beforeEach(() => {
		useNewWorkspacePromptContextStore.setState({ entries: new Map() });
	});

	test("scopes same-number GitHub issue and PR bodies by project and host fixtures", async () => {
		const store = useNewWorkspacePromptContextStore.getState();
		for (const fixture of sameNumberContextFixtures) {
			const contextScope = makePromptContextScope(
				fixture.projectId,
				fixture.hostUrl,
			);
			store.register(
				makePromptContextKey("github-issue", SHARED_ISSUE_NUMBER, contextScope),
				() => Promise.resolve({ text: fixture.issueBody }),
			);
			store.register(
				makePromptContextKey("pr", SHARED_PR_NUMBER, contextScope),
				() => Promise.resolve({ text: fixture.prBody }),
			);
		}
		await store.awaitPending(1000);

		for (const target of sameNumberContextFixtures) {
			const prompt = buildSubmitPrompt({
				userPrompt: "Start from the linked context.",
				linkedPR: {
					prNumber: SHARED_PR_NUMBER,
					title: "Shared PR number",
					url: `https://github.com/superset-sh/${target.projectId}/pull/${SHARED_PR_NUMBER}`,
					state: "open",
				},
				contextScope: makePromptContextScope(target.projectId, target.hostUrl),
				linkedIssues: [
					{
						source: "github",
						slug: `gh-${SHARED_ISSUE_NUMBER}`,
						title: "Shared issue number",
						number: SHARED_ISSUE_NUMBER,
						url: `https://github.com/superset-sh/${target.projectId}/issues/${SHARED_ISSUE_NUMBER}`,
					},
				],
			});

			expect(prompt).toContain(target.issueBody);
			expect(prompt).toContain(target.prBody);

			for (const other of sameNumberContextFixtures) {
				if (other === target) continue;
				expect(prompt).not.toContain(other.issueBody);
				expect(prompt).not.toContain(other.prBody);
			}
		}
	});
});
