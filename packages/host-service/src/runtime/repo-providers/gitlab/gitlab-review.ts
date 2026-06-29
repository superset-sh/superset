/**
 * GitLab MR discussions → review threads + conversation comments adapter.
 *
 * API reference: GET /projects/:id/merge_requests/:iid/discussions
 * Resolve API:   PUT /projects/:id/merge_requests/:iid/discussions/:discussion_id?resolved=<bool>
 *
 * Shape notes:
 * - `position` is a DOCUMENTED field for diff notes. No live diff-discussion existed
 *   to capture during development; mark this mapping for live validation before
 *   relying on it in production.
 * - `isOutdated` is always `false`: GitLab has no direct equivalent of GitHub's
 *   `isOutdated` flag on review threads. A follow-up can approximate it by comparing
 *   the note's position SHA with the current MR head SHA, but this is not implemented.
 */
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
} from "./gitlab-rest";

// ---------------------------------------------------------------------------
// Raw GitLab discussion shapes
// ---------------------------------------------------------------------------

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
	position: GitLabNotePosition | null;
}

interface GitLabDiscussion {
	id: string;
	individual_note: boolean;
	notes: GitLabNote[];
}

// ---------------------------------------------------------------------------
// Composite thread id
// ---------------------------------------------------------------------------

/**
 * Encode a composite thread id for GitLab so that `setReviewThreadResolution`
 * can recover all the information needed for the PUT endpoint without storing
 * extra state.
 *
 * Format: `gitlab:{owner}/{name}:{prNumber}:{discussionId}`
 *
 * We use `:` as the outer delimiter (3 occurrences), with `{owner}/{name}`
 * occupying the middle segment. To parse: split on `:` into 4 parts — the
 * first is always "gitlab", the last is the discussionId, the second-to-last
 * is the iid (numeric), and the remaining middle segment is "{owner}/{name}".
 */
function encodeThreadId(
	owner: string,
	name: string,
	prNumber: number,
	discussionId: string,
): string {
	return `gitlab:${owner}/${name}:${prNumber}:${discussionId}`;
}

/**
 * Parse a composite GitLab thread id.
 * Throws if the format is invalid.
 */
function parseThreadId(threadId: string): {
	owner: string;
	name: string;
	iid: number;
	discussionId: string;
} {
	// Split on ":" — we expect exactly 4 segments:
	// [0] "gitlab"  [1] "owner/name"  [2] "iid"  [3] "discussionId"
	const parts = threadId.split(":");
	if (parts.length !== 4 || parts[0] !== "gitlab") {
		throw new Error(
			`[gitlab-review] Malformed composite thread id: "${threadId}". Expected format: gitlab:{owner}/{name}:{iid}:{discussionId}`,
		);
	}

	const ownerName = parts[1] ?? "";
	const iidStr = parts[2] ?? "";
	const discussionId = parts[3] ?? "";

	if (!ownerName || !iidStr || !discussionId) {
		throw new Error(
			`[gitlab-review] Malformed composite thread id: "${threadId}". One or more segments are empty.`,
		);
	}

	// owner/name: everything in ownerName up to the last slash is owner; rest is name
	const slashIdx = ownerName.lastIndexOf("/");
	if (slashIdx === -1) {
		throw new Error(
			`[gitlab-review] Malformed composite thread id: "${threadId}". Cannot split owner/name — no slash found.`,
		);
	}
	const owner = ownerName.slice(0, slashIdx);
	const name = ownerName.slice(slashIdx + 1);

	const iid = Number.parseInt(iidStr, 10);
	if (!owner || !name || Number.isNaN(iid)) {
		throw new Error(
			`[gitlab-review] Malformed composite thread id: "${threadId}". Invalid owner, name, or iid.`,
		);
	}

	return { owner, name, iid, discussionId };
}

// ---------------------------------------------------------------------------
// Map a GitLab note to PullRequestReviewComment
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// fetchReviewThreadsGitLab
// ---------------------------------------------------------------------------

/**
 * Fetch MR discussions from GitLab and split them into:
 *  - `reviewThreads`: discussions where the first non-system note has a position
 *    (i.e. diff comments). Mapped to `PullRequestReviewThread`.
 *  - `conversationComments`: all other non-system notes from non-positioned
 *    discussions. Mapped to `IssueComment`.
 *
 * VALIDATED shapes: the outer discussion wrapper and note fields have been
 * captured from a live GitLab instance. The `position` object is DOCUMENTED
 * (see module-level note) — mark for live validation.
 */
