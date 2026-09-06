import { describe, expect, test } from "bun:test";
import { rotationKey } from "./rotationKey";

describe("rotationKey", () => {
	test("prefers the provider account identity", () => {
		expect(
			rotationKey({ agent: "claude", accountId: "uuid-1", selection: "/p/a" }),
		).toBe("claude:uuid-1");
	});

	test("falls back to the profile dir when the credential carries no identity", () => {
		expect(
			rotationKey({ agent: "codex", accountId: null, selection: "/p/b" }),
		).toBe("codex:/p/b");
	});

	test("names the system-default login, which has neither", () => {
		expect(
			rotationKey({ agent: "claude", accountId: null, selection: null }),
		).toBe("claude:default");
	});
});
