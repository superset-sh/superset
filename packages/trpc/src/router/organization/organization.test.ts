import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { TRPCRouterRecord } from "@trpc/server";

const findFirstResults: unknown[] = [];
const findManyResults: unknown[][] = [];

const findFirstMock = mock(async () => findFirstResults.shift() ?? null);
const findManyMock = mock(async () => findManyResults.shift() ?? []);

const updateWhereMock = mock(async () => undefined);
const updateSetMock = mock(() => ({ where: updateWhereMock }));
const updateMock = mock(() => ({ set: updateSetMock }));

const leaveOrganizationMock = mock(async () => ({
	id: "session-1",
}));
const removeMemberApiMock = mock(async () => ({ success: true }));
const updateMemberRoleApiMock = mock(async () => ({ success: true }));

mock.module("@superset/db/client", () => ({
	db: {
		query: {
			members: {
				findFirst: findFirstMock,
				findMany: findManyMock,
			},
		},
		update: updateMock,
	},
	dbWs: {
		transaction: mock(async (cb: (tx: unknown) => unknown) =>
			cb({
				execute: mock(async () => undefined),
				query: {
					members: {
						findFirst: findFirstMock,
						findMany: findManyMock,
					},
				},
			}),
		),
	},
}));

mock.module("@superset/auth/stripe", () => ({
	stripeClient: {
		customers: {
			update: mock(async () => undefined),
		},
	},
}));

mock.module("@superset/db/schema", () => ({
	members: {
		id: "members.id",
		organizationId: "members.organizationId",
		userId: "members.userId",
		role: "members.role",
	},
	organizations: {
		id: "organizations.id",
		name: "organizations.name",
		slug: "organizations.slug",
		logo: "organizations.logo",
		allowedDomains: "organizations.allowedDomains",
		stripeCustomerId: "organizations.stripeCustomerId",
	},
}));

mock.module("@superset/db/schema/auth", () => ({
	sessions: {
		userId: "sessions.userId",
		activeOrganizationId: "sessions.activeOrganizationId",
	},
	invitations: {
		id: "invitations.id",
	},
	verifications: {
		value: "verifications.value",
	},
}));

mock.module("@superset/db/seed-default-statuses", () => ({
	seedDefaultStatuses: mock(async () => undefined),
}));

mock.module("@superset/db/utils", () => ({
	findOrgMembership: mock(async () => ({ role: "owner" })),
}));

mock.module("drizzle-orm", () => ({
	and: (...conditions: unknown[]) => ({ type: "and", conditions }),
	desc: (value: unknown) => ({ type: "desc", value }),
	eq: (left: unknown, right: unknown) => ({ type: "eq", left, right }),
	ilike: (left: unknown, right: unknown) => ({ type: "ilike", left, right }),
	isNull: (value: unknown) => ({ type: "isNull", value }),
	ne: (left: unknown, right: unknown) => ({ type: "ne", left, right }),
	sql: Object.assign(
		(strings: TemplateStringsArray, ...values: unknown[]) => ({
			type: "sql",
			strings,
			values,
		}),
		{ raw: (s: string) => ({ type: "raw", s }) },
	),
}));

mock.module("../../lib/upload", () => ({
	generateImagePathname: mock(() => "path"),
	uploadImage: mock(async () => "url"),
}));

mock.module("../integration/utils", () => ({
	verifyOrgAdmin: mock(async () => undefined),
}));

mock.module("./members", () => ({
	organizationMembersRouter: {},
}));

const { createCallerFactory, createTRPCRouter } = await import("../../trpc");
const { organizationRouter } = await import("./organization");

const createCaller = createCallerFactory(
	createTRPCRouter({
		organization: organizationRouter,
	} satisfies TRPCRouterRecord),
);

const ACTOR_USER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_USER_ID = "22222222-2222-4222-8222-222222222222";
const ORGANIZATION_ID = "33333333-3333-4333-8333-333333333333";
const ACTOR_MEMBER_ID = "44444444-4444-4444-8444-444444444444";
const OTHER_MEMBER_ID = "55555555-5555-4555-8555-555555555555";

function createContext() {
	return {
		session: {
			user: {
				id: ACTOR_USER_ID,
				email: "actor@example.com",
			},
			session: {
				activeOrganizationId: ORGANIZATION_ID,
			},
		} as never,
		auth: {
			api: {
				leaveOrganization: leaveOrganizationMock,
				removeMember: removeMemberApiMock,
				updateMemberRole: updateMemberRoleApiMock,
			},
		} as never,
		headers: new Headers(),
	};
}

describe("organization owner-orphan invariants", () => {
	beforeEach(() => {
		findFirstResults.length = 0;
		findManyResults.length = 0;

		findFirstMock.mockClear();
		findManyMock.mockClear();
		leaveOrganizationMock.mockClear();
		removeMemberApiMock.mockClear();
		updateMemberRoleApiMock.mockClear();
		updateMock.mockClear();
		updateSetMock.mockClear();
		updateWhereMock.mockClear();
	});

	test("leave rejects the last owner to prevent orphaning the organization", async () => {
		findFirstResults.push({
			id: ACTOR_MEMBER_ID,
			userId: ACTOR_USER_ID,
			organizationId: ORGANIZATION_ID,
			role: "owner",
		});
		findManyResults.push([
			{
				id: ACTOR_MEMBER_ID,
				userId: ACTOR_USER_ID,
				organizationId: ORGANIZATION_ID,
				role: "owner",
			},
			{
				id: OTHER_MEMBER_ID,
				userId: OTHER_USER_ID,
				organizationId: ORGANIZATION_ID,
				role: "member",
			},
		]);

		const caller = createCaller(createContext());

		await expect(
			caller.organization.leave({ organizationId: ORGANIZATION_ID }),
		).rejects.toMatchObject({
			code: "FORBIDDEN",
		});

		expect(leaveOrganizationMock).not.toHaveBeenCalled();
	});

	test("leave allows a non-owner to leave even when they are the only owner-eligible role", async () => {
		findFirstResults.push({
			id: ACTOR_MEMBER_ID,
			userId: ACTOR_USER_ID,
			organizationId: ORGANIZATION_ID,
			role: "member",
		});
		findFirstResults.push(null);

		const caller = createCaller(createContext());

		const result = await caller.organization.leave({
			organizationId: ORGANIZATION_ID,
		});

		expect(result).toMatchObject({ success: true });
		expect(leaveOrganizationMock).toHaveBeenCalledTimes(1);
	});

	test("leave allows an owner to leave when another owner remains", async () => {
		findFirstResults.push({
			id: ACTOR_MEMBER_ID,
			userId: ACTOR_USER_ID,
			organizationId: ORGANIZATION_ID,
			role: "owner",
		});
		findManyResults.push([
			{
				id: ACTOR_MEMBER_ID,
				userId: ACTOR_USER_ID,
				organizationId: ORGANIZATION_ID,
				role: "owner",
			},
			{
				id: OTHER_MEMBER_ID,
				userId: OTHER_USER_ID,
				organizationId: ORGANIZATION_ID,
				role: "owner",
			},
		]);
		findFirstResults.push(null);

		const caller = createCaller(createContext());

		const result = await caller.organization.leave({
			organizationId: ORGANIZATION_ID,
		});

		expect(result).toMatchObject({ success: true });
		expect(leaveOrganizationMock).toHaveBeenCalledTimes(1);
	});
});
