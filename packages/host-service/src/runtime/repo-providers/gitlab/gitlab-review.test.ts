import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import type { RepoRef } from "../types";
import {
	fetchReviewThreadsGitLab,
	setReviewThreadResolutionGitLab,
} from "./gitlab-review";

// ---------------------------------------------------------------------------
// Synthetic samples matching VALIDATED GitLab discussion shapes
// ---------------------------------------------------------------------------

const REPO: RepoRef = { owner: "acme", name: "widget" };
const PR_NUMBER = 42;
const DISCUSSION_ID = "abc123def456";
const _WEB_URL = "https://gitlab.example.com/acme/widget/-/merge_requests/42";

/** A positioned note (diff discussion). */
const POSITIONED_NOTE = {
	id: 101,
	type: "DiffNote",
	body: "This needs refactoring.",
	author: { username: "alice", avatar_url: "https://example.com/alice.png" },
	created_at: "2024-01-10T10:00:00Z",
	system: false,
	resolvable: true,
	resolved: false,
	position: {
		new_path: "src/foo.ts",
		old_path: "src/foo.ts",
		new_line: 12,
		old_line: 10,
		position_type: "text",
	},
};

/** A second note in the same positioned discussion (reply). */
const POSITIONED_REPLY = {
	id: 102,
	type: "DiffNote",
	body: "Agreed, will fix.",
	author: { username: "bob", avatar_url: "https://example.com/bob.png" },
	created_at: "2024-01-10T11:00:00Z",
	system: false,
	resolvable: true,
	resolved: false,
	position: {
		new_path: "src/foo.ts",
		old_path: "src/foo.ts",
		new_line: 12,
		old_line: 10,
		position_type: "text",
	},
};

/** A discussion that is a resolved thread. */
const RESOLVED_NOTE = {
	id: 200,
	type: "DiffNote",
	body: "Done.",
	author: { username: "carol", avatar_url: "https://example.com/carol.png" },
	created_at: "2024-01-09T08:00:00Z",
	system: false,
	resolvable: true,
	resolved: true,
	position: {
		new_path: "src/bar.ts",
		old_path: "src/bar.ts",
		new_line: null,
		old_line: 5,
		position_type: "text",
	},
};

/** A non-positioned note (conversation comment). */
const CONVERSATION_NOTE = {
	id: 300,
	type: null,
	body: "LGTM overall.",
	author: { username: "dave", avatar_url: "https://example.com/dave.png" },
	created_at: "2024-01-11T09:00:00Z",
	system: false,
	resolvable: false,
	resolved: null,
	position: null,
};

/** A system note (should be filtered out). */
const SYSTEM_NOTE = {
	id: 400,
	type: null,
	body: "mentioned in commit abc",
	author: { username: "_gitlab", avatar_url: "" },
	created_at: "2024-01-10T08:00:00Z",
	system: true,
	resolvable: false,
	resolved: null,
	position: null,
};

/** A note with an empty body (should be skipped for conversation). */
const EMPTY_BODY_NOTE = {
	id: 500,
	type: null,
	body: "   ",
	author: { username: "eve", avatar_url: "https://example.com/eve.png" },
	created_at: "2024-01-12T07:00:00Z",
	system: false,
	resolvable: false,
	resolved: null,
	position: null,
};

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeDeps(token = "tok-test") {
	return {
		host: "gitlab.example.com",
		token: async () => token,
	};
}

/**
 * Set up fetch to respond to ALL calls with the same body.
 * The first call is the MR web_url fetch; subsequent calls return discussions.
 * Pass `mrWebUrl` to have the mock return it for the MR endpoint, or omit
 * to have it return the same `body` for all requests (backwards-compatible).
 */
function setupFetch(body: unknown, status = 200, mrWebUrl?: string) {
	let callIndex = 0;
	globalThis.fetch = mock(async () => {
		const isFirst = callIndex === 0;
		callIndex++;
		const responseBody =
			isFirst && mrWebUrl !== undefined ? { web_url: mrWebUrl } : body;
		return {
			ok: status >= 200 && status < 300,
			status,
			json: async () => responseBody,
		} as Response;
	}) as unknown as typeof fetch;
}

function _setupFetchHandler(
	handler: (
		url: string,
		init?: RequestInit,
	) => { status: number; body: unknown },
) {
	globalThis.fetch = mock(async (url: string, init?: RequestInit) => {
		const { status, body } = handler(url, init);
		return {
			ok: status >= 200 && status < 300,
			status,
			json: async () => body,
		} as Response;
	}) as unknown as typeof fetch;
}

// ---------------------------------------------------------------------------
// fetchReviewThreadsGitLab
// ---------------------------------------------------------------------------

