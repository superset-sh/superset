import { describe, expect, test } from "bun:test";
import { parseGitLabDiscussions } from "./gitlab-discussions";

const MR_URL = "https://gitlab.example.com/team/app/-/merge_requests/7";
const author = { username: "ada", avatar_url: "https://a/ada.png" };
const note = (id: number, extra: object = {}) => ({
	id,
	body: `note ${id}`,
	created_at: "2026-10-21T10:00:00Z",
	author,
	...extra,
});

describe("parseGitLabDiscussions", () => {
	test("maps diff notes to threads and other notes to conversation", () => {
		const position = {
			new_path: "src/a.ts",
			old_path: "src/a.ts",
			new_line: 12,
		};
		const result = parseGitLabDiscussions(
			[
				{ id: "sys", notes: [note(1, { system: true })] },
				{
					id: "diff",
					notes: [note(2, { position, resolved: true }), note(3, { position })],
				},
				{ id: "talk", notes: [note(4)] },
			],
			MR_URL,
		);

		expect(result.reviewThreads).toEqual([
			{
				id: "diff",
				isResolved: true,
				isOutdated: false,
				diffSide: "RIGHT",
				line: 12,
				path: "src/a.ts",
				comments: [2, 3].map((id) => ({
					id: String(id),
					databaseId: id,
					author: { login: "ada", avatarUrl: "https://a/ada.png" },
					body: `note ${id}`,
					createdAt: "2026-10-21T10:00:00Z",
				})),
			},
		]);
		expect(result.conversationComments).toEqual([
			{
				id: 4,
				user: { login: "ada", avatarUrl: "https://a/ada.png" },
				body: "note 4",
				createdAt: "2026-10-21T10:00:00Z",
				htmlUrl: `${MR_URL}#note_4`,
			},
		]);
	});
});
