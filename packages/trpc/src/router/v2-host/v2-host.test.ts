import { beforeEach, describe, expect, it, mock } from "bun:test";
import * as realDbSchema from "@superset/db/schema";
import { TRPCError, type TRPCRouterRecord } from "@trpc/server";
import * as realDrizzle from "drizzle-orm";

let selectResults: unknown[][] = [];
let hostDeleteResults: unknown[] = [];

const selectForMock = mock(async () => selectResults.shift() ?? []);
const selectLimitMock = mock(() => ({ for: selectForMock }));
const selectWhereMock = mock(() => ({
	for: selectForMock,
	limit: selectLimitMock,
}));
const selectFromMock = mock(() => ({ where: selectWhereMock }));
const selectMock = mock(() => ({ from: selectFromMock }));

const deleteReturningMock = mock(async () => hostDeleteResults);
const deleteWhereMock = mock(() => ({ returning: deleteReturningMock }));
const deleteMock = mock(() => ({ where: deleteWhereMock }));

const updateWhereMock = mock(async () => undefined);
const updateSetMock = mock(() => ({ where: updateWhereMock }));
const updateMock = mock(() => ({ set: updateSetMock }));
const executeMock = mock(async () => ({ rows: [{ txid: "456" }] }));

const tx = {
	delete: deleteMock,
	execute: executeMock,
	select: selectMock,
	update: updateMock,
};

const transactionMock = mock(async (callback: (tx: unknown) => unknown) =>
	callback(tx),
);

const membersFindFirstMock = mock(async () => null);
const membersFindManyMock = mock(async () => []);
const verifyOrgMembershipMock = mock(async () => ({
	membership: { role: "member" },
}));

mock.module("@superset/db/client", () => ({
	db: {
		query: {
			members: {
				findFirst: membersFindFirstMock,
				findMany: membersFindManyMock,
			},
			v2Hosts: { findFirst: mock(async () => null) },
			v2UsersHosts: { findFirst: mock(async () => null) },
		},
	},
	dbWs: { transaction: transactionMock },
}));

mock.module("@superset/db/schema", () => ({ ...realDbSchema }));

mock.module("../integration/utils", () => ({
	verifyOrgAdmin: mock(async () => ({ membership: { role: "owner" } })),
	verifyOrgMembership: verifyOrgMembershipMock,
	verifyOrgMembershipWithSubscription: mock(async () => ({
		membership: { role: "member" },
		subscription: null,
	})),
	verifyOrgOwner: mock(async () => ({ membership: { role: "owner" } })),
}));

mock.module("drizzle-orm", () => ({
	...realDrizzle,
	and: (...conditions: unknown[]) => ({ type: "and", conditions }),
	eq: (left: unknown, right: unknown) => ({ type: "eq", left, right }),
	inArray: (left: unknown, right: unknown[]) => ({
		left,
		right,
		type: "inArray",
	}),
	ne: (left: unknown, right: unknown) => ({ type: "ne", left, right }),
	or: (...conditions: unknown[]) => ({ type: "or", conditions }),
}));

const { createCallerFactory, createTRPCRouter } = await import("../../trpc");
const { v2HostRouter } = await import("./v2-host");

const createCaller = createCallerFactory(
	createTRPCRouter({
		v2Host: v2HostRouter,
	} satisfies TRPCRouterRecord),
);

const USER_ID = "11111111-1111-4111-8111-111111111111";
const ORGANIZATION_ID = "22222222-2222-4222-8222-222222222222";
const OTHER_ORGANIZATION_ID = "33333333-3333-4333-8333-333333333333";
const WORKSPACE_ID = "44444444-4444-4444-8444-444444444444";
const HOST_ID = "host-machine-id";

function createContext(activeOrganizationId: string | null = ORGANIZATION_ID) {
	return {
		session: {
			user: { id: USER_ID, email: "owner@example.com" },
			session: { activeOrganizationId },
		} as never,
		auth: {} as never,
		headers: new Headers(),
	};
}

function createUnauthenticatedContext() {
	return {
		session: null as never,
		auth: {} as never,
		headers: new Headers(),
	};
}

beforeEach(() => {
	selectResults = [];
	hostDeleteResults = [];

	selectForMock.mockClear();
	selectLimitMock.mockClear();
	selectWhereMock.mockClear();
	selectFromMock.mockClear();
	selectMock.mockClear();
	deleteReturningMock.mockClear();
	deleteWhereMock.mockClear();
	deleteMock.mockClear();
	updateWhereMock.mockClear();
	updateSetMock.mockClear();
	updateMock.mockClear();
	executeMock.mockClear();
	transactionMock.mockClear();
	membersFindFirstMock.mockClear();
	membersFindManyMock.mockClear();
	verifyOrgMembershipMock.mockReset();
	verifyOrgMembershipMock.mockImplementation(async () => ({
		membership: { role: "member" },
	}));
});

