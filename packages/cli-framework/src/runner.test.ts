import { describe, expect, it } from "bun:test";
import { CLIError } from "./errors";
import { formatError } from "./runner";

function trpcError(code: string, message: string): Error {
	const error = new Error(message) as Error & { data?: { code?: string } };
	error.data = { code };
	return error;
}

describe("formatError", () => {
	it("keeps the server message for NOT_FOUND", () => {
		const result = formatError(
			trpcError(
				"NOT_FOUND",
				"Host abc123 is not registered in this organization",
			),
			"superset",
		);
		expect(result.message).toBe(
			"Host abc123 is not registered in this organization",
		);
	});

	it("falls back to generic text when NOT_FOUND has no message", () => {
		const result = formatError(trpcError("NOT_FOUND", ""), "superset");
		expect(result.message).toBe("Not found");
	});

	it("maps UNAUTHORIZED to a login hint", () => {
		const result = formatError(trpcError("UNAUTHORIZED", "nope"), "superset");
		expect(result.message).toBe("Session expired");
		expect(result.hint).toBe("Run: superset auth login");
	});

	it("passes CLIError message and suggestion through", () => {
		const result = formatError(
			new CLIError("This machine isn't registered", "Run: superset start"),
			"superset",
		);
		expect(result.message).toBe("This machine isn't registered");
		expect(result.hint).toBe("Run: superset start");
	});
});
