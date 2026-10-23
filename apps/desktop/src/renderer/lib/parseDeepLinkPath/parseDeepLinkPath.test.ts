import { describe, expect, it } from "bun:test";
import { parseDeepLinkPath } from "./parseDeepLinkPath";

describe("parseDeepLinkPath", () => {
	it("splits the query string from the path", () => {
		expect(parseDeepLinkPath("/plugins/google-calendar?connected=1")).toEqual({
			to: "/plugins/google-calendar",
			search: { connected: "1" },
		});
	});

	it("keeps error codes", () => {
		expect(parseDeepLinkPath("/plugins/x?error=oauth_denied").search).toEqual({
			error: "oauth_denied",
		});
	});

	it("returns an empty search without a query", () => {
		expect(parseDeepLinkPath("/tasks/my-slug")).toEqual({
			to: "/tasks/my-slug",
			search: {},
		});
	});
});
