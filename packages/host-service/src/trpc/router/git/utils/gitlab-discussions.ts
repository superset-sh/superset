import type { ExecGlab } from "../../workspace-creation/utils/exec-glab";
import type {
	IssueComment,
	PullRequestReviewComment,
	PullRequestReviewThread,
} from "../types";

interface GitLabAuthor {
	username?: string;
	avatar_url?: string;
}

interface GitLabPosition {
	new_path?: string;
	old_path?: string;
	new_line?: number | null;
	old_line?: number | null;
}

interface GitLabNote {
	id?: number;
	body?: string;
	author?: GitLabAuthor;
	created_at?: string;
	resolved?: boolean;
	resolvable?: boolean;
	system?: boolean;
	position?: GitLabPosition | null;
}

interface GitLabDiscussion {
	id?: string;
	notes?: GitLabNote[];
}

export interface GitLabDiscussionResult {
	reviewThreads: PullRequestReviewThread[];
	conversationComments: IssueComment[];
}

type Repository = { owner: string; name: string };

function projectApiPath(repository: Repository): string {
	return `projects/${encodeURIComponent(`${repository.owner}/${repository.name}`)}`;
}

function toReviewComment(note: GitLabNote): PullRequestReviewComment | null {
	if (typeof note.id !== "number" || !note.body?.trim()) return null;
	return {
		id: String(note.id),
		databaseId: note.id,
		author: {
			login: note.author?.username ?? "ghost",
			avatarUrl: note.author?.avatar_url ?? "",
		},
		body: note.body,
		createdAt: note.created_at ?? "",
	};
}

export function parseGitLabDiscussions(
	value: unknown,
	mergeRequestUrl: string,
): GitLabDiscussionResult {
	const reviewThreads: PullRequestReviewThread[] = [];
	const conversationComments: IssueComment[] = [];
	if (!Array.isArray(value)) return { reviewThreads, conversationComments };

	for (const item of value) {
		if (!item || typeof item !== "object") continue;
		const discussion = item as GitLabDiscussion;
		const notes = Array.isArray(discussion.notes)
			? discussion.notes.filter((note) => !note.system && note.body?.trim())
			: [];
		const first = notes[0];
		if (!first || typeof first.id !== "number") continue;
		const position = first.position;

		if (position && discussion.id) {
			const comments = notes
				.map(toReviewComment)
				.filter((note): note is PullRequestReviewComment => note !== null);
			const newLine = position.new_line ?? null;
			const oldLine = position.old_line ?? null;
			reviewThreads.push({
				id: discussion.id,
				isResolved: first.resolvable === true && first.resolved === true,
				isOutdated: newLine === null && oldLine === null,
				diffSide: newLine !== null ? "RIGHT" : "LEFT",
				line: newLine ?? oldLine,
				path: position.new_path ?? position.old_path ?? "",
				comments,
			});
			continue;
		}

		for (const note of notes) {
			if (typeof note.id !== "number" || !note.body?.trim()) continue;
			conversationComments.push({
				id: note.id,
				user: {
					login: note.author?.username ?? "ghost",
					avatarUrl: note.author?.avatar_url ?? "",
				},
				body: note.body,
				createdAt: note.created_at ?? "",
				htmlUrl: `${mergeRequestUrl}#note_${note.id}`,
			});
		}
	}

	return { reviewThreads, conversationComments };
}

export async function fetchPullRequestDiscussionsFromGlab(
	execGlab: ExecGlab,
	repository: Repository,
	mergeRequestNumber: number,
	mergeRequestUrl: string,
	cwd: string,
): Promise<GitLabDiscussionResult> {
	const raw = await execGlab(
		[
			"api",
			"--method",
			"GET",
			"--paginate",
			`${projectApiPath(repository)}/merge_requests/${mergeRequestNumber}/discussions`,
		],
		{ cwd, timeout: 30_000 },
	);
	return parseGitLabDiscussions(raw, mergeRequestUrl);
}

export async function setPullRequestDiscussionResolutionFromGlab(
	execGlab: ExecGlab,
	repository: Repository,
	mergeRequestNumber: number,
	discussionId: string,
	resolved: boolean,
	cwd: string,
): Promise<void> {
	await execGlab(
		[
			"api",
			"--method",
			"PUT",
			`${projectApiPath(repository)}/merge_requests/${mergeRequestNumber}/discussions/${discussionId}`,
			"-F",
			`resolved=${resolved}`,
		],
		{ cwd },
	);
}
