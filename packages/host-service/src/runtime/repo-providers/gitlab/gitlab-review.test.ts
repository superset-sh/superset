import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import type { RepoRef } from "../types";
import {
	fetchReviewThreadsGitLab,
	replyToReviewThreadGitLab,
	setReviewThreadResolutionGitLab,
} from "./gitlab-review";

const REPO: RepoRef = { owner: "acme", name: "widget" };
const PR_NUMBER = 42;
const DISCUSSION_ID = "abc123def456";
const _WEB_URL = "https://gitlab.example.com/acme/widget/-/merge_requests/42";

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

function makeDeps(token = "tok-test") {
	return {
		host: "gitlab.example.com",
		token: async () => token,
	};
}

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

describe("fetchReviewThreadsGitLab", () => {
	let originalFetch: typeof globalThis.fetch;

	beforeEach(() => {
		originalFetch = globalThis.fetch;
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	it("maps an ordinary discussion when the position field is omitted", async () => {
		const { position: _position, ...note } = CONVERSATION_NOTE;
		setupFetch(
			[{ id: "ordinary", individual_note: true, notes: [note] }],
			200,
			_WEB_URL,
		);
		const result = await fetchReviewThreadsGitLab(makeDeps(), REPO, PR_NUMBER);
		expect(result.reviewThreads).toEqual([]);
		expect(result.conversationComments).toEqual([
			{
				id: note.id,
				user: {
					login: note.author.username,
					avatarUrl: note.author.avatar_url,
				},
				body: note.body,
				createdAt: note.created_at,
				htmlUrl: `${_WEB_URL}#note_${note.id}`,
			},
		]);
	});

	it("scopes otherwise identical review threads to their GitLab host", async () => {
		const discussions = [
			{ id: DISCUSSION_ID, individual_note: false, notes: [POSITIONED_NOTE] },
		];
		setupFetch(discussions, 200, _WEB_URL);
		const first = await fetchReviewThreadsGitLab(makeDeps(), REPO, PR_NUMBER);
		setupFetch(discussions, 200, _WEB_URL);
		const second = await fetchReviewThreadsGitLab(
			{ ...makeDeps(), host: "another.example:8443" },
			REPO,
			PR_NUMBER,
		);
		expect(first.reviewThreads[0]?.id).not.toBe(second.reviewThreads[0]?.id);
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
		if (!thread) throw new Error("Expected review thread");
		const t = thread;

		expect(t.id).toBe(
			`gitlab:gitlab.example.com:acme/widget:42:${DISCUSSION_ID}`,
		);

		expect(t.isResolved).toBe(false);

		expect(t.path).toBe("src/foo.ts");
		expect(t.line).toBe(12);

		expect(t.diffSide).toBe("RIGHT");

		expect(t.isOutdated).toBe(false);

		expect(t.comments).toHaveLength(2);
		const c0 = t.comments[0];
		expect(c0).toBeDefined();
		if (!c0) throw new Error("Expected first comment");
		const comment0 = c0;
		expect(comment0.id).toBe(String(POSITIONED_NOTE.id));
		expect(comment0.author.login).toBe("alice");
		expect(comment0.author.avatarUrl).toBe("https://example.com/alice.png");
		expect(comment0.body).toBe("This needs refactoring.");
		expect(comment0.createdAt).toBe("2024-01-10T10:00:00Z");

		const c1 = t.comments[1];
		if (!c1) throw new Error("Expected reply");
		const comment1 = c1;
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
		const thread = reviewThreads[0];
		if (!thread) throw new Error("Expected review thread");
		expect(thread.diffSide).toBe("LEFT");
		expect(thread.line).toBe(5);
		expect(thread.path).toBe("src/bar.ts");
		expect(thread.isResolved).toBe(true);
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
		expect(reviewThreads[0]?.isResolved).toBe(true);
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
		if (!cc) throw new Error("Expected conversation comment");
		const comment = cc;
		expect(comment.id).toBe(CONVERSATION_NOTE.id);
		expect(comment.user.login).toBe("dave");
		expect(comment.user.avatarUrl).toBe("https://example.com/dave.png");
		expect(comment.body).toBe("LGTM overall.");
		expect(comment.createdAt).toBe("2024-01-11T09:00:00Z");
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
		const comment = conversationComments[0];
		if (!comment) throw new Error("Expected conversation comment");
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
		const thread = reviewThreads[0];
		if (!thread) throw new Error("Expected review thread");
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
		expect(reviewThreads[0]?.id).toBe(
			"gitlab:gitlab.example.com:org/sub/my-project:99:disc-special",
		);
	});
});

describe("setReviewThreadResolutionGitLab", () => {
	let originalFetch: typeof globalThis.fetch;

	beforeEach(() => {
		originalFetch = globalThis.fetch;
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	it.each([
		"0",
		"-1",
		"1.5",
		"42tail",
		"9007199254740992",
		"01",
	])("rejects invalid iid %s before reading a token", async (iid) => {
		const token = mock(async () => "token");
		const fetch = mock(
			async (_input: string | URL | Request, _init?: RequestInit) =>
				Response.json({}),
		);
		globalThis.fetch = fetch as unknown as typeof globalThis.fetch;
		await expect(
			setReviewThreadResolutionGitLab(
				{ host: "gitlab.example.com", token },
				`gitlab:gitlab.example.com:acme/widget:${iid}:disc`,
				true,
			),
		).rejects.toThrow();
		expect(token).not.toHaveBeenCalled();
		expect(fetch).not.toHaveBeenCalled();
	});

	it("rejects another host and legacy unscoped ids for resolve and reply", async () => {
		const token = mock(async () => "token");
		const fetch = mock(
			async (_input: string | URL | Request, _init?: RequestInit) =>
				Response.json({}),
		);
		globalThis.fetch = fetch as unknown as typeof globalThis.fetch;
		for (const id of [
			"gitlab:other.example:acme/widget:42:disc",
			"gitlab:acme/widget:42:disc",
			"gitlab:%ZZ:acme/widget:42:disc",
		]) {
			await expect(
				setReviewThreadResolutionGitLab(
					{ host: "gitlab.example.com", token },
					id,
					true,
				),
			).rejects.toThrow();
			await expect(
				replyToReviewThreadGitLab(
					{ host: "gitlab.example.com", token },
					id,
					"reply",
				),
			).rejects.toThrow();
		}
		expect(token).not.toHaveBeenCalled();
		expect(fetch).not.toHaveBeenCalled();
	});

	it("replies on the scoped host with an encoded discussion id", async () => {
		const fetch = mock(
			async (_input: string | URL | Request, _init?: RequestInit) =>
				Response.json({}),
		);
		globalThis.fetch = fetch as unknown as typeof globalThis.fetch;
		await replyToReviewThreadGitLab(
			{ host: "gitlab.example.com:8443", token: async () => "token" },
			"gitlab:gitlab.example.com%3A8443:group/subgroup/project:42:disc/id",
			"reply",
		);
		expect(fetch.mock.calls[0]?.[0]).toBe(
			"https://gitlab.example.com:8443/api/v4/projects/group%2Fsubgroup%2Fproject/merge_requests/42/discussions/disc%2Fid/notes",
		);
		expect(fetch.mock.calls[0]?.[1]).toMatchObject({
			method: "POST",
			body: JSON.stringify({ body: "reply" }),
		});
	});

	it("PUTs the correct GitLab API path with resolved=true", async () => {
		let capturedUrl = "";
		let capturedInit: RequestInit | undefined;
		globalThis.fetch = mock(async (url: string, init?: RequestInit) => {
			capturedUrl = url;
			capturedInit = init;
			return { ok: true, status: 200, json: async () => ({}) } as Response;
		}) as unknown as typeof fetch;

		const threadId = `gitlab:gitlab.example.com:acme/widget:42:${DISCUSSION_ID}`;
		await setReviewThreadResolutionGitLab(makeDeps(), threadId, true);

		expect(capturedUrl).toContain(
			`/api/v4/projects/acme%2Fwidget/merge_requests/42/discussions/${DISCUSSION_ID}`,
		);
		expect(JSON.parse(String(capturedInit?.body))).toEqual({ resolved: true });
		expect(capturedInit?.method).toBe("PUT");
	});

	it("PUTs with resolved=false to unresolve", async () => {
		let capturedInit: RequestInit | undefined;
		globalThis.fetch = mock(async (_url: string, init?: RequestInit) => {
			capturedInit = init;
			return { ok: true, status: 200, json: async () => ({}) } as Response;
		}) as unknown as typeof fetch;

		const threadId = `gitlab:gitlab.example.com:acme/widget:42:${DISCUSSION_ID}`;
		await setReviewThreadResolutionGitLab(makeDeps(), threadId, false);

		expect(JSON.parse(String(capturedInit?.body))).toEqual({ resolved: false });
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
				"gitlab:gitlab.example.com:acme/widget:42",
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

		const threadId = `gitlab:gitlab.example.com:acme/widget:42:${DISCUSSION_ID}`;
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

		const threadId =
			"gitlab:gitlab.example.com:group/subgroup/project:10:disc-xyz";
		await setReviewThreadResolutionGitLab(makeDeps(), threadId, true);

		expect(capturedUrl).toContain("merge_requests/10/discussions/disc-xyz");
	});
});
