import { describe, expect, it } from "bun:test";
import { CLIError } from "./errors";
import { formatError } from "./runner";

function trpcError(
	code: string,
	message: string,
	data: Record<string, unknown> = {},
): Error {
	const error = new Error(message) as Error & {
		data?: { code?: string } & Record<string, unknown>;
	};
	error.data = { code, ...data };
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

	it("adds an upgrade hint when the server names a required plan", () => {
		const result = formatError(
			trpcError("FORBIDDEN", "Automations require the Pro plan.", {
				requiredPlan: "pro",
			}),
			"superset",
		);
		expect(result.message).toBe("Automations require the Pro plan.");
		expect(result.hint).toContain("Needs the Pro plan");
		expect(result.hint).toContain("superset.sh/pricing");
	});

	it("names Enterprise when that is the tier", () => {
		const result = formatError(
			trpcError("FORBIDDEN", "SSO requires the Enterprise plan.", {
				requiredPlan: "enterprise",
			}),
			"superset",
		);
		expect(result.hint).toContain("Needs the Enterprise plan");
	});

	it("leaves other FORBIDDEN errors without a hint", () => {
		const result = formatError(
			trpcError("FORBIDDEN", "Not a member of this organization"),
			"superset",
		);
		expect(result.message).toBe("Not a member of this organization");
		expect(result.hint).toBeUndefined();
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
