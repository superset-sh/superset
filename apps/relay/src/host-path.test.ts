import { describe, expect, test } from "bun:test";
import { pathAfterHostUrl } from "./host-path";

describe("pathAfterHostUrl", () => {
	test("preserves a tRPC path after an unencoded org-scoped routing key", () => {
		expect(
			pathAfterHostUrl(
				"http://relay.test/hosts/org:machine/trpc/workspace.list?input=x",
			),
		).toBe("/trpc/workspace.list");
	});

	test("preserves the same tRPC path after a percent-encoded routing key", () => {
		expect(
			pathAfterHostUrl(
				"http://relay.test/hosts/org%3Amachine/trpc/workspace.list?input=x",
			),
		).toBe("/trpc/workspace.list");
	});

	test("preserves a session WebSocket path after an encoded routing key", () => {
		expect(
			pathAfterHostUrl(
				"http://relay.test/hosts/org%3Amachine/sessions/session-1/stream?since=4",
			),
		).toBe("/sessions/session-1/stream");
	});

	test("returns the root suffix when no path follows the host", () => {
		expect(pathAfterHostUrl("http://relay.test/hosts/org%3Amachine")).toBe("/");
	});
});
