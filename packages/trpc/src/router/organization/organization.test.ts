import { beforeEach, describe, expect, mock, test } from "bun:test";

const TEST_USER_ID = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
const TEST_ORG_ID = "b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22";

// ── Mock state ──────────────────────────────────────────────────────────
let mockMembership: { role: string } | undefined;
let mockOrganization: { id: string; stripeCustomerId: string | null } | undefined;
const mockDeleteWhere = mock(() => Promise.resolve());
const mockSubscriptionsList = mock(
	() =>
		Promise.resolve({ data: [] }) as Promise<{
			data: { id: string }[];
		}>,
);
const mockSubscriptionsCancel = mock(() => Promise.resolve());

// ── Mocks (must be declared before dynamic import) ──────────────────────

mock.module("@superset/db/client", () => ({
	db: {
		delete: () => ({ where: mockDeleteWhere }),
		query: {
			organizations: {
				findFirst: () => Promise.resolve(mockOrganization),
			},
		},
	},
}));

mock.module("@superset/db/utils", () => ({
	findOrgMembership: () => Promise.resolve(mockMembership),
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
	members: { organizationId: "members.organizationId", userId: "members.userId" },
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
		mockDeleteWhere.mockClear();
		mockSubscriptionsList.mockClear();
		mockSubscriptionsCancel.mockClear();
	});

	test("rejects unauthenticated users", async () => {
		const caller = unauthCaller();
		await expect(caller.organization.delete(TEST_ORG_ID)).rejects.toMatchObject(
			{ code: "UNAUTHORIZED" },
		);
	});

	test("rejects non-members", async () => {
		mockMembership = undefined;
		const caller = authedCaller();
		await expect(caller.organization.delete(TEST_ORG_ID)).rejects.toMatchObject(
			{ code: "FORBIDDEN", message: "You are not a member of this organization" },
		);
	});

	test("rejects members with member role", async () => {
		mockMembership = { role: "member" };
		const caller = authedCaller();
		await expect(caller.organization.delete(TEST_ORG_ID)).rejects.toMatchObject(
			{ code: "FORBIDDEN", message: "Only owners can delete organizations" },
		);
	});

	test("rejects members with admin role", async () => {
		mockMembership = { role: "admin" };
		const caller = authedCaller();
		await expect(caller.organization.delete(TEST_ORG_ID)).rejects.toMatchObject(
			{ code: "FORBIDDEN", message: "Only owners can delete organizations" },
		);
	});

	test("allows owner to delete organization without Stripe", async () => {
		mockMembership = { role: "owner" };
		mockOrganization = { id: TEST_ORG_ID, stripeCustomerId: null };

		const caller = authedCaller();
		const result = await caller.organization.delete(TEST_ORG_ID);

		expect(result).toEqual({ success: true });
		expect(mockDeleteWhere).toHaveBeenCalledTimes(1);
		expect(mockSubscriptionsList).not.toHaveBeenCalled();
	});

	test("cancels active Stripe subscriptions before deletion", async () => {
		mockMembership = { role: "owner" };
		mockOrganization = { id: TEST_ORG_ID, stripeCustomerId: "cus_test123" };
		mockSubscriptionsList.mockResolvedValueOnce({
			data: [{ id: "sub_1" }, { id: "sub_2" }],
		});

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
	});

	test("rejects invalid UUID input", async () => {
		const caller = authedCaller();
		await expect(caller.organization.delete("not-a-uuid")).rejects.toMatchObject(
			{ code: "BAD_REQUEST" },
		);
	});
});
