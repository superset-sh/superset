import { describe, expect, test } from "bun:test";
import type { PullRequestComment } from "@superset/local-db";
import { groupComments } from "./groupComments";

describe("groupComments", () => {
	test("handles empty array", () => {
		const result = groupComments([]);
		expect(result).toEqual([]);
	});

	test("groups only general comments", () => {
		const comments: PullRequestComment[] = [
			{
				id: "1",
				authorLogin: "user1",
				body: "General comment 1",
			},
			{
				id: "2",
				authorLogin: "user2",
				body: "General comment 2",
			},
		];

		const result = groupComments(comments);

		expect(result).toHaveLength(1);
		expect(result[0]).toEqual({
			path: null,
			comments,
		});
	});

	test("groups only file comments", () => {
		const comments: PullRequestComment[] = [
			{
				id: "1",
				authorLogin: "user1",
				body: "File comment 1",
				path: "src/file1.ts",
				line: 10,
			},
			{
				id: "2",
				authorLogin: "user2",
				body: "File comment 2",
				path: "src/file2.ts",
				line: 20,
			},
		];

		const result = groupComments(comments);

		expect(result).toHaveLength(2);
		expect(result[0]).toEqual({
			path: "src/file1.ts",
			comments: [comments[0]],
		});
		expect(result[1]).toEqual({
			path: "src/file2.ts",
			comments: [comments[1]],
		});
	});

	test("groups mixed general and file comments", () => {
		const generalComment: PullRequestComment = {
			id: "1",
			authorLogin: "user1",
			body: "General comment",
		};

		const fileComment: PullRequestComment = {
			id: "2",
			authorLogin: "user2",
			body: "File comment",
			path: "src/file.ts",
			line: 15,
		};

		const result = groupComments([generalComment, fileComment]);

		expect(result).toHaveLength(2);
		expect(result[0]).toEqual({
			path: null,
			comments: [generalComment],
		});
		expect(result[1]).toEqual({
			path: "src/file.ts",
			comments: [fileComment],
		});
	});

	test("groups multiple files with multiple comments", () => {
		const comments: PullRequestComment[] = [
			{
				id: "1",
				authorLogin: "user1",
				body: "Comment on file2",
				path: "src/file2.ts",
				line: 10,
			},
			{
				id: "2",
				authorLogin: "user2",
				body: "General comment",
			},
			{
				id: "3",
				authorLogin: "user3",
				body: "Comment on file1",
				path: "src/file1.ts",
				line: 5,
			},
			{
				id: "4",
				authorLogin: "user1",
				body: "Another comment on file1",
				path: "src/file1.ts",
				line: 20,
			},
			{
				id: "5",
				authorLogin: "user2",
				body: "Another general comment",
			},
		];

		const result = groupComments(comments);

		expect(result).toHaveLength(3);

		// First group should be general comments
		expect(result[0]).toEqual({
			path: null,
			comments: [comments[1], comments[4]],
		});

		// Second group should be file1 (alphabetically first)
		expect(result[1]).toEqual({
			path: "src/file1.ts",
			comments: [comments[2], comments[3]],
		});

		// Third group should be file2
		expect(result[2]).toEqual({
			path: "src/file2.ts",
			comments: [comments[0]],
		});
	});

	test("sorts file paths alphabetically", () => {
		const comments: PullRequestComment[] = [
			{
				id: "1",
				authorLogin: "user1",
				body: "Comment on z-file",
				path: "src/z-file.ts",
			},
			{
				id: "2",
				authorLogin: "user2",
				body: "Comment on a-file",
				path: "src/a-file.ts",
			},
			{
				id: "3",
				authorLogin: "user3",
				body: "Comment on m-file",
				path: "src/m-file.ts",
			},
		];

		const result = groupComments(comments);

		expect(result).toHaveLength(3);
		expect(result[0]?.path).toBe("src/a-file.ts");
		expect(result[1]?.path).toBe("src/m-file.ts");
		expect(result[2]?.path).toBe("src/z-file.ts");
	});

	test("preserves comment order within groups", () => {
		const comments: PullRequestComment[] = [
			{
				id: "3",
				authorLogin: "user3",
				body: "Third comment",
				path: "src/file.ts",
			},
			{
				id: "1",
				authorLogin: "user1",
				body: "First comment",
				path: "src/file.ts",
			},
			{
				id: "2",
				authorLogin: "user2",
				body: "Second comment",
				path: "src/file.ts",
			},
		];

		const result = groupComments(comments);

		expect(result).toHaveLength(1);
		expect(result[0]?.comments).toEqual(comments);
	});
});
