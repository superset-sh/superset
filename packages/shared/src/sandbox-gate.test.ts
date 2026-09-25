import { describe, expect, test } from "bun:test";
import { SignJWT } from "jose";
import {
	parseSandboxGateHost,
	sandboxGateUrl,
	sandboxHostSecret,
	signSandboxGateTicket,
	verifySandboxGateTicket,
} from "./sandbox-gate";

const SECRET = "a-shared-secret-that-is-at-least-thirty-two-bytes";
const CLAIMS = {
	workspaceId: "3f1c2a90-2b1e-4c2e-9a1e-0c7e3f9d1a11",
	port: 4879,
	target: "https://sb-abc123.vercel.run",
	userId: "user_1",
	exp: Math.floor(Date.now() / 1000) + 3600,
};

describe("sandbox gate ticket", () => {
	test("round-trips the claims", async () => {
		const ticket = await signSandboxGateTicket(SECRET, CLAIMS);
		expect(await verifySandboxGateTicket(SECRET, ticket)).toEqual(CLAIMS);
	});

	test("refuses another secret, a tampered payload and an expired ticket", async () => {
		const ticket = await signSandboxGateTicket(SECRET, CLAIMS);
		expect(await verifySandboxGateTicket(`${SECRET}x`, ticket)).toBeNull();
		const [header, payload, signature] = ticket.split(".");
		expect(
			await verifySandboxGateTicket(
				SECRET,
				`${header}.${payload}A.${signature}`,
			),
		).toBeNull();
		const expired = await signSandboxGateTicket(SECRET, {
			...CLAIMS,
			exp: Math.floor(Date.now() / 1000) - 1,
		});
		expect(await verifySandboxGateTicket(SECRET, expired)).toBeNull();
	});

	test("refuses a token this secret signed for another audience", async () => {
		const other = await new SignJWT({ port: 1, target: "x", userId: "u" })
			.setProtectedHeader({ alg: "HS256" })
			.setSubject(CLAIMS.workspaceId)
			.setAudience("something-else")
			.setExpirationTime(CLAIMS.exp)
			.sign(new TextEncoder().encode(SECRET));
		expect(await verifySandboxGateTicket(SECRET, other)).toBeNull();
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

describe("sandbox gate host", () => {
	test("builds the client URL from the gate origin", () => {
		expect(
			sandboxGateUrl(
				"https://*.sandbox.example.com",
				CLAIMS.workspaceId,
				CLAIMS.port,
			),
		).toBe(`https://${CLAIMS.workspaceId}-4879.sandbox.example.com`);
		expect(
			sandboxGateUrl("http://127.0.0.1:8790", CLAIMS.workspaceId, CLAIMS.port),
		).toBe("http://127.0.0.1:8790");
	});

	test("parses the workspace and port back out of a hostname", () => {
		expect(
			parseSandboxGateHost(
				`${CLAIMS.workspaceId}-4879.sandbox.example.com`,
				"sandbox.example.com",
			),
		).toEqual({ workspaceId: CLAIMS.workspaceId, port: 4879 });
		expect(
			parseSandboxGateHost("4879.sandbox.example.com", "sandbox.example.com"),
		).toBeNull();
		expect(
			parseSandboxGateHost(
				`${CLAIMS.workspaceId}-4879.sandbox.example.com`,
				"other.example.com",
			),
		).toBeNull();
	});
});
