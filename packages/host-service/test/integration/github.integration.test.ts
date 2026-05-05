import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createTestHost, type TestHost } from "../helpers/createTestHost";

describe("github router integration", () => {
	let host: TestHost;

	beforeEach(async () => {
		host = await createTestHost();
	});

	afterEach(async () => {
		await host.dispose();
	});

	test("getPR throws when no GitHub token is available", async () => {
		await expect(
			host.trpc.github.getPR.query({
				owner: "octocat",
				repo: "hello-world",
				pullNumber: 1,
			}),
		).rejects.toThrow(/no github token/i);
	});

	test("listPRs throws when no GitHub token is available", async () => {
		await expect(
			host.trpc.github.listPRs.query({ owner: "o", repo: "r" }),
		).rejects.toThrow(/no github token/i);
	});

	test("getPR rejects unauthenticated callers before reaching handler", async () => {
		await expect(
			host.unauthenticatedTrpc.github.getPR.query({
				owner: "o",
				repo: "r",
				pullNumber: 1,
			}),
		).rejects.toThrow(/UNAUTHORIZED|Invalid or missing/i);
	});
});
