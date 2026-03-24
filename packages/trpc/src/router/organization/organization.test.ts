import { beforeEach, describe, expect, mock, test } from "bun:test";

const TEST_USER_ID = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
const TEST_ORG_ID = "b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22";

// ── Helpers ─────────────────────────────────────────────────────────────

function asyncIterableOf<T>(items: T[]): AsyncIterable<T> {
	return {
		[Symbol.asyncIterator]: async function* () {
			for (const item of items) yield item;
		},
	};
}

// ── Mock state ──────────────────────────────────────────────────────────
let mockMembership: { role: string } | undefined;
let mockOrganization:
	| { id: string; stripeCustomerId: string | null }
	| undefined;
const callOrder: string[] = [];

const mockFindOrgMembership = mock(
	(_args: { userId: string; organizationId: string }) =>
		Promise.resolve(mockMembership),
);
const mockDeleteWhere = mock(() => {
	callOrder.push("delete");
	return Promise.resolve();
});
const mockSubscriptionsList = mock(
	(_params: { customer: string; status: string }) =>
		asyncIterableOf<{ id: string }>([]),
);
const mockSubscriptionsCancel = mock((_id: string) => {
	callOrder.push("cancel");
	return Promise.resolve();
});

// ── Mocks (must be declared before dynamic import) ──────────────────────

mock.module("@superset/db/client", () => ({
	db: {
		delete: () => ({ where: mockDeleteWhere }),
		query: {
			organizations: {
				findFirst: () => Promise.resolve(mockOrganization),
			},
		},
		transaction: (fn: (tx: unknown) => Promise<unknown>) => {
			const tx = {
				delete: () => ({ where: mockDeleteWhere }),
				query: {
					members: {
						findFirst: () => Promise.resolve(mockMembership),
					},
				},
			};
			return fn(tx);
		},
	},
}));

mock.module("@superset/db/utils", () => ({
	findOrgMembership: mockFindOrgMembership,
}));

mock.module("@superset/auth/stripe", () => ({
	stripeClient: {
		subscriptions: {
			list: mockSubscriptionsList,
			cancel: mockSubscriptionsCancel,
		},
	},
}));

// Re-export real schema symbols so `eq()` / `organizations` references work
mock.module("@superset/db/schema", () => ({
	organizations: { id: "organizations.id" },
	members: {
		organizationId: "members.organizationId",
		userId: "members.userId",
	},
}));

// Stubs for imports used by the router file but not by the `delete` mutation
mock.module("@superset/db/schema/auth", () => ({
	sessions: {},
	invitations: {},
}));
mock.module("@superset/db/seed-default-statuses", () => ({
	seedDefaultStatuses: mock(),
}));
mock.module("@superset/shared/auth", () => ({
	canRemoveMember: mock(),
}));
mock.module("../../lib/upload", () => ({
	generateImagePathname: mock(),
	uploadImage: mock(),
}));

// ── Dynamic import of the module under test ─────────────────────────────

const { organizationRouter } = await import("./organization");
const { createCallerFactory, createTRPCRouter } = await import("../../trpc");

const router = createTRPCRouter({ organization: organizationRouter });
const createCaller = createCallerFactory(router);

function authedCaller() {
	return createCaller({
		session: {
			user: { id: TEST_USER_ID, email: "test@example.com" },
		} as never,
		auth: {} as never,
		headers: new Headers(),
	});
}

function unauthCaller() {
	return createCaller({
		session: null,
		auth: {} as never,
		headers: new Headers(),
	});
}

// ── Tests ───────────────────────────────────────────────────────────────

