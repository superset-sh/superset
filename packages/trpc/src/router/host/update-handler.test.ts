import { describe, expect, it, mock } from "bun:test";
import { RelayDispatchError } from "../automation/relay-client";
import {
	executeHostUpdate,
	type HostUpdateContext,
	type HostUpdateDependencies,
	type HostUpdateResult,
	hostUpdateInputSchema,
} from "./update-handler";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const ORGANIZATION_ID = "22222222-2222-4222-8222-222222222222";
const MACHINE_ID = "host-machine-id";
const TARGET_VERSION = "1.14.2-rc.1";

const context: HostUpdateContext = {
	userId: USER_ID,
	email: "owner@example.com",
	organizationIds: [ORGANIZATION_ID],
};

const input = {
	organizationId: ORGANIZATION_ID,
	machineId: MACHINE_ID,
	targetVersion: TARGET_VERSION,
};

const result: HostUpdateResult = {
	outcome: "dispatched",
	previousVersion: "1.14.1",
	newVersion: null,
	supervisorPid: 4321,
};

function createDependencies(
	overrides: Partial<HostUpdateDependencies> = {},
): HostUpdateDependencies {
	return {
		relayUrl: "https://relay.example.com",
		findHostRole: mock(async () => "owner" as const),
		mintJwt: mock(async () => "signed-user-jwt"),
		dispatch: mock(async () => result),
		...overrides,
	};
}

describe("hostUpdateInputSchema", () => {
	it.each([
		"1.14.2",
		"1.14.2-1",
		"1.14.2-rc.1",
	])("accepts updater version %s", (targetVersion) => {
		expect(
			hostUpdateInputSchema.safeParse({ ...input, targetVersion }).success,
		).toBe(true);
	});

	it.each([
		"v1.14.2",
		"1.14",
		"01.14.2",
		"1.014.2",
		"1.14.02",
		"1.14.2-01",
		"1.14.2-rc..1",
		"1.14.2+build.1",
		"1.14.2-rc-1",
		" 1.14.2",
		`1.14.2-${"a".repeat(64)}`,
	])("rejects updater-incompatible version %s", (targetVersion) => {
		expect(
			hostUpdateInputSchema.safeParse({ ...input, targetVersion }).success,
		).toBe(false);
	});
});

describe("executeHostUpdate", () => {
	it("requires organization membership before querying host access", async () => {
		const dependencies = createDependencies();

		await expect(
			executeHostUpdate(
				{ ...context, organizationIds: [] },
				input,
				dependencies,
			),
		).rejects.toMatchObject({
			code: "FORBIDDEN",
			message: "Not a member of this organization",
		});
		expect(dependencies.findHostRole).not.toHaveBeenCalled();
		expect(dependencies.mintJwt).not.toHaveBeenCalled();
		expect(dependencies.dispatch).not.toHaveBeenCalled();
	});

	it.each([
		null,
		"member" as const,
	])("requires the v2 host owner role when role is %s", async (role) => {
		const dependencies = createDependencies({
			findHostRole: mock(async () => role),
		});

		await expect(
			executeHostUpdate(context, input, dependencies),
		).rejects.toMatchObject({
			code: "FORBIDDEN",
			message: "Only the host owner can update it",
		});
		expect(dependencies.mintJwt).not.toHaveBeenCalled();
		expect(dependencies.dispatch).not.toHaveBeenCalled();
	});

	it("mints a scoped JWT and relays the exact target version", async () => {
		const dependencies = createDependencies();

		await expect(
			executeHostUpdate(context, input, dependencies),
		).resolves.toEqual(result);
		expect(dependencies.findHostRole).toHaveBeenCalledWith({
			organizationId: ORGANIZATION_ID,
			userId: USER_ID,
			machineId: MACHINE_ID,
		});
		expect(dependencies.mintJwt).toHaveBeenCalledWith({
			userId: USER_ID,
			email: "owner@example.com",
			organizationIds: [ORGANIZATION_ID],
			scope: "host-update",
			runId: `host-update:${ORGANIZATION_ID}:${MACHINE_ID}`,
			ttlSeconds: 300,
		});
		expect(dependencies.dispatch).toHaveBeenCalledWith({
			relayUrl: "https://relay.example.com",
			hostId: `${ORGANIZATION_ID}:${MACHINE_ID}`,
			jwt: "signed-user-jwt",
			targetVersion: TARGET_VERSION,
		});
	});

	it("maps relay dispatch failures to BAD_GATEWAY", async () => {
		const dependencies = createDependencies({
			dispatch: mock(async () => {
				throw new RelayDispatchError(
					"relay 502: unavailable",
					502,
					"unavailable",
				);
			}),
		});

		await expect(
			executeHostUpdate(context, input, dependencies),
		).rejects.toMatchObject({
			code: "BAD_GATEWAY",
			message: "Failed to dispatch host update: relay 502: unavailable",
		});
	});
});
