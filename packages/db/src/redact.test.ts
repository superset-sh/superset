import { describe, expect, it } from "bun:test";

import { redactDbError } from "./redact";

describe("redactDbError", () => {
	it("strips the params dump that can contain a session token", () => {
		const token = "super-secret-session-token-abc123";
		const error = new Error(
			`Failed query: select "id", "token" from "auth"."sessions" where "token" = $1\nparams: ${token}`,
		);

		const redacted = redactDbError(error) as Error;

		expect(redacted.message).not.toContain(token);
		expect(redacted.message).toContain("params: [redacted]");
		// SQL text before the params line is preserved for debugging.
		expect(redacted.message).toContain('from "auth"."sessions"');
	});

	it("handles multi-value params lists across the rest of the message", () => {
		const error = new Error(
			"Failed query: insert into users (a, b) values ($1, $2)\nparams: tokenA, tokenB",
		);

		const redacted = redactDbError(error) as Error;

		expect(redacted.message).not.toContain("tokenA");
		expect(redacted.message).not.toContain("tokenB");
	});

	it("redacts a params property when present", () => {
		const error = Object.assign(new Error("boom"), {
			params: ["secret-token"],
		});

		const redacted = redactDbError(error) as Error & { params?: unknown };

		expect(redacted.params).toBe("[redacted]");
	});

	it("leaves messages without params untouched", () => {
		const error = new Error("NeonDbError: Error connecting to database");

		const redacted = redactDbError(error) as Error;

		expect(redacted.message).toBe("NeonDbError: Error connecting to database");
	});

	it("passes through non-Error values unchanged", () => {
		expect(redactDbError("not an error")).toBe("not an error");
		expect(redactDbError(undefined)).toBeUndefined();
	});
});
