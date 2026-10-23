import { TRPCError } from "@trpc/server";
import { execGlab } from "../../workspace-creation/utils/exec-glab";
import type { IssueComment, PullRequestReviewThread } from "../types";

interface GitLabNote {
	id: number;
	system?: boolean;
	body: string;
	created_at: string;
	resolved?: boolean;
	author: { username: string; avatar_url?: string | null };
	position?: {
		new_path?: string | null;
		old_path?: string | null;
		new_line?: number | null;
		old_line?: number | null;
	} | null;
}

interface GitLabDiscussion {
	id: string;
	notes?: GitLabNote[];
}

// `glab api` takes no -R: name the MR's project by its web host and path.
function mergeRequestApi(mrUrl: string, path: string, args: string[] = []) {
	const [project = "", iid = ""] = mrUrl.split("/-/merge_requests/");
	const { host, pathname } = new URL(project);
	const endpoint = `projects/${encodeURIComponent(pathname.slice(1))}/merge_requests/${Number.parseInt(iid, 10)}${path}`;
	return execGlab(["api", "--hostname", host, ...args, endpoint]);
}

async function fetchDiscussions(mrUrl: string): Promise<GitLabDiscussion[]> {
	const raw = await mergeRequestApi(mrUrl, "/discussions", [
		"--paginate",
		"--output",
		"ndjson",
	]);
	// One discussion per line; a single one arrives already parsed.
	return typeof raw === "string"
		? raw.split("\n").map((line) => JSON.parse(line))
		: [raw as GitLabDiscussion];
}

const actor = (note: GitLabNote) => ({
	login: note.author.username,
	avatarUrl: note.author.avatar_url ?? "",
});

/** Diff notes become review threads; every other comment is conversation. */
export function parseGitLabDiscussions(
	discussions: GitLabDiscussion[],
	mrUrl: string,
) {
	const reviewThreads: PullRequestReviewThread[] = [];
	const conversationComments: IssueComment[] = [];
	for (const discussion of discussions) {
		const notes = (discussion.notes ?? []).filter((note) => !note.system);
		const position = notes[0]?.position;
		if (!position) {
			for (const note of notes) {
				conversationComments.push({
					id: note.id,
					user: actor(note),
					body: note.body,
					createdAt: note.created_at,
					htmlUrl: `${mrUrl}#note_${note.id}`,
				});
			}
			continue;
		}
		reviewThreads.push({
			id: discussion.id,
			isResolved: notes[0]?.resolved === true,
			isOutdated: false,
			diffSide: position.new_line == null ? "LEFT" : "RIGHT",
			line: position.new_line ?? position.old_line ?? null,
			path: position.new_path ?? position.old_path ?? "",
			comments: notes.map((note) => ({
				id: String(note.id),
				databaseId: note.id,
				author: actor(note),
				body: note.body,
				createdAt: note.created_at,
			})),
		});
	}
	return { reviewThreads, conversationComments };
}

export async function fetchGitLabThreads(mrUrl: string) {
	return parseGitLabDiscussions(await fetchDiscussions(mrUrl), mrUrl);
}

export async function setGitLabThreadResolution(
	mrUrl: string,
	discussionId: string,
	resolved: boolean,
) {
	await mergeRequestApi(mrUrl, `/discussions/${discussionId}`, [
		"--method",
		"PUT",
		"-F",
		`resolved=${resolved}`,
	]);
}

// The UI replies to a note id; GitLab threads a reply onto its discussion.
export async function replyToGitLabThread(
	mrUrl: string,
	noteId: number,
	body: string,
) {
	const discussion = (await fetchDiscussions(mrUrl)).find((candidate) =>
		candidate.notes?.some((note) => note.id === noteId),
	);
	if (!discussion) {
		throw new TRPCError({ code: "NOT_FOUND", message: "Thread not found" });
	}
	const note = await mergeRequestApi(
		mrUrl,
		`/discussions/${discussion.id}/notes`,
		["--method", "POST", "-f", `body=${body}`],
	);
	return { id: Number((note as { id?: unknown }).id) };
}
