import { beforeEach, describe, expect, mock, test } from "bun:test";

let flagResult: boolean | undefined;
let calls: Array<{
	key: string;
	distinctId: string;
	options?: { personProperties?: Record<string, string> };
}> = [];

// Stubbed so the real client — and the validated env it imports — stays out of
// this test's module graph.
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

const user = { userId: "user-1", email: "Someone@Superset.sh" };

describe("assertCloudAccess", () => {
	beforeEach(() => {
		calls = [];
	});

	test("allows an account the flag is enabled for", async () => {
		flagResult = true;
		await assertCloudAccess(user);
	});

	test("evaluates cloud-workspaces for the user, by normalized email", async () => {
		flagResult = true;
		await assertCloudAccess(user);

		expect(calls).toHaveLength(1);
		expect(calls[0]?.key).toBe("cloud-workspaces");
		expect(calls[0]?.distinctId).toBe("user-1");
		expect(calls[0]?.options?.personProperties).toEqual({
			email: "someone@superset.sh",
		});
	});

	test("refuses an account the flag is disabled for", async () => {
		flagResult = false;
		await expect(assertCloudAccess(user)).rejects.toThrow(/not on the list/);
	});

	// The one that matters: posthog-node resolves undefined when it cannot
	// reach PostHog, and an `enabled === false` check would hand out sandboxes
	// during an outage.
	test("refuses when the flag cannot be evaluated", async () => {
		flagResult = undefined;
		await expect(assertCloudAccess(user)).rejects.toThrow(/not on the list/);
	});
});
