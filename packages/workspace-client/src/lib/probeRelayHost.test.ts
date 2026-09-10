import { afterEach, expect, test } from "bun:test";
import { probeRelayHost } from "./probeRelayHost";

const realFetch = globalThis.fetch;
afterEach(() => {
	globalThis.fetch = realFetch;
});

test("returns null (no probe) for non-/hosts URLs without fetching", async () => {
	globalThis.fetch = (() => {
		throw new Error("should not fetch");
	}) as unknown as typeof fetch;
	expect(await probeRelayHost("wss://relay.superset.sh/ws")).toBeNull();
});

test("probes /_whoowns keeping the token and reports the status", async () => {
	let calledUrl = "";
	globalThis.fetch = (async (input: string | URL | Request) => {
		calledUrl = String(input);
		return new Response(JSON.stringify({ ok: true }), { status: 200 });
	}) as unknown as typeof fetch;

	const probe = await probeRelayHost(
		"wss://relay.superset.sh/hosts/org:host/terminal/t1?token=abc",
	);

	expect(probe).toEqual({ status: 200 });
	expect(calledUrl).toContain("/hosts/org:host/_whoowns");
	expect(calledUrl).toContain("token=abc"); // auth query preserved
	expect(calledUrl.startsWith("https://")).toBe(true); // wss -> https
});

test("surfaces a 503 as the host-offline signal", async () => {
	globalThis.fetch = (async () =>
		new Response(JSON.stringify({ error: "Host not connected" }), {
			status: 503,
		})) as unknown as typeof fetch;
	expect(
		await probeRelayHost("wss://relay.superset.sh/hosts/h/events?token=x"),
	).toEqual({ status: 503 });
});

test("returns null when the relay is unreachable", async () => {
	globalThis.fetch = (async () => {
		throw new Error("network down");
	}) as unknown as typeof fetch;
	expect(
		await probeRelayHost("wss://relay.superset.sh/hosts/h/terminal/t?token=x"),
	).toBeNull();
});
