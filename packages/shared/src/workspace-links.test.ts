import { describe, expect, test } from "bun:test";

import {
	buildPublicWorkspaceHandoffUrl,
	buildWorkspaceDeepLink,
	isWorkspaceId,
	PUBLIC_WORKSPACE_HANDOFF_PATH,
	pickWorkspaceHandoffParams,
	WORKSPACE_HANDOFF_PARAMS,
} from "./workspace-links";

const ID = "b502bf30-8693-4815-be65-795035e0ce5f";
const WEB_URL = "https://app.superset.sh";

describe("isWorkspaceId", () => {
	test.each([ID, ID.toUpperCase()])("accepts a uuid: %s", (value: string) => {
		expect(isWorkspaceId(value)).toBe(true);
	});

	test.each([
		"",
		"not-a-uuid",
		// A workspace name, which is what a hand-written link tends to carry.
		"ludicrous-candytuft",
		// Truncated, over-long, and non-hex variants of a real id.
		ID.slice(0, -1),
		`${ID}0`,
		ID.replace("b", "z"),
		// Path traversal and injected query/fragment must never reach a builder.
		`../${ID}`,
		`${ID}/..`,
		`${ID}?terminalId=x`,
		`${ID}#frag`,
		// Whitespace padding is not a uuid: trimming would silently accept junk.
		` ${ID}`,
		`${ID} `,
		`${ID}\n`,
	])("rejects a non-uuid: %p", (value: string) => {
		expect(isWorkspaceId(value)).toBe(false);
	});

	test("rejects non-strings", () => {
		for (const value of [undefined, null, 42, {}, [ID]]) {
			expect(isWorkspaceId(value)).toBe(false);
		}
	});
});

describe("buildWorkspaceDeepLink", () => {
	test("pins the canonical native scheme and path", () => {
		expect(buildWorkspaceDeepLink(ID)).toBe(`superset://v2-workspace/${ID}`);
	});

	test("appends allowlisted params in a stable order", () => {
		expect(
			buildWorkspaceDeepLink(ID, {
				terminalId: "term-1",
				chatSessionId: "chat-1",
				focusRequestId: "focus-1",
			}),
		).toBe(
			`superset://v2-workspace/${ID}?chatSessionId=chat-1&terminalId=term-1&focusRequestId=focus-1`,
		);
	});

	test("omits the query entirely when no params are carried", () => {
		expect(buildWorkspaceDeepLink(ID, {})).not.toContain("?");
	});

	test("percent-encodes param values", () => {
		expect(buildWorkspaceDeepLink(ID, { terminalId: "a b&c=d" })).toBe(
			`superset://v2-workspace/${ID}?terminalId=a+b%26c%3Dd`,
		);
	});

	test("rejects a malformed workspace id instead of building a link", () => {
		expect(() => buildWorkspaceDeepLink("nope")).toThrow(TypeError);
		expect(() => buildWorkspaceDeepLink(`${ID}/../other`)).toThrow(TypeError);
	});
});

describe("buildPublicWorkspaceHandoffUrl", () => {
	test("builds the public handoff URL on the given web origin", () => {
		expect(buildPublicWorkspaceHandoffUrl(ID, WEB_URL)).toBe(
			`https://app.superset.sh/open/v2-workspace/${ID}`,
		);
	});

	test("tolerates a trailing slash on the web origin", () => {
		expect(buildPublicWorkspaceHandoffUrl(ID, `${WEB_URL}/`)).toBe(
			`https://app.superset.sh/open/v2-workspace/${ID}`,
		);
	});

	test("works against a local dev origin with a port", () => {
		expect(buildPublicWorkspaceHandoffUrl(ID, "http://localhost:3000")).toBe(
			`http://localhost:3000/open/v2-workspace/${ID}`,
		);
	});

	test("carries the same allowlisted params as the native link", () => {
		expect(
			buildPublicWorkspaceHandoffUrl(ID, WEB_URL, {
				chatSessionId: "chat-1",
				focusRequestId: "focus-1",
			}),
		).toBe(
			`https://app.superset.sh/open/v2-workspace/${ID}?chatSessionId=chat-1&focusRequestId=focus-1`,
		);
	});

	test("uses the declared public route path", () => {
		expect(buildPublicWorkspaceHandoffUrl(ID, WEB_URL)).toContain(
			`${PUBLIC_WORKSPACE_HANDOFF_PATH}/`,
		);
	});

	test("rejects a malformed workspace id instead of building a link", () => {
		expect(() => buildPublicWorkspaceHandoffUrl("nope", WEB_URL)).toThrow(
			TypeError,
		);
	});

	test("rejects a web origin that is not a URL", () => {
		expect(() =>
			buildPublicWorkspaceHandoffUrl(ID, "app.superset.sh"),
		).toThrow();
	});
});

describe("pickWorkspaceHandoffParams", () => {
	test("keeps only the allowlisted params", () => {
		expect(
			pickWorkspaceHandoffParams({
				chatSessionId: "chat-1",
				terminalId: "term-1",
				focusRequestId: "focus-1",
				redirect: "https://evil.example",
				openUrl: "https://evil.example",
				workspaceId: "other",
			}),
		).toEqual({
			chatSessionId: "chat-1",
			terminalId: "term-1",
			focusRequestId: "focus-1",
		});
	});

	test("drops empty and missing values", () => {
		expect(
			pickWorkspaceHandoffParams({ terminalId: "", chatSessionId: undefined }),
		).toEqual({});
	});

	test("reads from URLSearchParams", () => {
		expect(
			pickWorkspaceHandoffParams(
				new URLSearchParams("terminalId=term-1&nope=1"),
			),
		).toEqual({ terminalId: "term-1" });
	});

	test("takes the first value of a repeated param, like URLSearchParams.get", () => {
		expect(pickWorkspaceHandoffParams({ terminalId: ["a", "b"] })).toEqual({
			terminalId: "a",
		});
		expect(
			pickWorkspaceHandoffParams(
				new URLSearchParams("terminalId=a&terminalId=b"),
			),
		).toEqual({ terminalId: "a" });
	});

	test("drops an empty repeated param", () => {
		expect(pickWorkspaceHandoffParams({ terminalId: [] })).toEqual({});
	});

	test("round-trips through the public URL back into the native link", () => {
		const publicUrl = new URL(
			buildPublicWorkspaceHandoffUrl(ID, WEB_URL, {
				terminalId: "term-1",
				focusRequestId: "focus-1",
			}),
		);
		const carried = pickWorkspaceHandoffParams(publicUrl.searchParams);
		expect(buildWorkspaceDeepLink(ID, carried)).toBe(
			`superset://v2-workspace/${ID}?terminalId=term-1&focusRequestId=focus-1`,
		);
	});
});

describe("WORKSPACE_HANDOFF_PARAMS", () => {
	test("is the documented deep-link param set, and nothing more", () => {
		expect([...WORKSPACE_HANDOFF_PARAMS]).toEqual([
			"chatSessionId",
			"terminalId",
			"focusRequestId",
		]);
	});
});
