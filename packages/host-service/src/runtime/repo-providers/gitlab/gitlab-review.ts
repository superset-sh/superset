import type {
	IssueComment,
	PullRequestReviewComment,
	PullRequestReviewThread,
} from "../../../trpc/router/git/types";
import type { RepoRef } from "../types";
import {
	encodeProjectPath,
	type GitLabRestDeps,
	gitlabRest,
	gitlabRestAll,
	gitlabRestPost,
} from "./gitlab-rest";

interface GitLabNotePosition {
	new_path: string | null;
	old_path: string | null;
	new_line: number | null;
	old_line: number | null;
	position_type: string;
}

interface GitLabNote {
	id: number;
	type: string | null;
	body: string;
	author: {
		username: string;
		avatar_url: string;
	};
	created_at: string;
	system: boolean;
	resolvable: boolean;
	resolved: boolean | null;
	position?: GitLabNotePosition | null;
}

interface GitLabDiscussion {
	id: string;
	individual_note: boolean;
	notes: GitLabNote[];
}

function encodeThreadId(
	host: string,
	owner: string,
	name: string,
	prNumber: number,
	discussionId: string,
): string {
	return `gitlab:${encodeURIComponent(host.toLowerCase())}:${owner}/${name}:${prNumber}:${discussionId}`;
}

function parseThreadId(
	host: string,
	threadId: string,
): {
	owner: string;
	name: string;
	iid: number;
	discussionId: string;
} {
	const [provider, encodedHost, project, iidText, discussionId, extra] =
		threadId.split(":");
	if (
		provider !== "gitlab" ||
		!encodedHost ||
		!project ||
		!iidText ||
		!discussionId ||
		extra !== undefined
	)
		throw new Error("Malformed GitLab thread id");
	if (decodeURIComponent(encodedHost).toLowerCase() !== host.toLowerCase())
		throw new Error("GitLab thread belongs to another host");
	const slash = project.lastIndexOf("/");
	const owner = project.slice(0, slash);
	const name = project.slice(slash + 1);
	const iid = Number(iidText);
	if (
		slash <= 0 ||
		!name ||
		!/^[1-9]\d*$/.test(iidText) ||
		!Number.isSafeInteger(iid)
	)
		throw new Error("Invalid GitLab thread project or iid");
	return { owner, name, iid, discussionId };
}

function mapNoteToReviewComment(note: GitLabNote): PullRequestReviewComment {
	return {
		id: String(note.id),
		databaseId: note.id,
		author: {
			login: note.author.username,
			avatarUrl: note.author.avatar_url,
		},
		body: note.body,
		createdAt: note.created_at,
	};
}

export async function fetchReviewThreadsGitLab(
	deps: GitLabRestDeps,
	repo: RepoRef,
	prNumber: number,
): Promise<{
	reviewThreads: PullRequestReviewThread[];
	conversationComments: IssueComment[];
}> {
	const enc = encodeProjectPath(repo.owner, repo.name);

	const mr = await gitlabRest<{ web_url: string }>(
		deps,
		`/projects/${enc}/merge_requests/${prNumber}`,
	);
	const mrWebUrl = mr.web_url ?? "";

	const discussions = await gitlabRestAll<GitLabDiscussion>(
		deps,
		`/projects/${enc}/merge_requests/${prNumber}/discussions`,
		{ per_page: 100 },
	);

	const reviewThreads: PullRequestReviewThread[] = [];
	const conversationComments: IssueComment[] = [];

	for (const discussion of discussions) {
		const notes = discussion.notes.filter((n) => !n.system);

		if (notes.length === 0) continue;

		const firstNote = notes[0];
		if (!firstNote) continue;

		if (firstNote.position != null) {
			const pos = firstNote.position;

			const resolvableNotes = notes.filter((n) => n.resolvable);
			const isResolved =
				resolvableNotes.length > 0
					? resolvableNotes.every((n) => n.resolved === true)
					: firstNote.resolved === true;

			const path = pos.new_path ?? pos.old_path ?? "";

			const line = pos.new_line != null ? pos.new_line : (pos.old_line ?? null);
			const diffSide =
				pos.new_line != null ? ("RIGHT" as const) : ("LEFT" as const);

			const isOutdated = false;

			const compositeId = encodeThreadId(
				deps.host,
				repo.owner,
				repo.name,
				prNumber,
				discussion.id,
			);

			reviewThreads.push({
				id: compositeId,
				isResolved,
				isOutdated,
				diffSide,
				line,
				path,
				comments: notes.map(mapNoteToReviewComment),
			});
		} else {
			for (const note of notes) {
				const body = note.body.trim();
				if (!body) continue;

				conversationComments.push({
					id: note.id,
					user: {
						login: note.author.username,
						avatarUrl: note.author.avatar_url,
					},
					body,
					createdAt: note.created_at,
					htmlUrl: mrWebUrl ? `${mrWebUrl}#note_${note.id}` : "",
				});
			}
		}
	}

	return { reviewThreads, conversationComments };
}

export async function setReviewThreadResolutionGitLab(
	deps: GitLabRestDeps,
	threadId: string,
	resolved: boolean,
): Promise<void> {
	const { owner, name, iid, discussionId } = parseThreadId(deps.host, threadId);

	const enc = encodeProjectPath(owner, name);
	await gitlabRestPost(
		deps,
		`/projects/${enc}/merge_requests/${iid}/discussions/${encodeURIComponent(discussionId)}`,
		{ resolved },
	);
}

export async function replyToReviewThreadGitLab(
	deps: GitLabRestDeps,
	threadId: string,
	body: string,
): Promise<void> {
	const { owner, name, iid, discussionId } = parseThreadId(deps.host, threadId);
	const enc = encodeProjectPath(owner, name);
	await gitlabRestPost(
		deps,
		`/projects/${enc}/merge_requests/${iid}/discussions/${encodeURIComponent(discussionId)}/notes`,
		{ body },
		"POST",
	);
}
