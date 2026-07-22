import { describe, expect, mock, test } from "bun:test";
import { ORGANIZATION_HEADER } from "@superset/shared/constants";
import type { TRPCContext } from "./trpc";

const findManyMembers = mock(
	async () => [] as Array<{ organizationId: string }>,
);

mock.module("@superset/db/client", () => ({
	db: {
		query: {
			members: {
				findFirst: mock(async () => undefined),
				findMany: findManyMembers,
			},
		},
	},
}));

mock.module("@superset/db/schema", () => ({
	members: {
		organizationId: "organizationId",
		userId: "userId",
	},
}));

mock.module("drizzle-orm", () => ({
	and: (...conditions: unknown[]) => ({ conditions, type: "and" }),
	eq: (field: unknown, value: unknown) => ({ field, type: "eq", value }),
}));

const { createCallerFactory, createTRPCRouter, jwtProcedure } = await import(
	"./trpc"
);

const jwtContextRouter = createTRPCRouter({
	activeOrganization: jwtProcedure.query(({ ctx }) => ({
		activeOrganizationId: ctx.activeOrganizationId,
		organizationIds: ctx.organizationIds,
		userId: ctx.userId,
	})),
});
const createJwtContextCaller = createCallerFactory(jwtContextRouter);

type JwtPayload = {
	email?: string;
	organizationIds?: unknown;
	sub?: string;
};

function createJwtContext(
	payload: JwtPayload,
	headers?: Record<string, string>,
): TRPCContext {
	return {
		auth: {
			api: {
				verifyJWT: mock(async () => ({ payload })),
			},
		} as unknown as TRPCContext["auth"],
		headers: new Headers({
			authorization: "Bearer test-token",
			...headers,
		}),
		session: null,
	};
}

function createSessionContext(
	activeOrganizationId: string | null,
	headers?: Record<string, string>,
): TRPCContext {
	return {
		auth: {
			api: {
				verifyJWT: mock(async () => ({ payload: null })),
			},
		} as unknown as TRPCContext["auth"],
		headers: new Headers(headers),
		session: {
			session: { activeOrganizationId },
			user: { email: "user@example.com", id: "user-1" },
		} as unknown as NonNullable<TRPCContext["session"]>,
	};
}

describe("jwtProcedure", () => {
	test("uses the requested organization header when the JWT includes that membership", async () => {
		const caller = createJwtContextCaller(
			createJwtContext(
				{
					email: "user@example.com",
					organizationIds: ["org-default", "org-requested"],
					sub: "user-1",
				},
				{ [ORGANIZATION_HEADER]: "org-requested" },
			),
		);

		await expect(caller.activeOrganization()).resolves.toEqual({
			activeOrganizationId: "org-requested",
			organizationIds: ["org-default", "org-requested"],
			userId: "user-1",
		});
	});

	test("falls back to the first JWT organization when no header is provided", async () => {
		const caller = createJwtContextCaller(
			createJwtContext({
				email: "user@example.com",
				organizationIds: ["org-default", "org-other"],
				sub: "user-1",
			}),
		);

		await expect(caller.activeOrganization()).resolves.toEqual({
			activeOrganizationId: "org-default",
			organizationIds: ["org-default", "org-other"],
			userId: "user-1",
		});
	});

	test("rejects an organization header outside the JWT membership list", async () => {
		const caller = createJwtContextCaller(
			createJwtContext(
				{
					email: "user@example.com",
					organizationIds: ["org-default"],
					sub: "user-1",
				},
				{ [ORGANIZATION_HEADER]: "org-forbidden" },
			),
		);

		await expect(caller.activeOrganization()).rejects.toEqual(
			expect.objectContaining({
				code: "FORBIDDEN",
				message: "Not a member of organization org-forbidden",
			}),
		);
	});

	test("ignores malformed non-string organization IDs from JWT payloads", async () => {
		const caller = createJwtContextCaller(
			createJwtContext({
				email: "user@example.com",
				organizationIds: ["org-default", 123, null],
				sub: "user-1",
			}),
		);

		await expect(caller.activeOrganization()).resolves.toEqual({
			activeOrganizationId: "org-default",
			organizationIds: ["org-default"],
			userId: "user-1",
		});
	});

	test("keeps a session active organization when no organization header is provided", async () => {
		findManyMembers.mockResolvedValue([
			{ organizationId: "org-default" },
			{ organizationId: "org-active" },
		]);
		const caller = createJwtContextCaller(createSessionContext("org-active"));

		await expect(caller.activeOrganization()).resolves.toEqual({
			activeOrganizationId: "org-active",
			organizationIds: ["org-default", "org-active"],
			userId: "user-1",
		});
	});

	test("uses a valid organization header for session fallback callers", async () => {
		findManyMembers.mockResolvedValue([
			{ organizationId: "org-default" },
			{ organizationId: "org-requested" },
		]);
		const caller = createJwtContextCaller(
			createSessionContext("org-default", {
				[ORGANIZATION_HEADER]: "org-requested",
			}),
		);

		await expect(caller.activeOrganization()).resolves.toEqual({
			activeOrganizationId: "org-requested",
			organizationIds: ["org-default", "org-requested"],
			userId: "user-1",
		});
	});

	test("rejects an organization header outside the session user's memberships", async () => {
		findManyMembers.mockResolvedValue([
			{ organizationId: "org-default" },
			{ organizationId: "org-active" },
		]);
		const caller = createJwtContextCaller(
			createSessionContext("org-default", {
				[ORGANIZATION_HEADER]: "org-forbidden",
			}),
		);

		await expect(caller.activeOrganization()).rejects.toEqual(
			expect.objectContaining({
				code: "FORBIDDEN",
				message: "Not a member of organization org-forbidden",
			}),
		);
	});
});