describe("v2Host.delete", () => {
	it("rejects unauthenticated callers before opening a transaction", async () => {
		const caller = createCaller(createUnauthenticatedContext());

		await expect(
			caller.v2Host.delete({ hostId: HOST_ID }),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });
		expect(transactionMock).not.toHaveBeenCalled();
	});

	it("rejects callers without an active organization", async () => {
		const caller = createCaller(createContext(null));

		await expect(
			caller.v2Host.delete({ hostId: HOST_ID }),
		).rejects.toMatchObject({
			code: "FORBIDDEN",
			message: "No active organization selected",
		});
		expect(transactionMock).not.toHaveBeenCalled();
	});

	it("rejects a stale session whose user is no longer an organization member", async () => {
		verifyOrgMembershipMock.mockRejectedValueOnce(
			new TRPCError({
				code: "FORBIDDEN",
				message: "Not a member of this organization",
			}),
		);
		const caller = createCaller(createContext());

		await expect(
			caller.v2Host.delete({ hostId: HOST_ID }),
		).rejects.toMatchObject({
			code: "FORBIDDEN",
			message: "Not a member of this organization",
		});
		expect(verifyOrgMembershipMock).toHaveBeenCalledWith(
			USER_ID,
			ORGANIZATION_ID,
		);
		expect(transactionMock).not.toHaveBeenCalled();
	});

	it("does not expose or delete a host from another organization", async () => {
		selectResults.push([]);
		const caller = createCaller(createContext(OTHER_ORGANIZATION_ID));

		await expect(
			caller.v2Host.delete({ hostId: HOST_ID }),
		).rejects.toMatchObject({
			code: "NOT_FOUND",
			message: "Host not found in this organization",
		});

		expect(selectWhereMock).toHaveBeenCalledTimes(1);
		expect(selectWhereMock.mock.calls[0]?.[0]).toMatchObject({
			conditions: [
				{ right: OTHER_ORGANIZATION_ID, type: "eq" },
				{ right: HOST_ID, type: "eq" },
			],
			type: "and",
		});
		expect(deleteMock).not.toHaveBeenCalled();
		expect(updateMock).not.toHaveBeenCalled();
		expect(executeMock).not.toHaveBeenCalled();
	});

	it("rejects a host member who is not an owner", async () => {
		selectResults.push([{ machineId: HOST_ID }], [{ role: "member" }]);
		const caller = createCaller(createContext());

		await expect(
			caller.v2Host.delete({ hostId: HOST_ID }),
		).rejects.toMatchObject({
			code: "FORBIDDEN",
			message: "Only host owners can delete this host",
		});

		expect(selectForMock).toHaveBeenNthCalledWith(1, "update");
		expect(selectForMock).toHaveBeenNthCalledWith(2, "update");
		expect(deleteMock).not.toHaveBeenCalled();
		expect(updateMock).not.toHaveBeenCalled();
		expect(executeMock).not.toHaveBeenCalled();
	});

	it("pauses direct and workspace-only automations before deleting the host", async () => {
		selectResults.push(
			[{ machineId: HOST_ID }],
			[{ role: "owner" }],
			[{ id: WORKSPACE_ID }],
		);
		hostDeleteResults = [{ machineId: HOST_ID }];
		const caller = createCaller(createContext());

		await expect(caller.v2Host.delete({ hostId: HOST_ID })).resolves.toEqual({
			success: true,
			txid: 456,
		});

		expect(transactionMock).toHaveBeenCalledTimes(1);
		expect(selectForMock).toHaveBeenNthCalledWith(1, "update");
		expect(selectForMock).toHaveBeenNthCalledWith(2, "update");
		expect(selectForMock).toHaveBeenNthCalledWith(3, "update");
		expect(selectFromMock).toHaveBeenNthCalledWith(
			3,
			realDbSchema.v2Workspaces,
		);
		expect(deleteMock).toHaveBeenNthCalledWith(1, realDbSchema.v2Workspaces);
		expect(updateMock).toHaveBeenCalledWith(realDbSchema.automations);
		expect(updateSetMock).toHaveBeenCalledWith({ enabled: false });
		expect(updateSetMock.mock.calls[0]?.[0]).not.toHaveProperty("targetHostId");
		expect(updateSetMock.mock.calls[0]?.[0]).not.toHaveProperty(
			"v2WorkspaceId",
		);
		expect(deleteMock).toHaveBeenNthCalledWith(2, realDbSchema.v2Hosts);
		expect(deleteReturningMock).toHaveBeenCalledWith({
			machineId: realDbSchema.v2Hosts.machineId,
		});
		expect(executeMock).toHaveBeenCalledTimes(1);

		expect(deleteWhereMock.mock.calls[0]?.[0]).toMatchObject({
			conditions: [
				{ right: ORGANIZATION_ID, type: "eq" },
				{ right: HOST_ID, type: "eq" },
			],
			type: "and",
		});
		expect(updateWhereMock.mock.calls[0]?.[0]).toMatchObject({
			conditions: [
				{ right: ORGANIZATION_ID, type: "eq" },
				{
					conditions: [
						{ right: HOST_ID, type: "eq" },
						{ right: [WORKSPACE_ID], type: "inArray" },
					],
					type: "or",
				},
			],
			type: "and",
		});
		expect(deleteWhereMock.mock.calls[1]?.[0]).toMatchObject({
			conditions: [
				{ right: ORGANIZATION_ID, type: "eq" },
				{ right: HOST_ID, type: "eq" },
			],
			type: "and",
		});
	});
});