export async function fetchReviewThreadsGitLab(
	deps: GitLabRestDeps,
	repo: RepoRef,
	prNumber: number,
): Promise<{
	reviewThreads: PullRequestReviewThread[];
	conversationComments: IssueComment[];
}> {
	const enc = encodeProjectPath(repo.owner, repo.name);

	// Fetch the MR's web_url once so we can build per-note anchor URLs.
	// The discussions endpoint does not include it; we need a separate MR call.
	let mrWebUrl = "";
	try {
		const mr = await gitlabRest<{ web_url: string }>(
			deps,
			`/projects/${enc}/merge_requests/${prNumber}`,
		);
		mrWebUrl = mr.web_url ?? "";
	} catch {
		// Non-fatal: fall back to empty URL (no deep-links for this call).
	}

	const discussions = await gitlabRest<GitLabDiscussion[]>(
		deps,
		`/projects/${enc}/merge_requests/${prNumber}/discussions`,
		{ per_page: 100 },
	);

	const reviewThreads: PullRequestReviewThread[] = [];
	const conversationComments: IssueComment[] = [];

	for (const discussion of discussions) {
		// Drop system notes
		const notes = discussion.notes.filter((n) => !n.system);

		// If no notes remain after filtering, skip this discussion
		if (notes.length === 0) continue;

		const firstNote = notes[0] as GitLabNote;

		if (firstNote.position !== null) {
			// ── Diff / review thread ──────────────────────────────────────────
			const pos = firstNote.position;

			// Resolve: all resolvable notes resolved, or first note's resolved=true
			const resolvableNotes = notes.filter((n) => n.resolvable);
			const isResolved =
				resolvableNotes.length > 0
					? resolvableNotes.every((n) => n.resolved === true)
					: firstNote.resolved === true;

			// Path: prefer new_path (right side), fall back to old_path
			const path = pos.new_path ?? pos.old_path ?? "";

			// Line and diffSide: prefer new_line (RIGHT side); fall back to old_line (LEFT)
			const line =
				pos.new_line !== null ? pos.new_line : (pos.old_line ?? null);
			const diffSide =
				pos.new_line !== null ? ("RIGHT" as const) : ("LEFT" as const);

			// isOutdated: GitLab has no direct flag — always false.
			// See module-level note; approximation via SHA comparison is a future improvement.
			const isOutdated = false;

			const compositeId = encodeThreadId(
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
			// ── Conversation comments ─────────────────────────────────────────
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
					// Construct a deep-link to the specific note using the MR web_url
					// fetched at the start of this function. Falls back to "" when the
					// MR URL could not be retrieved.
					htmlUrl: mrWebUrl ? `${mrWebUrl}#note_${note.id}` : "",
				});
			}
		}
	}

	return { reviewThreads, conversationComments };
}

// ---------------------------------------------------------------------------
// setReviewThreadResolutionGitLab
// ---------------------------------------------------------------------------

/**
 * Resolve or unresolve a GitLab MR discussion thread.
 *
 * The `threadId` must be a composite id produced by `fetchReviewThreadsGitLab`
 * in the form: `gitlab:{owner}/{name}:{iid}:{discussionId}`.
 *
 * Throws if the id is malformed or if the API returns a non-ok response.
 */
export async function setReviewThreadResolutionGitLab(
	deps: GitLabRestDeps,
	threadId: string,
	resolved: boolean,
): Promise<void> {
	const { owner, name, iid, discussionId } = parseThreadId(threadId);

	const token = await deps.token();
	if (!token) {
		throw new Error(`[gitlab-review] No GitLab token for host ${deps.host}`);
	}

	const enc = encodeProjectPath(owner, name);
	const url = new URL(
		`https://${deps.host}/api/v4/projects/${enc}/merge_requests/${iid}/discussions/${discussionId}`,
	);
	url.searchParams.set("resolved", String(resolved));

	const res = await fetch(url.toString(), {
		method: "PUT",
		headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
	});

	if (!res.ok) {
		throw new Error(
			`[gitlab-review] GitLab ${res.status} when resolving discussion ${discussionId} on MR ${iid}`,
		);
	}
}
