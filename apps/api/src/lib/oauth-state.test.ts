import { describe, expect, mock, test } from "bun:test";
import { createHmac } from "node:crypto";

mock.module("@/env", () => ({
	env: { BETTER_AUTH_SECRET: "test-secret" },
}));

const { createSignedState, pluginStateSchema, verifySignedState } =
	await import("./oauth-state");

const PLUGIN_PAYLOAD = {
	userId: "user_1",
	pluginName: "linear",
	authMethod: "oauth2",
	inputs: {},
};

function sign(body: string, secret = "test-secret"): string {
	return createHmac("sha256", secret).update(body).digest("base64url");
}

function encode(payload: unknown): string {
	return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

describe("plugin oauth state", () => {
	test("round-trips the payload it was created with", () => {
		const state = verifySignedState(
			createSignedState(PLUGIN_PAYLOAD),
			pluginStateSchema,
		);
		expect(state).toMatchObject(PLUGIN_PAYLOAD);
	});

	test("rejects a tampered payload carrying a valid-looking signature", () => {
		const [, signature] = createSignedState(PLUGIN_PAYLOAD).split(".");
		const forged = encode({
			...PLUGIN_PAYLOAD,
			userId: "victim",
			timestamp: Date.now(),
		});

		expect(
			verifySignedState(`${forged}.${signature}`, pluginStateSchema),
		).toBeNull();
	});

	test("rejects a signature from a different secret", () => {
		const [body] = createSignedState(PLUGIN_PAYLOAD).split(".");
		expect(
			verifySignedState(
				`${body}.${sign(body as string, "other-secret")}`,
				pluginStateSchema,
			),
		).toBeNull();
	});

	test.each([
		["no separator"],
		[".sig"],
		["body."],
		[""],
	])("rejects the malformed token %j", (token) => {
		expect(verifySignedState(token, pluginStateSchema)).toBeNull();
	});

	test("rejects a state older than its ten-minute window", () => {
		const body = encode({
			...PLUGIN_PAYLOAD,
			timestamp: Date.now() - 11 * 60 * 1000,
		});
		expect(
			verifySignedState(`${body}.${sign(body)}`, pluginStateSchema),
		).toBeNull();
	});

	test("rejects a state stamped in the future", () => {
		const body = encode({
			...PLUGIN_PAYLOAD,
			timestamp: Date.now() + 11 * 60 * 1000,
		});
		expect(
			verifySignedState(`${body}.${sign(body)}`, pluginStateSchema),
		).toBeNull();
	});
});

describe("integration oauth state", () => {
	const PAYLOAD = { organizationId: "org_1", userId: "user_1" };

	test("round-trips without a schema, as its existing callers use it", () => {
		expect(verifySignedState(createSignedState(PAYLOAD))).toEqual(PAYLOAD);
	});

	test("refuses a plugin payload through the default schema", () => {
		expect(verifySignedState(createSignedState(PLUGIN_PAYLOAD))).toBeNull();
	});

	test("rejects a tampered organizationId", () => {
		const [, signature] = createSignedState(PAYLOAD).split(".");
		const forged = encode({
			...PAYLOAD,
			organizationId: "org_victim",
			timestamp: Date.now(),
		});
		expect(verifySignedState(`${forged}.${signature}`)).toBeNull();
	});
});
