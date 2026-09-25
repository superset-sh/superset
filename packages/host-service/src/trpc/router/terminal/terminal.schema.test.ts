// Schema-only tests for the createSession input contract. The module chain
// reads env at load (@t3-oss/env-core), so vars must be set before importing.
process.env.ORGANIZATION_ID = "00000000-0000-4000-8000-000000000000";
process.env.HOST_SERVICE_SECRET = "test-secret";
process.env.HOST_DB_PATH = "/tmp/test-host.db";
process.env.HOST_MIGRATIONS_FOLDER = "/tmp/test-migrations";
process.env.AUTH_TOKEN = "test-auth-token";
process.env.SUPERSET_API_URL = "https://cloud.example.com";

import { describe, expect, test } from "bun:test";

const { createSessionInputSchema } = await import("./terminal.ts");

describe("createSessionInputSchema.initialCommand", () => {
	test("keeps a non-empty command, trimmed", () => {
		const parsed = createSessionInputSchema.parse({
			workspaceId: "ws-1",
			initialCommand: "  ls -la  ",
		});
		expect(parsed.initialCommand).toBe("ls -la");
	});

	test("normalizes an empty command to absent instead of erroring", () => {
		const parsed = createSessionInputSchema.parse({
			workspaceId: "ws-1",
			initialCommand: "",
		});
		expect(parsed.initialCommand).toBeUndefined();
	});

	test("normalizes a whitespace-only command to absent instead of erroring", () => {
		const parsed = createSessionInputSchema.parse({
			workspaceId: "ws-1",
			initialCommand: "   ",
		});
		expect(parsed.initialCommand).toBeUndefined();
	});

	test("stays optional", () => {
		const parsed = createSessionInputSchema.parse({ workspaceId: "ws-1" });
		expect(parsed.initialCommand).toBeUndefined();
	});
});
