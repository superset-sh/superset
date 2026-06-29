import { beforeEach, describe, expect, it, mock } from "bun:test";
import { TRPCError, type TRPCRouterRecord } from "@trpc/server";

const verifyOrgMembershipMock = mock(async () => ({
	membership: { role: "member" },
}));

const findManyMock = mock(async () => [] as unknown[]);

mock.module("@superset/db/client", () => ({
	db: {
		query: {
			integrationConnections: { findMany: findManyMock },
			members: { findFirst: mock(async () => ({ role: "member" })) },
		},
	},
}));

mock.module("@superset/db/schema", () => ({
	integrationConnections: {
		organizationId: "integration_connections.organization_id",
	},
	members: {
		organizationId: "members.organizationId",
		userId: "members.userId",
	},
}));

mock.module("drizzle-orm", () => ({
	and: (...conditions: unknown[]) => ({ type: "and", conditions }),
	eq: (left: unknown, right: unknown) => ({ type: "eq", left, right }),
}));

// Sub-routers pull in heavy integration SDKs; stub them so importing the
// integration router only exercises `list`.
mock.module("./github", () => ({ githubRouter: {} }));
mock.module("./linear", () => ({ linearRouter: {} }));
mock.module("./slack", () => ({ slackRouter: {} }));
mock.module("./utils", () => ({
	verifyOrgMembership: verifyOrgMembershipMock,
}));

const { createCallerFactory, createTRPCRouter } = await import("../../trpc");
const { integrationRouter } = await import("./integration");

const createCaller = createCallerFactory(
	createTRPCRouter({
		integration: createTRPCRouter({ list: integrationRouter.list }),
	} satisfies TRPCRouterRecord),
);

const ACTOR_USER_ID = "11111111-1111-4111-8111-111111111111";
const ORGANIZATION_ID = "33333333-3333-4333-8333-333333333333";

function createContext() {
	return {
		session: {
			user: { id: ACTOR_USER_ID, email: "actor@example.com" },
			session: { activeOrganizationId: ORGANIZATION_ID },
		} as never,
		auth: {} as never,
		headers: new Headers(),
	};
}

describe("integration.list", () => {
	beforeEach(() => {
		findManyMock.mockReset();
		findManyMock.mockImplementation(async () => []);
		verifyOrgMembershipMock.mockReset();
		verifyOrgMembershipMock.mockImplementation(async () => ({
			membership: { role: "member" },
		}));
	});

	it("rejects non-members before reading connections", async () => {
		verifyOrgMembershipMock.mockImplementationOnce(async () => {
			throw new TRPCError({
				code: "FORBIDDEN",
				message: "Not a member of this organization",
			});
		});

		const caller = createCaller(createContext());

		await expect(
			caller.integration.list({ organizationId: ORGANIZATION_ID }),
		).rejects.toMatchObject({ code: "FORBIDDEN" });

		expect(findManyMock).not.toHaveBeenCalled();
	});

	it("scopes the query to the requested organization", async () => {
		const caller = createCaller(createContext());

		await caller.integration.list({ organizationId: ORGANIZATION_ID });

		expect(verifyOrgMembershipMock).toHaveBeenCalledWith(
			ACTOR_USER_ID,
			ORGANIZATION_ID,
		);
		const arg = findManyMock.mock.calls[0]?.[0] as {
			where: { type: string; left: unknown; right: unknown };
		};
		expect(arg.where).toEqual({
			type: "eq",
			left: "integration_connections.organization_id",
			right: ORGANIZATION_ID,
		});
	});

	it("never selects OAuth tokens (column masking)", async () => {
		const caller = createCaller(createContext());

		await caller.integration.list({ organizationId: ORGANIZATION_ID });

		const arg = findManyMock.mock.calls[0]?.[0] as {
			columns: Record<string, boolean>;
		};
		// Allow-list select: tokens must never be requested.
		expect(arg.columns.accessToken).toBeUndefined();
		expect(arg.columns.refreshToken).toBeUndefined();
		expect(arg.columns.provider).toBe(true);
	});

	it("returns the rows the database yields", async () => {
		findManyMock.mockImplementationOnce(async () => [
			{ id: "a", provider: "linear", externalOrgName: "Acme" },
		]);
		const caller = createCaller(createContext());

		const result = await caller.integration.list({
			organizationId: ORGANIZATION_ID,
		});

		expect(result).toEqual([
			{ id: "a", provider: "linear", externalOrgName: "Acme" },
		]);
	});
});
