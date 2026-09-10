import { beforeEach, describe, expect, mock, test } from "bun:test";

let flagResult: boolean | undefined;
let storedEmail: string | null;
let lookups = 0;
let calls: Array<{
	key: string;
	distinctId: string;
	options?: { personProperties?: Record<string, string> };
}> = [];

// Both stubbed so the real clients — and the validated env and database
// connection they open at import — stay out of this test's module graph.
mock.module("@superset/db/client", () => ({
	db: {
		query: {
			users: {
				findFirst: () => {
					lookups += 1;
					return Promise.resolve(
						storedEmail === null ? undefined : { email: storedEmail },
					);
				},
			},
		},
	},
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

const signedIn = (email: string, id = "user-1") => ({
	userId: "user-1",
	session: { user: { id, email } },
});

describe("assertCloudAccess", () => {
	beforeEach(() => {
		calls = [];
		lookups = 0;
		storedEmail = "stored@superset.sh";
	});

	test("allows an account the flag is enabled for", async () => {
		flagResult = true;
		await assertCloudAccess(signedIn("Someone@Superset.sh"));
	});

	test("evaluates cloud-workspaces for the user, by normalized email", async () => {
		flagResult = true;
		await assertCloudAccess(signedIn("Someone@Superset.sh"));

		expect(calls).toHaveLength(1);
		expect(calls[0]?.key).toBe("cloud-workspaces");
		expect(calls[0]?.distinctId).toBe("user-1");
		expect(calls[0]?.options?.personProperties).toEqual({
			email: "someone@superset.sh",
		});
	});

	test("spends no query when the loaded session is this user", async () => {
		flagResult = true;
		await assertCloudAccess(signedIn("someone@superset.sh"));
		expect(lookups).toBe(0);
	});

	// A cookie session and a bearer can describe different people, so the
	// loaded row is only usable when it is this user's.
	test("looks the user up when the session is somebody else", async () => {
		flagResult = true;
		await assertCloudAccess(signedIn("other@superset.sh", "user-2"));

		expect(lookups).toBe(1);
		expect(calls[0]?.options?.personProperties).toEqual({
			email: "stored@superset.sh",
		});
	});

	test("refuses an account the flag is disabled for", async () => {
		flagResult = false;
		await expect(
			assertCloudAccess(signedIn("someone@example.com")),
		).rejects.toThrow(/not enabled for/);
	});

	// The one that matters: posthog-node resolves undefined when it cannot
	// reach PostHog, and an `enabled === false` check would hand out sandboxes
	// during an outage.
	test("refuses when the flag cannot be evaluated", async () => {
		flagResult = undefined;
		await expect(
			assertCloudAccess(signedIn("someone@superset.sh")),
		).rejects.toThrow(/not enabled for/);
	});

	test("refuses a user with no email on record", async () => {
		flagResult = false;
		storedEmail = null;
		await expect(
			assertCloudAccess({ userId: "user-1", session: null }),
		).rejects.toThrow(/this account/);
	});
});
