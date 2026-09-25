import { afterEach, beforeEach, expect, mock, test } from "bun:test";
import {
	sandboxHostSecret,
	signSandboxGateTicket,
} from "@superset/shared/sandbox-gate";
import worker from "./index";

const SECRET = "a-shared-secret-that-is-at-least-thirty-two-bytes";
const WORKSPACE = "3f1c2a90-2b1e-4c2e-9a1e-0c7e3f9d1a11";
const PORT = 4879;
const TARGET = "https://sb-abc123.vercel.run";
const DOMAIN = "sandbox.supersetusercontent.com";
const GATE_HOST = `${WORKSPACE}-${PORT}.${DOMAIN}`;

const env = { SANDBOX_GATE_SECRET: SECRET, SANDBOX_GATE_DOMAIN: DOMAIN };

const realFetch = globalThis.fetch;
let calls: { url: string; authorization: string | null }[] = [];

beforeEach(() => {
	calls = [];
	globalThis.fetch = mock(
		async (input: RequestInfo | URL, init?: RequestInit) => {
			const url = input instanceof URL ? input.toString() : String(input);
			const headers = new Headers(init?.headers);
			calls.push({ url, authorization: headers.get("authorization") });
			return new Response("ok", { status: 200 });
		},
	) as unknown as typeof fetch;
});

afterEach(() => {
	globalThis.fetch = realFetch;
});

function ticket(overrides: Partial<{ target: string }> = {}) {
	return signSandboxGateTicket(SECRET, {
		workspaceId: WORKSPACE,
		port: PORT,
		target: overrides.target ?? TARGET,
		userId: "user_1",
		exp: Math.floor(Date.now() / 1000) + 3600,
	});
}

async function call(path: string) {
	return worker.fetch(
		new Request(`https://${GATE_HOST}${path}`, {
			headers: { authorization: `Bearer ${await ticket()}` },
		}),
		env,
	);
}

test("forwards an ordinary path to the ticket's target with the host secret", async () => {
	const response = await call("/trpc/health.check?foo=bar");

	expect(response.status).toBe(200);
	expect(calls).toHaveLength(1);
	expect(calls[0]?.url).toBe(`${TARGET}/trpc/health.check?foo=bar`);
	expect(calls[0]?.authorization).toBe(
		`Bearer ${await sandboxHostSecret(SECRET, WORKSPACE)}`,
	);
});

test("swaps a WebSocket upgrade's ticket param for the host secret", async () => {
	const response = await worker.fetch(
		new Request(
			`https://${GATE_HOST}/desktop/websockify?token=${await ticket()}&scale=1`,
		),
		env,
	);

	expect(response.status).toBe(200);
	expect(calls[0]?.url).toBe(
		`${TARGET}/desktop/websockify?token=${await sandboxHostSecret(SECRET, WORKSPACE)}&scale=1`,
	);
});

// GHSA-8qrv-53x7-hh4p: the upstream was resolved against the ticket target as a
// relative URL, so a request target that moves the origin took the host secret
// with it.
test.each([
	["protocol-relative", "//evil.example/x"],
	["backslash protocol-relative", "/\\evil.example/x"],
	["tab-smuggled protocol-relative", "/\t/evil.example/x"],
	["newline-smuggled protocol-relative", "/\n/evil.example/x"],
])("refuses a %s path instead of handing it the host secret", async (_name: string, path: string) => {
	const response = await call(path);

	expect(calls).toEqual([]);
	expect(response.status).toBe(400);
});

test("an absolute-URL request target cannot redirect the upstream", async () => {
	const response = await worker.fetch(
		new Request(`https://${GATE_HOST}/x`, {
			headers: { authorization: `Bearer ${await ticket()}` },
		}),
		env,
	);
	expect(response.status).toBe(200);
	expect(calls[0]?.url.startsWith(TARGET)).toBe(true);
});

test("a ticket whose own target is not a usable origin is refused", async () => {
	const response = await worker.fetch(
		new Request(`https://${GATE_HOST}/x`, {
			headers: {
				authorization: `Bearer ${await ticket({ target: "not a url" })}`,
			},
		}),
		env,
	);

	expect(calls).toEqual([]);
	expect(response.status).toBe(400);
});
