import { describe, expect, it } from "bun:test";
import {
	fetchIssueContentGitHub,
	fetchPullRequestContentGitHub,
} from "./github-content";

const repo = { owner: "acme", name: "widget" };

const validPrRaw = {
	number: 42,
	title: "Fix the bug",
	body: "Detailed description",
	url: "https://github.com/acme/widget/pull/42",
	state: "OPEN",
	headRefName: "fix/the-bug",
	baseRefName: "main",
	headRepositoryOwner: { login: "acme" },
	isCrossRepository: false,
	isDraft: false,
	author: { login: "alice" },
	createdAt: "2024-01-01T00:00:00Z",
	updatedAt: "2024-01-02T00:00:00Z",
};

const validIssueRaw = {
	number: 7,
	title: "Report a problem",
	body: "Something is broken",
	url: "https://github.com/acme/widget/issues/7",
	state: "OPEN",
	author: { login: "bob" },
	createdAt: "2024-03-01T00:00:00Z",
	updatedAt: "2024-03-02T00:00:00Z",
};

describe("fetchPullRequestContentGitHub", () => {
	it("happy path: maps all fields correctly", async () => {
		const execGh = async () => validPrRaw;
		const result = await fetchPullRequestContentGitHub({ execGh }, repo, 42);
		expect(result).toEqual({
			number: 42,
			title: "Fix the bug",
			body: "Detailed description",
			url: "https://github.com/acme/widget/pull/42",
			state: "open",
			branch: "fix/the-bug",
			baseBranch: "main",
			headRepositoryOwner: "acme",
			isCrossRepository: false,
			author: "alice",
			isDraft: false,
			createdAt: "2024-01-01T00:00:00Z",
			updatedAt: "2024-01-02T00:00:00Z",
		});
	});

	it("state is lowercased", async () => {
		const execGh = async () => ({ ...validPrRaw, state: "MERGED" });
		const result = await fetchPullRequestContentGitHub({ execGh }, repo, 42);
		expect(result.state).toBe("merged");
	});

	it("body: null → empty string", async () => {
		const execGh = async () => ({ ...validPrRaw, body: null });
		const result = await fetchPullRequestContentGitHub({ execGh }, repo, 42);
		expect(result.body).toBe("");
	});

	it("body: undefined → empty string", async () => {
		const { body: _body, ...rawNobody } = validPrRaw;
		const execGh = async () => rawNobody;
		const result = await fetchPullRequestContentGitHub({ execGh }, repo, 42);
		expect(result.body).toBe("");
	});

	it("headRepositoryOwner: null → null", async () => {
		const execGh = async () => ({
			...validPrRaw,
			headRepositoryOwner: null,
		});
		const result = await fetchPullRequestContentGitHub({ execGh }, repo, 42);
		expect(result.headRepositoryOwner).toBeNull();
	});

	it("author: missing → null", async () => {
		const { author: _author, ...rawNoAuthor } = validPrRaw;
		const execGh = async () => rawNoAuthor;
		const result = await fetchPullRequestContentGitHub({ execGh }, repo, 42);
		expect(result.author).toBeNull();
	});

	it("calls gh with correct args", async () => {
		let capturedArgs: string[] = [];
		const execGh = async (args: string[]) => {
			capturedArgs = args;
			return validPrRaw;
		};
		await fetchPullRequestContentGitHub({ execGh }, repo, 42);
		expect(capturedArgs[0]).toBe("pr");
		expect(capturedArgs[1]).toBe("view");
		expect(capturedArgs[2]).toBe("42");
		expect(capturedArgs[4]).toBe("acme/widget");
	});

	it("parse failure rejects", async () => {
		const execGh = async () => ({ number: "not-a-number", title: 99 });
		await expect(
			fetchPullRequestContentGitHub({ execGh }, repo, 42),
		).rejects.toThrow();
	});
});

describe("fetchIssueContentGitHub", () => {
	it("happy path: maps all fields correctly", async () => {
		const execGh = async () => validIssueRaw;
		const result = await fetchIssueContentGitHub({ execGh }, repo, 7);
		expect(result).toEqual({
			number: 7,
			title: "Report a problem",
			body: "Something is broken",
			url: "https://github.com/acme/widget/issues/7",
			state: "open",
			author: "bob",
			createdAt: "2024-03-01T00:00:00Z",
			updatedAt: "2024-03-02T00:00:00Z",
		});
	});

	it("state is lowercased", async () => {
		const execGh = async () => ({ ...validIssueRaw, state: "CLOSED" });
		const result = await fetchIssueContentGitHub({ execGh }, repo, 7);
		expect(result.state).toBe("closed");
	});

	it("body: null → empty string", async () => {
		const execGh = async () => ({ ...validIssueRaw, body: null });
		const result = await fetchIssueContentGitHub({ execGh }, repo, 7);
		expect(result.body).toBe("");
	});

	it("author: missing → null", async () => {
		const { author: _author, ...rawNoAuthor } = validIssueRaw;
		const execGh = async () => rawNoAuthor;
		const result = await fetchIssueContentGitHub({ execGh }, repo, 7);
		expect(result.author).toBeNull();
	});

	it("calls gh with correct args", async () => {
		let capturedArgs: string[] = [];
		const execGh = async (args: string[]) => {
			capturedArgs = args;
			return validIssueRaw;
		};
		await fetchIssueContentGitHub({ execGh }, repo, 7);
		expect(capturedArgs[0]).toBe("issue");
		expect(capturedArgs[1]).toBe("view");
		expect(capturedArgs[2]).toBe("7");
		expect(capturedArgs[4]).toBe("acme/widget");
	});

	it("parse failure rejects", async () => {
		const execGh = async () => ({ number: "not-a-number", title: 99 });
		await expect(
			fetchIssueContentGitHub({ execGh }, repo, 7),
		).rejects.toThrow();
	});
});