describe("fetchReviewThreadsGitLab", () => {
	let originalFetch: typeof globalThis.fetch;

	beforeEach(() => {
		originalFetch = globalThis.fetch;
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	it("calls the correct GitLab discussions endpoint with per_page=100", async () => {
		let capturedUrl = "";
		globalThis.fetch = mock(async (url: string) => {
			capturedUrl = url;
			return { ok: true, status: 200, json: async () => [] } as Response;
		}) as unknown as typeof fetch;

		await fetchReviewThreadsGitLab(makeDeps(), REPO, PR_NUMBER);

		expect(capturedUrl).toContain(
			"/api/v4/projects/acme%2Fwidget/merge_requests/42/discussions",
		);
		expect(capturedUrl).toContain("per_page=100");
	});

	it("maps a positioned discussion to a reviewThread with correct fields", async () => {
		const discussion = {
			id: DISCUSSION_ID,
			individual_note: false,
			notes: [POSITIONED_NOTE, POSITIONED_REPLY],
		};
		setupFetch([discussion]);

		const { reviewThreads, conversationComments } =
			await fetchReviewThreadsGitLab(makeDeps(), REPO, PR_NUMBER);

		expect(conversationComments).toHaveLength(0);
		expect(reviewThreads).toHaveLength(1);

		const thread = reviewThreads[0];
		expect(thread).toBeDefined();
		// biome-ignore lint/style/noNonNullAssertion: asserted above
		const t = thread!;

		// Composite id
		expect(t.id).toBe(`gitlab:acme/widget:42:${DISCUSSION_ID}`);

		// Resolution: first note resolved=false, so thread is not resolved
		expect(t.isResolved).toBe(false);

		// Path and line from position.new_path + new_line
		expect(t.path).toBe("src/foo.ts");
		expect(t.line).toBe(12);

		// diffSide: new_line is non-null → RIGHT
		expect(t.diffSide).toBe("RIGHT");

		// isOutdated always false (GitLab lacks a direct flag)
		expect(t.isOutdated).toBe(false);

		// Comments mapped correctly
		expect(t.comments).toHaveLength(2);
		const c0 = t.comments[0];
		expect(c0).toBeDefined();
		// biome-ignore lint/style/noNonNullAssertion: asserted above
		const comment0 = c0!;
		expect(comment0.id).toBe(String(POSITIONED_NOTE.id));
		expect(comment0.author.login).toBe("alice");
		expect(comment0.author.avatarUrl).toBe("https://example.com/alice.png");
		expect(comment0.body).toBe("This needs refactoring.");
		expect(comment0.createdAt).toBe("2024-01-10T10:00:00Z");

		const c1 = t.comments[1];
		// biome-ignore lint/style/noNonNullAssertion: asserted via length
		const comment1 = c1!;
		expect(comment1.author.login).toBe("bob");
	});

	it("sets diffSide=LEFT when new_line is null but old_line is set", async () => {
		const discussion = {
			id: "disc-left",
			individual_note: false,
			notes: [RESOLVED_NOTE],
		};
		setupFetch([discussion]);

		const { reviewThreads } = await fetchReviewThreadsGitLab(
			makeDeps(),
			REPO,
			PR_NUMBER,
		);

		expect(reviewThreads).toHaveLength(1);
		// biome-ignore lint/style/noNonNullAssertion: asserted above
		const thread = reviewThreads[0]!;
		expect(thread.diffSide).toBe("LEFT");
		expect(thread.line).toBe(5); // old_line
		expect(thread.path).toBe("src/bar.ts"); // old_path fallback
		expect(thread.isResolved).toBe(true); // resolved=true on first note
	});

	it("marks thread as resolved when all resolvable notes are resolved", async () => {
		const resolvedNote1 = { ...POSITIONED_NOTE, id: 110, resolved: true };
		const resolvedNote2 = { ...POSITIONED_REPLY, id: 111, resolved: true };
		const discussion = {
			id: "disc-resolved",
			individual_note: false,
			notes: [resolvedNote1, resolvedNote2],
		};
		setupFetch([discussion]);

		const { reviewThreads } = await fetchReviewThreadsGitLab(
			makeDeps(),
			REPO,
			PR_NUMBER,
		);

		// biome-ignore lint/style/noNonNullAssertion: length checked below
		expect(reviewThreads[0]!.isResolved).toBe(true);
	});

	it("maps a non-positioned discussion to conversationComments", async () => {
		const discussion = {
			id: "disc-conv",
			individual_note: true,
			notes: [CONVERSATION_NOTE],
		};
		setupFetch([discussion]);

		const { reviewThreads, conversationComments } =
			await fetchReviewThreadsGitLab(makeDeps(), REPO, PR_NUMBER);

		expect(reviewThreads).toHaveLength(0);
		expect(conversationComments).toHaveLength(1);
		const cc = conversationComments[0];
		// biome-ignore lint/style/noNonNullAssertion: length asserted
		const comment = cc!;
		expect(comment.id).toBe(CONVERSATION_NOTE.id);
		expect(comment.user.login).toBe("dave");
		expect(comment.user.avatarUrl).toBe("https://example.com/dave.png");
		expect(comment.body).toBe("LGTM overall.");
		expect(comment.createdAt).toBe("2024-01-11T09:00:00Z");
		// htmlUrl is a string (may be empty if web_url not fetched)
		expect(typeof comment.htmlUrl).toBe("string");
	});

	it("sets htmlUrl to mrWebUrl#note_{id} for conversation comments", async () => {
		const discussion = {
			id: "disc-url",
			individual_note: true,
			notes: [CONVERSATION_NOTE],
		};
		const mrWebUrl =
			"https://gitlab.example.com/acme/widget/-/merge_requests/42";
		setupFetch([discussion], 200, mrWebUrl);

		const { conversationComments } = await fetchReviewThreadsGitLab(
			makeDeps(),
			REPO,
			PR_NUMBER,
		);

		expect(conversationComments).toHaveLength(1);
		// biome-ignore lint/style/noNonNullAssertion: length asserted
		const comment = conversationComments[0]!;
		expect(comment.htmlUrl).toBe(`${mrWebUrl}#note_${CONVERSATION_NOTE.id}`);
	});

	it("filters out system notes", async () => {
		const discussion = {
			id: "disc-system-only",
			individual_note: true,
			notes: [SYSTEM_NOTE],
		};
		setupFetch([discussion]);

		const { reviewThreads, conversationComments } =
			await fetchReviewThreadsGitLab(makeDeps(), REPO, PR_NUMBER);

		expect(reviewThreads).toHaveLength(0);
		expect(conversationComments).toHaveLength(0);
	});

	it("skips discussions where all notes are system notes", async () => {
		const discussion = {
			id: "disc-all-system",
			individual_note: true,
			notes: [SYSTEM_NOTE, { ...SYSTEM_NOTE, id: 401 }],
		};
		setupFetch([discussion]);

		const { reviewThreads, conversationComments } =
			await fetchReviewThreadsGitLab(makeDeps(), REPO, PR_NUMBER);

		expect(reviewThreads).toHaveLength(0);
		expect(conversationComments).toHaveLength(0);
	});

	it("skips conversation notes with empty/whitespace body", async () => {
		const discussion = {
			id: "disc-empty",
			individual_note: true,
			notes: [EMPTY_BODY_NOTE],
		};
		setupFetch([discussion]);

		const { reviewThreads, conversationComments } =
			await fetchReviewThreadsGitLab(makeDeps(), REPO, PR_NUMBER);

		expect(reviewThreads).toHaveLength(0);
		expect(conversationComments).toHaveLength(0);
	});

	it("mixes positioned and non-positioned discussions correctly", async () => {
		const posDiscussion = {
			id: "d-pos",
			individual_note: false,
			notes: [POSITIONED_NOTE],
		};
		const convDiscussion = {
			id: "d-conv",
			individual_note: true,
			notes: [CONVERSATION_NOTE],
		};
		const systemDiscussion = {
			id: "d-sys",
			individual_note: true,
			notes: [SYSTEM_NOTE],
		};
		setupFetch([posDiscussion, convDiscussion, systemDiscussion]);

		const { reviewThreads, conversationComments } =
			await fetchReviewThreadsGitLab(makeDeps(), REPO, PR_NUMBER);

		expect(reviewThreads).toHaveLength(1);
		expect(conversationComments).toHaveLength(1);
	});

	it("returns empty results for an empty discussions array", async () => {
		setupFetch([]);

		const { reviewThreads, conversationComments } =
			await fetchReviewThreadsGitLab(makeDeps(), REPO, PR_NUMBER);

		expect(reviewThreads).toHaveLength(0);
		expect(conversationComments).toHaveLength(0);
	});

	it("uses old_path when new_path is null", async () => {
		const noteWithOldPathOnly = {
			...POSITIONED_NOTE,
			position: {
				new_path: null,
				old_path: "src/deleted.ts",
				new_line: null,
				old_line: 3,
				position_type: "text",
			},
		};
		const discussion = {
			id: "disc-old-path",
			individual_note: false,
			notes: [noteWithOldPathOnly],
		};
		setupFetch([discussion]);

		const { reviewThreads } = await fetchReviewThreadsGitLab(
			makeDeps(),
			REPO,
			PR_NUMBER,
		);

		// biome-ignore lint/style/noNonNullAssertion: length checked below
		const thread = reviewThreads[0]!;
		expect(thread.path).toBe("src/deleted.ts");
		expect(thread.diffSide).toBe("LEFT");
	});

	it("encodes composite thread id correctly for special chars in repo name", async () => {
		const specialRepo: RepoRef = { owner: "org/sub", name: "my-project" };
		const discussion = {
			id: "disc-special",
			individual_note: false,
			notes: [POSITIONED_NOTE],
		};
		setupFetch([discussion]);

		const { reviewThreads } = await fetchReviewThreadsGitLab(
			makeDeps(),
			specialRepo,
			99,
		);

		// biome-ignore lint/style/noNonNullAssertion: length checked below
		expect(reviewThreads[0]!.id).toBe(
			"gitlab:org/sub/my-project:99:disc-special",
		);
	});
});

// ---------------------------------------------------------------------------
// setReviewThreadResolutionGitLab
// ---------------------------------------------------------------------------

describe("setReviewThreadResolutionGitLab", () => {
	let originalFetch: typeof globalThis.fetch;

	beforeEach(() => {
		originalFetch = globalThis.fetch;
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	it("PUTs the correct GitLab API path with resolved=true", async () => {
		let capturedUrl = "";
		let capturedInit: RequestInit | undefined;
		globalThis.fetch = mock(async (url: string, init?: RequestInit) => {
			capturedUrl = url;
			capturedInit = init;
			return { ok: true, status: 200, json: async () => ({}) } as Response;
		}) as unknown as typeof fetch;

		const threadId = `gitlab:acme/widget:42:${DISCUSSION_ID}`;
		await setReviewThreadResolutionGitLab(makeDeps(), threadId, true);

		expect(capturedUrl).toContain(
			`/api/v4/projects/acme%2Fwidget/merge_requests/42/discussions/${DISCUSSION_ID}`,
		);
		expect(capturedUrl).toContain("resolved=true");
		expect(capturedInit?.method).toBe("PUT");
	});

	it("PUTs with resolved=false to unresolve", async () => {
		let capturedUrl = "";
		globalThis.fetch = mock(async (url: string) => {
			capturedUrl = url;
			return { ok: true, status: 200, json: async () => ({}) } as Response;
		}) as unknown as typeof fetch;

		const threadId = `gitlab:acme/widget:42:${DISCUSSION_ID}`;
		await setReviewThreadResolutionGitLab(makeDeps(), threadId, false);

		expect(capturedUrl).toContain("resolved=false");
	});

	it("throws on malformed composite id (wrong prefix)", async () => {
		await expect(
			setReviewThreadResolutionGitLab(
				makeDeps(),
				"github:acme/widget:42:disc",
				true,
			),
		).rejects.toThrow();
	});

	it("throws on malformed composite id (missing parts)", async () => {
		await expect(
			setReviewThreadResolutionGitLab(
				makeDeps(),
				"gitlab:acme/widget:42",
				true,
			),
		).rejects.toThrow();
	});

	it("throws on malformed composite id (empty string)", async () => {
		await expect(
			setReviewThreadResolutionGitLab(makeDeps(), "", true),
		).rejects.toThrow();
	});

	it("propagates non-ok HTTP errors", async () => {
		globalThis.fetch = mock(async () => ({
			ok: false,
			status: 403,
			json: async () => ({ message: "Forbidden" }),
		})) as unknown as typeof fetch;

		const threadId = `gitlab:acme/widget:42:${DISCUSSION_ID}`;
		await expect(
			setReviewThreadResolutionGitLab(makeDeps(), threadId, true),
		).rejects.toThrow();
	});

	it("correctly encodes project path with slash in owner", async () => {
		let capturedUrl = "";
		globalThis.fetch = mock(async (url: string) => {
			capturedUrl = url;
			return { ok: true, status: 200, json: async () => ({}) } as Response;
		}) as unknown as typeof fetch;

		// owner = "group/subgroup", name = "project"
		const threadId = "gitlab:group/subgroup/project:10:disc-xyz";
		await setReviewThreadResolutionGitLab(makeDeps(), threadId, true);

		// The composite format is gitlab:{owner}/{name}:{iid}:{discussionId}
		// owner/name is everything between "gitlab:" and ":{iid}:{discussionId}"
		// We parse by splitting on ":" with 4 parts max
		expect(capturedUrl).toContain("merge_requests/10/discussions/disc-xyz");
	});
});
