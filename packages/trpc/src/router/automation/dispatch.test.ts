import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import type { SelectAutomation } from "@superset/db/schema";

// ── Mocks ──────────────────────────────────────────────────────────────────
//
// dispatchAutomation talks to the cloud DB (dbWs), mints a JWT, and pushes
// work to the host through the relay. For this reproduction we only need the
// DB read that resolves the target host plus the insert that records a
// skipped run — everything past the `host.isOnline` gate must NOT run.

let resolvedHost: Record<string, unknown> | null = null;
const recordedSkips: Array<Record<string, unknown>> = [];

const limitMock = mock(async () => (resolvedHost ? [resolvedHost] : []));
const orderByLimitMock = mock(async () => (resolvedHost ? [resolvedHost] : []));
const whereMock = mock(() => ({
	limit: limitMock,
	orderBy: () => ({ limit: orderByLimitMock }),
}));
const innerJoinMock = mock(() => ({ where: whereMock }));
const fromMock = mock(() => ({ where: whereMock, innerJoin: innerJoinMock }));
const selectMock = mock(() => ({ from: fromMock }));

const returningMock = mock(async () => [{ id: "run-skipped-1" }]);
const onConflictMock = mock(() => ({ returning: returningMock }));
const valuesMock = mock((row: Record<string, unknown>) => {
	recordedSkips.push(row);
	return { onConflictDoNothing: onConflictMock, returning: returningMock };
});
const insertMock = mock(() => ({ values: valuesMock }));

mock.module("@superset/db/client", () => ({
	dbWs: { select: selectMock, insert: insertMock },
}));

// mintUserJwt and the relay calls live *past* the gate. We spy on them so the
// test can assert they're never reached for an offline host.
const mintUserJwtMock = mock(async () => "jwt-token");
mock.module("@superset/auth/server", () => ({ mintUserJwt: mintUserJwtMock }));

const relayMutationMock = mock(async () => ({}));
mock.module("./relay-client", () => ({
	relayMutation: relayMutationMock,
	RelayDispatchError: class RelayDispatchError extends Error {},
}));

const { dispatchAutomation } = await import("./dispatch");

function makeAutomation(
	overrides: Partial<SelectAutomation> = {},
): SelectAutomation {
	return {
		id: "auto-1",
		organizationId: "org-1",
		ownerUserId: "user-1",
		name: "Nightly local automation",
		agent: "claude",
		prompt: "do the thing",
		targetHostId: "this-device",
		v2ProjectId: "proj-1",
		v2WorkspaceId: null,
		...overrides,
	} as SelectAutomation;
}

beforeEach(() => {
	resolvedHost = null;
	recordedSkips.length = 0;
	relayMutationMock.mockClear();
	mintUserJwtMock.mockClear();
});

describe("dispatchAutomation — Free-tier local automations (issue #5331)", () => {
	test("an offline local-device host is skipped instead of dispatched locally", async () => {
		// The desktop app is running the host-service locally, but on the Free
		// tier `expose_host_service_via_relay` is off, so the host never opens
		// the relay tunnel and v2Hosts.isOnline stays false — even though the
		// automation targets *this very device*.
		resolvedHost = {
			organizationId: "org-1",
			machineId: "this-device",
			name: "My MacBook",
			isOnline: false,
		};

		const outcome = await dispatchAutomation({
			automation: makeAutomation(),
			scheduledFor: new Date("2026-06-23T00:00:00Z"),
			relayUrl: "https://relay.superset.sh",
		});

		// Reported behavior: the run is recorded as skipped_offline …
		expect(outcome.status).toBe("skipped_offline");
		expect(outcome).toMatchObject({ error: "target host offline" });
		expect(recordedSkips[0]).toMatchObject({ status: "skipped_offline" });

		// … and the bug: there is NO local/loopback dispatch path. Even for a
		// host on this machine, dispatch never tries to reach it — it gives up
		// the moment the relay-backed isOnline flag is false.
		expect(relayMutationMock).not.toHaveBeenCalled();
		expect(mintUserJwtMock).not.toHaveBeenCalled();
	});
});

afterAll(() => {
	mock.restore();
});
