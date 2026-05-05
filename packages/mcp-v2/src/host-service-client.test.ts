import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
	HostServiceCallError,
	hostServiceMutation,
} from "./host-service-client";

const ORIGINAL_FETCH = globalThis.fetch;

const baseOptions = {
	relayUrl: "https://relay.test",
	organizationId: "00000000-0000-4000-8000-000000000001",
	hostId: "host-abc",
	jwt: "jwt-token",
};

function mockFetchOnce(status: number, body: string): void {
	globalThis.fetch = (async () =>
		new Response(body, { status })) as unknown as typeof fetch;
}

describe("hostServiceMutation error mapping", () => {
	beforeEach(() => {
		globalThis.fetch = ORIGINAL_FETCH;
	});

	afterEach(() => {
		globalThis.fetch = ORIGINAL_FETCH;
	});

	it("maps 403 to a no-access message", async () => {
		mockFetchOnce(403, JSON.stringify({ error: "Forbidden" }));
		try {
			await hostServiceMutation(baseOptions, "workspaces.create", {});
			throw new Error("expected to throw");
		} catch (err) {
			expect(err).toBeInstanceOf(HostServiceCallError);
			const e = err as HostServiceCallError;
			expect(e.status).toBe(403);
			expect(e.message).toContain("don't have access");
			expect(e.message).not.toMatch(/paid plan/i);
		}
	});

	it("maps 402 to a paid-plan-required message regardless of relay body", async () => {
		// Use an opaque body to ensure the message comes from the 402 mapping itself,
		// not from echoing whatever the relay happened to include.
		mockFetchOnce(402, "");
		try {
			await hostServiceMutation(baseOptions, "workspaces.create", {});
			throw new Error("expected to throw");
		} catch (err) {
			expect(err).toBeInstanceOf(HostServiceCallError);
			const e = err as HostServiceCallError;
			expect(e.status).toBe(402);
			expect(e.message).toMatch(/paid plan/i);
			expect(e.message).not.toMatch(/don't have access/i);
		}
	});
});
