import { afterEach, describe, expect, mock, test } from "bun:test";

// Mock the two module boundaries generateBranchNameFromPrompt crosses:
// the model provider (getSmallModel) and the chat title generator.
const getSmallModelMock = mock(async () => ({ id: "small-model" }));
const generateTitleMock = mock(async () => "feature-branch");

mock.module("@superset/chat-legacy/server/shared", () => ({
	getSmallModel: getSmallModelMock,
}));

mock.module("@superset/chat-legacy/server/desktop", () => ({
	generateTitleFromMessage: generateTitleMock,
}));

const { generateBranchNameFromPrompt, isPlausibleBranchName, slugifyPrompt } =
	await import("./ai-branch-name");

describe("isPlausibleBranchName", () => {
	test("accepts a normal kebab branch name", () => {
		expect(isPlausibleBranchName("feat-auth-flow")).toBeTrue();
		expect(isPlausibleBranchName("fix-login")).toBeTrue();
	});

	test("rejects a conversational reply sanitized to many segments", () => {
		expect(
			isPlausibleBranchName(
				"i-d-be-happy-to-help-you-implement-that-task-but-i-don-t-have-access-to-the-jira-api",
			),
		).toBeFalse();
	});
});

describe("slugifyPrompt", () => {
	test("strips URLs and keeps meaningful words (#5288)", () => {
		expect(
			slugifyPrompt(
				"Implement this jira task: https://jira.example.com/TASK-123",
			),
		).toBe("jira-task");
	});

	test("falls back to a default when nothing remains", () => {
		expect(slugifyPrompt("https://example.com")).toBe("workspace");
	});
});

describe("generateBranchNameFromPrompt", () => {
	afterEach(() => {
		generateTitleMock.mockClear();
	});

	test("uses the generated name when it is a plausible branch name", async () => {
		generateTitleMock.mockImplementation(async () => "feat-auth-flow");
		expect(await generateBranchNameFromPrompt("add auth flow", [])).toBe(
			"feat-auth-flow",
		);
	});

	test("falls back to a prompt slug when the model replies conversationally (#5288)", async () => {
		generateTitleMock.mockImplementation(
			async () =>
				"I'd be happy to help you implement that task, but I don't have access to the Jira API",
		);
		expect(
			await generateBranchNameFromPrompt(
				"Implement this jira task: https://jira.example.com/TASK-123",
				[],
			),
		).toBe("jira-task");
	});

	test("deduplicates the fallback slug against existing branches", async () => {
		generateTitleMock.mockImplementation(
			async () =>
				"I'd be happy to help you implement that task, but I don't have access to the Jira API",
		);
		expect(
			await generateBranchNameFromPrompt(
				"Implement this jira task: https://jira.example.com/TASK-456",
				["jira-task"],
			),
		).toBe("jira-task-2");
	});
});
