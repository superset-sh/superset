import type { PullRequestComment } from "@superset/local-db";
import { execWithShellEnv } from "../shell-env";
import { GLDiscussionSchema } from "./types";

function parseTimestamp(value?: string): number | undefined {
	if (!value) {
		return undefined;
	}
	const timestamp = new Date(value).getTime();
	return Number.isNaN(timestamp) ? undefined : timestamp;
}

function sortComments(comments: PullRequestComment[]): PullRequestComment[] {
	return comments.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
}

/**
 * Fetches MR discussions from the GitLab API using `glab api`.
 * Discussions contain threaded notes (comments), including inline diff comments
 * and general MR comments.
 */
async function fetchMRDiscussions(
	worktreePath: string,
	projectPath: string,
	mrIid: number,
): Promise<PullRequestComment[]> {
	const comments: PullRequestComment[] = [];
	let page = 1;

	while (true) {
		let stdout: string;
		try {
			const result = await execWithShellEnv(
				"glab",
				[
					"api",
					`projects/${projectPath}/merge_requests/${mrIid}/discussions?per_page=100&page=${page}`,
				],
				{ cwd: worktreePath },
			);
			stdout = result.stdout;
		} catch (error) {
			console.warn("[GitLab] Failed to fetch MR discussions:", {
				error,
				projectPath,
				mrIid,
				page,
			});
			break;
		}

		const trimmed = stdout.trim();
		if (!trimmed || trimmed === "null" || trimmed === "[]") {
			break;
		}

		let raw: unknown;
		try {
			raw = JSON.parse(trimmed);
		} catch (error) {
			console.warn(
				"[GitLab] Failed to parse MR discussions JSON:",
				error instanceof Error ? error.message : String(error),
			);
			break;
		}

		if (!Array.isArray(raw) || raw.length === 0) {
			break;
		}

		for (const rawDiscussion of raw) {
			const result = GLDiscussionSchema.safeParse(rawDiscussion);
			if (!result.success) {
				continue;
			}

			const discussion = result.data;
			// Determine resolution state from the first resolvable note
			const firstResolvableNote = discussion.notes.find(
				(note) => note.resolvable,
			);
			const isResolved = firstResolvableNote?.resolved ?? false;

			for (const note of discussion.notes) {
				// Skip system notes (merge events, label changes, etc.)
				if (note.system) {
					continue;
				}

				const body = note.body?.trim();
				if (!body) {
					continue;
				}

				const isDiffNote = note.type === "DiffNote";
				const kind: PullRequestComment["kind"] = isDiffNote
					? "review"
					: "conversation";

				comments.push({
					id: `${kind}-${note.id}`,
					authorLogin: note.author.username,
					...(note.author.avatar_url
						? { avatarUrl: note.author.avatar_url }
						: {}),
					body,
					createdAt: parseTimestamp(note.created_at),
					url: undefined, // Will be set by the caller with MR web_url
					kind,
					...(isDiffNote && note.position
						? {
								path: note.position.new_path ?? note.position.old_path,
								line:
									note.position.new_line ?? note.position.old_line ?? undefined,
							}
						: {}),
					isResolved: note.resolvable ? isResolved : false,
				});
			}
		}

		// If we got fewer than 100 discussions, we've reached the end
		if (raw.length < 100) {
			break;
		}

		page++;
	}

	return sortComments(comments);
}

/**
 * Fetches all MR comments (discussions) and returns them as PullRequestComment[].
 * Sets comment URLs based on the MR web URL.
 */
export async function fetchMergeRequestComments({
	worktreePath,
	projectPath,
	mrIid,
	mrWebUrl,
}: {
	worktreePath: string;
	projectPath: string;
	mrIid: number;
	mrWebUrl?: string;
}): Promise<PullRequestComment[]> {
	const comments = await fetchMRDiscussions(worktreePath, projectPath, mrIid);

	// Set comment URLs
	if (mrWebUrl) {
		for (const comment of comments) {
			const noteId = comment.id.replace(/^(review|conversation)-/, "");
			comment.url = `${mrWebUrl}#note_${noteId}`;
		}
	}

	return comments;
}
