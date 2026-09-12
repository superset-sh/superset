import { describe, expect, test } from "bun:test";
import {
	parseSandboxEdgeHost,
	sandboxEdgeUrl,
	sandboxHostSecret,
	signSandboxEdgeTicket,
	verifySandboxEdgeTicket,
} from "./sandbox-edge";

const SECRET = "a-shared-secret-that-is-at-least-thirty-two-bytes";
const CLAIMS = {
	workspaceId: "3f1c2a90-2b1e-4c2e-9a1e-0c7e3f9d1a11",
	port: 4879,
	target: "https://sb-abc123.vercel.run",
	userId: "user_1",
	exp: Math.floor(Date.now() / 1000) + 3600,
};

describe("sandbox edge ticket", () => {
	test("round-trips the claims", async () => {
		const ticket = await signSandboxEdgeTicket(SECRET, CLAIMS);
		expect(await verifySandboxEdgeTicket(SECRET, ticket)).toEqual(CLAIMS);
	});

	test("refuses another secret, a tampered payload and an expired ticket", async () => {
		const ticket = await signSandboxEdgeTicket(SECRET, CLAIMS);
		expect(await verifySandboxEdgeTicket(`${SECRET}x`, ticket)).toBeNull();
		const [payload, signature] = ticket.split(".");
		expect(
			await verifySandboxEdgeTicket(SECRET, `${payload}A.${signature}`),
		).toBeNull();
		const expired = await signSandboxEdgeTicket(SECRET, {
			...CLAIMS,
			exp: Math.floor(Date.now() / 1000) - 1,
		});
		expect(await verifySandboxEdgeTicket(SECRET, expired)).toBeNull();
	});

	test("refuses a ticket of another kind with a valid signature", async () => {
		const { signTicket } = await import("./hmac-ticket");
		const ticket = await signTicket(SECRET, { k: "page", exp: CLAIMS.exp });
		expect(await verifySandboxEdgeTicket(SECRET, ticket)).toBeNull();
	});
});

describe("sandbox host secret", () => {
	test("differs per workspace and per shared secret", async () => {
		const a = await sandboxHostSecret(SECRET, CLAIMS.workspaceId);
		expect(a).toBe(await sandboxHostSecret(SECRET, CLAIMS.workspaceId));
		expect(a).not.toBe(await sandboxHostSecret(SECRET, "other"));
		expect(a).not.toBe(
			await sandboxHostSecret(`${SECRET}x`, CLAIMS.workspaceId),
		);
	});
});

describe("sandbox edge host", () => {
	test("builds the client URL from the edge origin", () => {
		expect(
			sandboxEdgeUrl(
				"https://*.sandbox.example.com",
				CLAIMS.workspaceId,
				CLAIMS.port,
			),
		).toBe(`https://${CLAIMS.workspaceId}-4879.sandbox.example.com`);
		expect(
			sandboxEdgeUrl("http://127.0.0.1:8790", CLAIMS.workspaceId, CLAIMS.port),
		).toBe("http://127.0.0.1:8790");
	});

	test("parses the workspace and port back out of a hostname", () => {
		expect(
			parseSandboxEdgeHost(
				`${CLAIMS.workspaceId}-4879.sandbox.example.com`,
				"sandbox.example.com",
			),
		).toEqual({ workspaceId: CLAIMS.workspaceId, port: 4879 });
		expect(
			parseSandboxEdgeHost("4879.sandbox.example.com", "sandbox.example.com"),
		).toBeNull();
		expect(
			parseSandboxEdgeHost(
				`${CLAIMS.workspaceId}-4879.sandbox.example.com`,
				"other.example.com",
			),
		).toBeNull();
	});
});
