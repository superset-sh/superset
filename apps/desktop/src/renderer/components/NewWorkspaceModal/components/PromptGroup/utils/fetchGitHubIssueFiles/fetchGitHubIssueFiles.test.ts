import { describe, expect, mock, test } from "bun:test";
import { fetchGitHubIssueFiles } from "./fetchGitHubIssueFiles";

const mockIssueContent = {
	number: 42,
	title: "Test Issue",
	body: "This is the issue body",
	url: "https://github.com/org/repo/issues/42",
	state: "open",
	author: "testuser",
	createdAt: "2024-01-01T00:00:00Z",
	updatedAt: "2024-01-02T00:00:00Z",
};

describe("fetchGitHubIssueFiles", () => {
	test("returns empty array when no github issues present", async () => {
		const queryFn = mock(() => Promise.resolve(mockIssueContent));
		const result = await fetchGitHubIssueFiles(
			[{ slug: "SUP-1", title: "Internal", source: "internal" }],
			"project-1",
			queryFn,
		);

		expect(result).toEqual([]);
		expect(queryFn).not.toHaveBeenCalled();
	});

	test("fetches and converts a GitHub issue", async () => {
		const queryFn = mock(() => Promise.resolve(mockIssueContent));

		const result = await fetchGitHubIssueFiles(
			[{ slug: "#42", title: "Test", source: "github", number: 42 }],
			"project-1",
			queryFn,
		);

		expect(queryFn).toHaveBeenCalledWith({
			projectId: "project-1",
			issueNumber: 42,
		});
		expect(result).toHaveLength(1);
		expect(result[0].mediaType).toBe("text/markdown");
		expect(result[0].filename).toBe("github-issue-42.md");
		expect(result[0].data).toMatch(/^data:text\/markdown;base64,/);
	});

	test("sanitizes HTML entities in title but preserves body", async () => {
		const queryFn = mock(() =>
			Promise.resolve({
				...mockIssueContent,
				title: 'XSS <script>alert("xss")</script>',
				body: "Body with <b>html</b> & entities",
			}),
		);

		const result = await fetchGitHubIssueFiles(
			[{ slug: "#1", title: "XSS", source: "github", number: 1 }],
			"project-1",
			queryFn,
		);

		expect(result).toHaveLength(1);
		const base64 = result[0].data.replace("data:text/markdown;base64,", "");
		const decoded = decodeURIComponent(
			Array.from(atob(base64))
				.map((c) => `%${c.charCodeAt(0).toString(16).padStart(2, "0")}`)
				.join(""),
		);
		// Title should be sanitized
		expect(decoded).toContain("&lt;script&gt;");
		// Body should be preserved as-is (Markdown content)
		expect(decoded).toContain("<b>html</b>");
		expect(decoded).toContain("& entities");
	});

	test("truncates large bodies", async () => {
		const largeBody = "x".repeat(60000);
		const queryFn = mock(() =>
			Promise.resolve({
				...mockIssueContent,
				body: largeBody,
			}),
		);

		const result = await fetchGitHubIssueFiles(
			[{ slug: "#1", title: "Large", source: "github", number: 1 }],
			"project-1",
			queryFn,
		);

		expect(result).toHaveLength(1);
		const base64 = result[0].data.replace("data:text/markdown;base64,", "");
		const decoded = decodeURIComponent(
			Array.from(atob(base64))
				.map((c) => `%${c.charCodeAt(0).toString(16).padStart(2, "0")}`)
				.join(""),
		);
		expect(decoded).toContain("[... content truncated due to length ...]");
	});

	test("sanitizes invalid URLs", async () => {
		const queryFn = mock(() =>
			Promise.resolve({
				...mockIssueContent,
				url: "javascript:alert(1)",
			}),
		);

		const result = await fetchGitHubIssueFiles(
			[{ slug: "#1", title: "Bad URL", source: "github", number: 1 }],
			"project-1",
			queryFn,
		);

		expect(result).toHaveLength(1);
		const base64 = result[0].data.replace("data:text/markdown;base64,", "");
		const decoded = decodeURIComponent(
			Array.from(atob(base64))
				.map((c) => `%${c.charCodeAt(0).toString(16).padStart(2, "0")}`)
				.join(""),
		);
		expect(decoded).toContain("#invalid-url");
	});

	test("skips failed issues without blocking others", async () => {
		let callCount = 0;
		const queryFn = mock(() => {
			callCount++;
			if (callCount === 1) return Promise.resolve(mockIssueContent);
			return Promise.reject(new Error("Network error"));
		});

		const result = await fetchGitHubIssueFiles(
			[
				{ slug: "#42", title: "OK", source: "github", number: 42 },
				{ slug: "#43", title: "Fail", source: "github", number: 43 },
			],
			"project-1",
			queryFn,
		);

		expect(result).toHaveLength(1);
		expect(result[0].filename).toBe("github-issue-42.md");
	});

	test("filters out issues without number", async () => {
		const queryFn = mock(() => Promise.resolve(mockIssueContent));
		const result = await fetchGitHubIssueFiles(
			[{ slug: "#??", title: "No number", source: "github" }],
			"project-1",
			queryFn,
		);

		expect(result).toEqual([]);
		expect(queryFn).not.toHaveBeenCalled();
	});
});
