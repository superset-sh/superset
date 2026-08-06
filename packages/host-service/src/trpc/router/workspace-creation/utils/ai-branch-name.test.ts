import { afterEach, describe, expect, mock, test } from "bun:test";

// Mock the two module boundaries generateBranchNameFromPrompt crosses:
// the model provider (getSmallModel) and the chat title generator.
const getSmallModelMock = mock<() => Promise<{ id: string } | null>>(
	async () => ({
		id: "small-model",
	}),
);
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

	test("applies the branch-length limit to fallback slugs", () => {
		const long = `implement ${"a".repeat(200)} ${"b".repeat(200)} ${"c".repeat(200)} ${"d".repeat(200)}`;
		expect(slugifyPrompt(long).length).toBeLessThanOrEqual(100);
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

	test("falls back to a prompt slug when the reply does not sanitize", async () => {
		generateTitleMock.mockImplementation(async () => "...");
		expect(await generateBranchNameFromPrompt("Fix the login flow", [])).toBe(
			"fix-login-flow",
		);
	});

	test("returns null when no model is available", async () => {
		getSmallModelMock.mockImplementation(async () => null);
		expect(await generateBranchNameFromPrompt("add auth flow", [])).toBeNull();
	});

	test("returns null when generation rejects (timeout)", async () => {
		getSmallModelMock.mockImplementation(async () => ({ id: "small-model" }));
		generateTitleMock.mockImplementation(async () => {
			throw new Error("timed out after 5000ms");
		});
		expect(await generateBranchNameFromPrompt("add auth flow", [])).toBeNull();
	});

	test("deduplicates a plausible generated name against existing branches", async () => {
		generateTitleMock.mockImplementation(async () => "feat-auth-flow");
		expect(
			await generateBranchNameFromPrompt("add auth flow", ["feat-auth-flow"]),
		).toBe("feat-auth-flow-2");
	});
});
