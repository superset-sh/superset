import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { TRPCError } from "@trpc/server";

const addMemberMock = mock(async (input: unknown) => input);
const findOrgMembershipMock = mock(async () => null);

mock.module("@superset/auth/stripe", () => ({
	stripeClient: {
		customers: {
			update: mock(async () => null),
		},
	},
}));

mock.module("@superset/db/client", () => ({
	db: {},
}));

mock.module("@superset/db/schema", () => ({
	members: {
		id: "members.id",
	},
	organizations: {
		id: "organizations.id",
	},
}));

mock.module("@superset/db/schema/auth", () => ({
	invitations: {
		id: "invitations.id",
	},
	sessions: {
		userId: "sessions.userId",
		activeOrganizationId: "sessions.activeOrganizationId",
	},
}));

mock.module("@superset/db/seed-default-statuses", () => ({
	seedDefaultStatuses: mock(async () => undefined),
}));

mock.module("@superset/db/utils", () => ({
	findOrgMembership: findOrgMembershipMock,
}));

mock.module("drizzle-orm", () => ({
	and: (...conditions: unknown[]) => ({ type: "and", conditions }),
	eq: (left: unknown, right: unknown) => ({ type: "eq", left, right }),
	ne: (left: unknown, right: unknown) => ({ type: "ne", left, right }),
	sql: (
		strings: TemplateStringsArray,
		...values: unknown[]
	): { strings: string[]; values: unknown[] } => ({
		strings: [...strings],
		values,
	}),
}));

mock.module("../../lib/upload", () => ({
	generateImagePathname: mock(() => "organization/logo.png"),
	uploadImage: mock(async () => "https://example.com/logo.png"),
}));

const { createCallerFactory, createTRPCRouter } = await import("../../trpc");
const { organizationRouter } = await import("./organization");

const createCaller = createCallerFactory(
	createTRPCRouter({
		organization: organizationRouter,
	}),
);

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const TARGET_USER_ID = "22222222-2222-4222-8222-222222222222";
const ACTOR_USER_ID = "33333333-3333-4333-8333-333333333333";

function createContext() {
	return {
		session: {
			user: {
				id: ACTOR_USER_ID,
				email: "actor@example.com",
			},
			session: {
				activeOrganizationId: ORG_ID,
			},
		} as never,
		auth: {
			api: {
				addMember: addMemberMock,
			},
		} as never,
		headers: new Headers({ cookie: "session=test" }),
	};
}

describe("organization router authorization", () => {
	beforeEach(() => {
		addMemberMock.mockReset();
		addMemberMock.mockImplementation(async (input: unknown) => input);
		findOrgMembershipMock.mockReset();
		findOrgMembershipMock.mockImplementation(async () => null);
	});

	it("rejects cross-tenant addMember attempts before calling auth.api.addMember", async () => {
		const caller = createCaller(createContext());

		await expect(
			caller.organization.addMember({
				organizationId: ORG_ID,
				userId: TARGET_USER_ID,
			}),
		).rejects.toMatchObject({
			code: "FORBIDDEN",
			message: "Not a member of this organization",
		} satisfies Partial<TRPCError>);

		expect(addMemberMock).not.toHaveBeenCalled();
	});

	it("requires admin or owner access to add members", async () => {
		findOrgMembershipMock.mockImplementation(async () => ({
			role: "member",
		}));
		const caller = createCaller(createContext());

		await expect(
			caller.organization.addMember({
				organizationId: ORG_ID,
				userId: TARGET_USER_ID,
			}),
		).rejects.toMatchObject({
			code: "FORBIDDEN",
			message: "Admin access required",
		} satisfies Partial<TRPCError>);

		expect(addMemberMock).not.toHaveBeenCalled();
	});

	it("allows org admins to add members to their own organization", async () => {
		findOrgMembershipMock.mockImplementation(async () => ({
			role: "admin",
		}));
		const caller = createCaller(createContext());

		await caller.organization.addMember({
			organizationId: ORG_ID,
			userId: TARGET_USER_ID,
		});

		expect(addMemberMock).toHaveBeenCalledWith({
			body: {
				organizationId: ORG_ID,
				userId: TARGET_USER_ID,
				role: "member",
			},
			headers: expect.any(Headers),
		});
	});
});
