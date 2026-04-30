import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { TRPCClientError } from "@trpc/client";
import { createTestHost, type TestHost } from "../helpers/createTestHost";

describe("cloud router integration", () => {
	let host: TestHost;

	beforeEach(async () => {
		host = await createTestHost({
			apiOverrides: {
				"user.me.query": () => ({
					id: "user-1",
					email: "test@superset.local",
					name: "Test User",
				}),
			},
		});
	});

	afterEach(async () => {
		await host.dispose();
	});

	test("whoami proxies to cloud user.me", async () => {
		const result = await host.trpc.cloud.whoami.query();
		expect(result).toEqual({
			id: "user-1",
			email: "test@superset.local",
			name: "Test User",
		});
		expect(host.apiCalls.map((c) => c.path)).toContain("user.me.query");
	});

	test("whoami requires authentication", async () => {
		await expect(
			host.unauthenticatedTrpc.cloud.whoami.query(),
		).rejects.toBeInstanceOf(TRPCClientError);
	});
});
