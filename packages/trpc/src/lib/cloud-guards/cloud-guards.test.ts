import { beforeEach, describe, expect, mock, test } from "bun:test";

let flagResult: boolean | undefined;
let storedEmail: string | null;
let calls: Array<{
	key: string;
	distinctId: string;
	options?: { personProperties?: Record<string, string> };
}> = [];

// Both stubbed so the real clients — and the validated env and database
// connection they open at import — stay out of this test's module graph.
mock.module("@superset/db/utils", () => ({
	findUserEmail: () => Promise.resolve(storedEmail),
}));
mock.module("../analytics", () => ({
	posthog: {
		isFeatureEnabled: (
			key: string,
			distinctId: string,
			options?: { personProperties?: Record<string, string> },
		) => {
			calls.push({ key, distinctId, options });
			return Promise.resolve(flagResult);
		},
	},
}));

const { assertCloudAccess } = await import("./cloud-guards");

describe("assertCloudAccess", () => {
	beforeEach(() => {
		calls = [];
		storedEmail = "Someone@Superset.sh";
	});

	test("allows an account the flag is enabled for", async () => {
		flagResult = true;
		await assertCloudAccess("user-1");
	});

	test("evaluates cloud-workspaces against the stored email, normalized", async () => {
		flagResult = true;
		await assertCloudAccess("user-1");

		expect(calls).toHaveLength(1);
		expect(calls[0]?.key).toBe("cloud-workspaces");
		expect(calls[0]?.distinctId).toBe("user-1");
		expect(calls[0]?.options?.personProperties).toEqual({
			email: "someone@superset.sh",
		});
	});

	test("refuses an account the flag is disabled for", async () => {
		flagResult = false;
		await expect(assertCloudAccess("user-1")).rejects.toThrow(
			/not on the list/,
		);
	});

	// The one that matters: posthog-node resolves undefined when it cannot
	// reach PostHog, and an `enabled === false` check would hand out sandboxes
	// during an outage.
	test("refuses when the flag cannot be evaluated", async () => {
		flagResult = undefined;
		await expect(assertCloudAccess("user-1")).rejects.toThrow(
			/not on the list/,
		);
	});

	test("refuses a user with no email on record", async () => {
		flagResult = false;
		storedEmail = null;
		await expect(assertCloudAccess("user-1")).rejects.toThrow(/this account/);
	});
});
