import { beforeEach, describe, expect, mock, test } from "bun:test";
import { TRPCError } from "@trpc/server";

process.env.SKIP_ENV_VALIDATION = "1";

mock.module("@superset/db/client", () => ({
	db: {
		query: {
			members: {
				findFirst: mock(async () => undefined),
				findMany: mock(async () => [{ organizationId: "org-1" }]),
			},
		},
	},
	dbWs: {},
}));

const {
	createCallerFactory,
	createTRPCRouter,
	jwtProcedure,
	protectedProcedure,
} = await import("./trpc");
const { setRateLimiters } = await import("./lib/rate-limit");

/** Allows `max` calls per identifier, then starts rejecting. */
function fakeLimiter(max: number) {
	const hits = new Map<string, number>();
	return {
		async limit(identifier: string) {
			const count = (hits.get(identifier) ?? 0) + 1;
			hits.set(identifier, count);
			return { success: count <= max };
		},
	};
}

const router = createTRPCRouter({
	protectedWrite: protectedProcedure.mutation(async () => "ok"),
	protectedRead: protectedProcedure.query(async () => "ok"),
	jwtWrite: jwtProcedure.mutation(async () => "ok"),
});

const createCaller = createCallerFactory(router);

function callerFor(userId: string) {
	return createCaller({
		session: {
			user: { id: userId, email: `${userId}@example.com`, name: userId },
			session: { activeOrganizationId: "org-1" },
		},
		auth: {},
		headers: new Headers(),
		// The real Session/auth types carry far more than these procedures read.
	} as unknown as Parameters<typeof createCaller>[0]);
}

async function codeOf(promise: Promise<unknown>): Promise<string | undefined> {
	try {
		await promise;
		return undefined;
	} catch (error) {
		return error instanceof TRPCError ? error.code : "NOT_A_TRPC_ERROR";
	}
}

describe("procedure rate limiting", () => {
	beforeEach(() => {
		setRateLimiters(null);
	});

	test("protectedProcedure mutations are rate limited per user", async () => {
		setRateLimiters({ mutation: fakeLimiter(2), query: fakeLimiter(50) });
		const caller = callerFor("user-1");

		expect(await caller.protectedWrite()).toBe("ok");
		expect(await caller.protectedWrite()).toBe("ok");
		expect(await codeOf(caller.protectedWrite())).toBe("TOO_MANY_REQUESTS");
	});

	test("jwtProcedure mutations are rate limited per user", async () => {
		setRateLimiters({ mutation: fakeLimiter(1), query: fakeLimiter(50) });
		const caller = callerFor("user-1");

		expect(await caller.jwtWrite()).toBe("ok");
		expect(await codeOf(caller.jwtWrite())).toBe("TOO_MANY_REQUESTS");
	});

	test("an exhausted write budget does not block reads", async () => {
		setRateLimiters({ mutation: fakeLimiter(0), query: fakeLimiter(50) });
		const caller = callerFor("user-1");

		expect(await codeOf(caller.protectedWrite())).toBe("TOO_MANY_REQUESTS");
		expect(await caller.protectedRead()).toBe("ok");
	});

	test("one user exhausting their budget does not affect another", async () => {
		setRateLimiters({ mutation: fakeLimiter(1), query: fakeLimiter(50) });

		expect(await callerFor("user-1").protectedWrite()).toBe("ok");
		expect(await codeOf(callerFor("user-1").protectedWrite())).toBe(
			"TOO_MANY_REQUESTS",
		);
		expect(await callerFor("user-2").protectedWrite()).toBe("ok");
	});
});
