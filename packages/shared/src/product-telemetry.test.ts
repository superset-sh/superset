import { afterEach, describe, expect, test } from "bun:test";
import {
	captureTelemetryEvent,
	readTokenIdentity,
	resolveTelemetryKey,
} from "./product-telemetry";

function jwt(claims: Record<string, unknown>): string {
	return `h.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.s`;
}

const realFetch = globalThis.fetch;
afterEach(() => {
	globalThis.fetch = realFetch;
	delete process.env.SUPERSET_POSTHOG_KEY;
});

describe("resolveTelemetryKey", () => {
	test("reports to production only for the production API", () => {
		expect(resolveTelemetryKey("https://api.superset.sh/")).toStartWith("phc_");
		expect(resolveTelemetryKey("http://localhost:3001")).toBeNull();
	});

	test("an explicit key wins for any API", () => {
		process.env.SUPERSET_POSTHOG_KEY = "phc_dev";
		expect(resolveTelemetryKey("http://localhost:3001")).toBe("phc_dev");
	});
});

describe("readTokenIdentity", () => {
	test("names the user and organization of a session token", () => {
		expect(readTokenIdentity(jwt({ sub: "u1", organizationId: "o1" }))).toEqual(
			{ userId: "u1", organizationId: "o1" },
		);
	});

	test("names no one for an API key or a malformed token", () => {
		expect(readTokenIdentity("sk_live_abc")).toBeNull();
		expect(readTokenIdentity("a.not-json.b")).toBeNull();
		expect(readTokenIdentity(jwt({ organizationId: "o1" }))).toBeNull();
	});
});

describe("captureTelemetryEvent", () => {
	test("groups an event by its organization", async () => {
		let body: { distinct_id?: string; properties?: Record<string, unknown> } =
			{};
		globalThis.fetch = (async (_url: string, init: RequestInit) => {
			body = JSON.parse(String(init.body));
			return new Response(null);
		}) as unknown as typeof fetch;

		await captureTelemetryEvent({
			key: "phc_test",
			event: "cli_command_invoked",
			identity: { distinctId: "host-1", organizationId: "o1" },
			properties: { command: "status" },
		});

		expect(body.distinct_id).toBe("host-1");
		expect(body.properties).toMatchObject({
			command: "status",
			$groups: { organization: "o1" },
		});
	});

	test("never throws when delivery fails", async () => {
		globalThis.fetch = (async () => {
			throw new Error("offline");
		}) as unknown as typeof fetch;
		await captureTelemetryEvent({
			key: "phc_test",
			event: "e",
			identity: { distinctId: "u1", organizationId: null },
			properties: {},
		});
	});
});