describe("organization.delete", () => {
	beforeEach(() => {
		mockMembership = undefined;
		mockOrganization = undefined;
		callOrder.length = 0;
		mockFindOrgMembership.mockClear();
		mockDeleteWhere.mockClear();
		mockSubscriptionsList.mockClear();
		mockSubscriptionsCancel.mockClear();
	});

	test("rejects unauthenticated users", async () => {
		const caller = unauthCaller();
		await expect(caller.organization.delete(TEST_ORG_ID)).rejects.toMatchObject(
			{ code: "UNAUTHORIZED" },
		);
		expect(mockFindOrgMembership).not.toHaveBeenCalled();
		expect(mockDeleteWhere).not.toHaveBeenCalled();
		expect(mockSubscriptionsList).not.toHaveBeenCalled();
	});

	test("rejects non-members", async () => {
		mockMembership = undefined;
		const caller = authedCaller();
		await expect(caller.organization.delete(TEST_ORG_ID)).rejects.toMatchObject(
			{
				code: "FORBIDDEN",
				message: "You are not a member of this organization",
			},
		);
		expect(mockFindOrgMembership).toHaveBeenCalledWith({
			userId: TEST_USER_ID,
			organizationId: TEST_ORG_ID,
		});
		expect(mockDeleteWhere).not.toHaveBeenCalled();
		expect(mockSubscriptionsList).not.toHaveBeenCalled();
	});

	test("rejects members with member role", async () => {
		mockMembership = { role: "member" };
		const caller = authedCaller();
		await expect(caller.organization.delete(TEST_ORG_ID)).rejects.toMatchObject(
			{ code: "FORBIDDEN", message: "Only owners can delete organizations" },
		);
		expect(mockFindOrgMembership).toHaveBeenCalledWith({
			userId: TEST_USER_ID,
			organizationId: TEST_ORG_ID,
		});
		expect(mockDeleteWhere).not.toHaveBeenCalled();
		expect(mockSubscriptionsList).not.toHaveBeenCalled();
	});

	test("rejects members with admin role", async () => {
		mockMembership = { role: "admin" };
		const caller = authedCaller();
		await expect(caller.organization.delete(TEST_ORG_ID)).rejects.toMatchObject(
			{ code: "FORBIDDEN", message: "Only owners can delete organizations" },
		);
		expect(mockFindOrgMembership).toHaveBeenCalledWith({
			userId: TEST_USER_ID,
			organizationId: TEST_ORG_ID,
		});
		expect(mockDeleteWhere).not.toHaveBeenCalled();
		expect(mockSubscriptionsList).not.toHaveBeenCalled();
	});

	test("allows owner to delete organization without Stripe", async () => {
		mockMembership = { role: "owner" };
		mockOrganization = { id: TEST_ORG_ID, stripeCustomerId: null };

		const caller = authedCaller();
		const result = await caller.organization.delete(TEST_ORG_ID);

		expect(result).toEqual({ success: true });
		expect(mockFindOrgMembership).toHaveBeenCalledWith({
			userId: TEST_USER_ID,
			organizationId: TEST_ORG_ID,
		});
		expect(mockDeleteWhere).toHaveBeenCalledTimes(1);
		expect(mockSubscriptionsList).not.toHaveBeenCalled();
	});

	test("cancels active Stripe subscriptions before deletion", async () => {
		mockMembership = { role: "owner" };
		mockOrganization = { id: TEST_ORG_ID, stripeCustomerId: "cus_test123" };
		mockSubscriptionsList.mockReturnValueOnce(
			asyncIterableOf([{ id: "sub_1" }, { id: "sub_2" }]),
		);

		const caller = authedCaller();
		const result = await caller.organization.delete(TEST_ORG_ID);

		expect(result).toEqual({ success: true });
		expect(mockSubscriptionsList).toHaveBeenCalledWith({
			customer: "cus_test123",
			status: "active",
		});
		expect(mockSubscriptionsCancel).toHaveBeenCalledTimes(2);
		expect(mockSubscriptionsCancel).toHaveBeenCalledWith("sub_1");
		expect(mockSubscriptionsCancel).toHaveBeenCalledWith("sub_2");
		expect(mockDeleteWhere).toHaveBeenCalledTimes(1);
		expect(callOrder).toEqual(["cancel", "cancel", "delete"]);
	});

	test("rejects invalid UUID input", async () => {
		const caller = authedCaller();
		await expect(
			caller.organization.delete("not-a-uuid"),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
		expect(mockFindOrgMembership).not.toHaveBeenCalled();
		expect(mockDeleteWhere).not.toHaveBeenCalled();
	});
});
