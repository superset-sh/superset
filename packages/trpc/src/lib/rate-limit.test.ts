import { beforeEach, describe, expect, test } from "bun:test";
import { TRPCError } from "@trpc/server";

process.env.SKIP_ENV_VALIDATION = "1";

const { enforceRateLimit, rateLimitIdentifier, setRateLimiters } = await import(
	"./rate-limit"
);

type FakeLimiter = {
	limit(identifier: string): Promise<{ success: boolean }>;
	seen: string[];
};

/** Allows `max` calls per identifier, then starts rejecting. */
function fakeLimiter(max: number): FakeLimiter {
	const hits = new Map<string, number>();
	const seen: string[] = [];

	return {
		seen,
		async limit(identifier: string) {
			seen.push(identifier);
			const count = (hits.get(identifier) ?? 0) + 1;
			hits.set(identifier, count);
			return { success: count <= max };
		},
	};
}

async function codeOf(promise: Promise<unknown>): Promise<string | undefined> {
	try {
		await promise;
		return undefined;
	} catch (error) {
		return error instanceof TRPCError ? error.code : "NOT_A_TRPC_ERROR";
	}
}

const subject = { userId: "user-1", organizationId: "org-1" };

describe("rateLimitIdentifier", () => {
	test("scopes the budget to the org/user pair", () => {
		expect(rateLimitIdentifier(subject)).toBe("org-1:user-1");
	});

	test("falls back to a no-org bucket", () => {
		expect(rateLimitIdentifier({ userId: "user-1" })).toBe("no-org:user-1");
		expect(
			rateLimitIdentifier({ userId: "user-1", organizationId: null }),
		).toBe("no-org:user-1");
	});
});

describe("enforceRateLimit", () => {
	beforeEach(() => {
		setRateLimiters(null);
	});

	test("throws TOO_MANY_REQUESTS once the mutation budget is spent", async () => {
		setRateLimiters({ mutation: fakeLimiter(2), query: fakeLimiter(2) });

		await enforceRateLimit({
			type: "mutation",
			path: "workspace.create",
			subject,
		});
		await enforceRateLimit({
			type: "mutation",
			path: "workspace.create",
			subject,
		});

		expect(
			await codeOf(
				enforceRateLimit({
					type: "mutation",
					path: "workspace.create",
					subject,
				}),
			),
		).toBe("TOO_MANY_REQUESTS");
	});

	test("keeps read and write budgets in separate buckets", async () => {
		setRateLimiters({ mutation: fakeLimiter(1), query: fakeLimiter(5) });

		await enforceRateLimit({
			type: "mutation",
			path: "workspace.create",
			subject,
		});
		expect(
			await codeOf(
				enforceRateLimit({
					type: "mutation",
					path: "workspace.create",
					subject,
				}),
			),
		).toBe("TOO_MANY_REQUESTS");

		// The write bucket being empty must not lock the user out of reads.
		expect(
			await codeOf(
				enforceRateLimit({ type: "query", path: "workspace.list", subject }),
			),
		).toBeUndefined();
	});

	test("does not let one user spend another user's budget", async () => {
		const mutation = fakeLimiter(1);
		setRateLimiters({ mutation, query: fakeLimiter(1) });

		await enforceRateLimit({
			type: "mutation",
			path: "workspace.create",
			subject: { userId: "user-1", organizationId: "org-1" },
		});

		expect(
			await codeOf(
				enforceRateLimit({
					type: "mutation",
					path: "workspace.create",
					subject: { userId: "user-2", organizationId: "org-1" },
				}),
			),
		).toBeUndefined();
		expect(mutation.seen).toEqual(["org-1:user-1", "org-1:user-2"]);
	});

	test("allows the request when no limiter is configured", async () => {
		setRateLimiters({ mutation: null, query: null });

		expect(
			await codeOf(
				enforceRateLimit({
					type: "mutation",
					path: "workspace.create",
					subject,
				}),
			),
		).toBeUndefined();
	});

	test("fails open when the limiter backend throws", async () => {
		setRateLimiters({
			mutation: {
				limit: async () => {
					throw new Error("redis unreachable");
				},
			},
			query: fakeLimiter(1),
		});

		expect(
			await codeOf(
				enforceRateLimit({
					type: "mutation",
					path: "workspace.create",
					subject,
				}),
			),
		).toBeUndefined();
	});
});
