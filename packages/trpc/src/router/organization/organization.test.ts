import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import type { TRPCRouterRecord } from "@trpc/server";

// Reproduction for #5048: the upgrade button does not open the upgrade page
// when a user creates a 2nd organization from the app and tries to upgrade it.
//
// Root cause: better-auth's `afterCreateOrganization` hook (used for the very
// first org, created during user sign-up) creates a Stripe customer and stores
// `organizations.stripe_customer_id`. But a 2nd org created from the app goes
// through this custom `organization.create` tRPC procedure, which inserts the
// org + owner member but NEVER creates a Stripe customer. The org is left with
// `stripeCustomerId = null`, so when the user later tries to upgrade it the
// Stripe checkout customer can't be resolved and the checkout/upgrade page
// fails to open.
//
// This test asserts that creating an organization provisions a Stripe customer
// and persists its id — mirroring the better-auth hook.

const ORG_ID = "22222222-2222-4222-8222-222222222222";
const USER_ID = "11111111-1111-4111-8111-111111111111";
const STRIPE_CUSTOMER_ID = "cus_test_5048";

const stripeCustomerCreate = mock(async () => ({ id: STRIPE_CUSTOMER_ID }));
const stripeCustomerUpdate = mock(async () => ({ id: STRIPE_CUSTOMER_ID }));

mock.module("@superset/auth/stripe", () => ({
	stripeClient: {
		customers: {
			create: stripeCustomerCreate,
			update: stripeCustomerUpdate,
		},
	},
}));

// --- db mock ----------------------------------------------------------------
let orgFindFirstResults: unknown[] = [];
let orgInsertReturning: unknown[][] = [];
const insertedRows: Array<{ table: unknown; values: unknown }> = [];
const updateSetCalls: unknown[] = [];

const organizationsFindFirst = mock(
	async () => orgFindFirstResults.shift() ?? null,
);

const dbInsert = mock((table: unknown) => ({
	values: (values: unknown) => {
		insertedRows.push({ table, values });
		const promise: Promise<undefined> & { returning?: () => Promise<unknown> } =
			Promise.resolve(undefined);
		promise.returning = async () => orgInsertReturning.shift() ?? [];
		return promise;
	},
}));

const dbUpdateWhere = mock(async () => undefined);
const dbUpdateSet = mock((values: unknown) => {
	updateSetCalls.push(values);
	return { where: dbUpdateWhere };
});
const dbUpdate = mock(() => ({ set: dbUpdateSet }));

mock.module("@superset/db/client", () => ({
	db: {
		query: {
			organizations: { findFirst: organizationsFindFirst },
			members: { findFirst: mock(async () => null) },
		},
		insert: dbInsert,
		update: dbUpdate,
	},
}));

mock.module("@superset/db/schema", () => ({
	members: { id: "members.id", organizationId: "members.organization_id" },
	organizations: {
		id: "organizations.id",
		name: "organizations.name",
		slug: "organizations.slug",
		allowedDomains: "organizations.allowed_domains",
		stripeCustomerId: "organizations.stripe_customer_id",
	},
}));

mock.module("@superset/db/schema/auth", () => ({
	sessions: {
		userId: "sessions.user_id",
		activeOrganizationId: "sessions.active_organization_id",
	},
	invitations: { id: "invitations.id" },
	verifications: {
		value: "verifications.value",
		expiresAt: "verifications.expires_at",
		identifier: "verifications.identifier",
	},
}));

const seedDefaultStatusesMock = mock(async () => undefined);
mock.module("@superset/db/seed-default-statuses", () => ({
	seedDefaultStatuses: seedDefaultStatusesMock,
}));

mock.module("@superset/db/utils", () => ({
	findOrgMembership: mock(async () => null),
}));

mock.module("@superset/shared/auth", () => ({
	canRemoveMember: mock(() => false),
}));

mock.module("@superset/shared/constants", () => ({
	ORGANIZATION_HEADER: "x-superset-organization-id",
	COMPANY: {},
}));

mock.module("../../lib/upload", () => ({
	generateImagePathname: mock(() => "path"),
	uploadImage: mock(async () => "https://blob.example/logo.png"),
}));

mock.module("../integration/utils", () => ({
	verifyOrgAdmin: mock(async () => undefined),
}));

mock.module("./members", () => ({
	organizationMembersRouter: {},
}));

// NB: we deliberately do NOT mock drizzle-orm here. The db client is fully
// mocked, so the real `and`/`eq`/`ne`/`sql` builders just produce throwaway
// objects the mocks ignore. Mocking drizzle-orm partially would also leak a
// `ne`-less module across the shared test registry and break sibling suites.

const { createCallerFactory, createTRPCRouter } = await import("../../trpc");
const { organizationRouter } = await import("./organization");

const createCaller = createCallerFactory(
	createTRPCRouter({
		organization: organizationRouter,
	} satisfies TRPCRouterRecord),
);

function authedContext() {
	return {
		session: {
			user: { id: USER_ID, email: "founder@acme.com", name: "Founder" },
			session: { activeOrganizationId: null },
		} as never,
		auth: {} as never,
		headers: new Headers(),
	};
}

let originalNodeEnv: string | undefined;

beforeEach(() => {
	orgFindFirstResults = [];
	orgInsertReturning = [];
	insertedRows.length = 0;
	updateSetCalls.length = 0;

	stripeCustomerCreate.mockClear();
	stripeCustomerUpdate.mockClear();
	organizationsFindFirst.mockClear();
	dbInsert.mockClear();
	dbUpdate.mockClear();
	dbUpdateSet.mockClear();
	dbUpdateWhere.mockClear();
	seedDefaultStatusesMock.mockClear();

	// The better-auth hook only provisions a Stripe customer outside of
	// development; exercise the production path here.
	originalNodeEnv = process.env.NODE_ENV;
	process.env.NODE_ENV = "production";
});

afterEach(() => {
	process.env.NODE_ENV = originalNodeEnv;
});

describe("organization.create — Stripe customer provisioning (#5048)", () => {
	it("creates a Stripe customer and persists stripeCustomerId for the new org", async () => {
		// No domain-managed org blocks creation.
		orgFindFirstResults.push(null);
		// The inserted organization row returned by `.returning()`.
		orgInsertReturning.push([{ id: ORG_ID, name: "Acme", slug: "acme" }]);

		const caller = createCaller(authedContext());
		const result = await caller.organization.create({
			name: "Acme",
			slug: "acme",
		});

		expect(result).toMatchObject({ id: ORG_ID });

		// The owner member must still be inserted (unchanged behavior).
		const memberInsert = insertedRows.find(
			(row) =>
				typeof row.values === "object" &&
				row.values !== null &&
				(row.values as { role?: string }).role === "owner",
		);
		expect(memberInsert).toBeDefined();

		// Regression: a Stripe customer must be created for the org, mirroring
		// better-auth's afterCreateOrganization hook. Without it, upgrading this
		// org later fails to open the checkout page.
		expect(stripeCustomerCreate).toHaveBeenCalledTimes(1);
		expect(stripeCustomerCreate).toHaveBeenCalledWith(
			expect.objectContaining({
				name: "Acme",
				email: "founder@acme.com",
				metadata: expect.objectContaining({
					organizationId: ORG_ID,
					organizationSlug: "acme",
				}),
			}),
		);

		// ...and its id must be persisted on the organization row.
		expect(dbUpdateSet).toHaveBeenCalledWith(
			expect.objectContaining({ stripeCustomerId: STRIPE_CUSTOMER_ID }),
		);
	});
});
