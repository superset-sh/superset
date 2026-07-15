import { describe, expect, it } from "bun:test";
import { classifyTerminalFailure } from "./terminalConnectionDiagnostics";

describe("classifyTerminalFailure", () => {
	it("does not guess a cause for local (non-host) terminals", () => {
		expect(
			classifyTerminalFailure({ status: 200, region: "iad" }, false),
		).toMatchObject({ category: "unknown" });
	});

	it("reports relay-unreachable when the preflight itself failed", () => {
		expect(classifyTerminalFailure(null, true)).toMatchObject({
			category: "relay-unreachable",
		});
	});

	it("reports host-offline on 503", () => {
		expect(
			classifyTerminalFailure({ status: 503, region: null }, true),
		).toMatchObject({ category: "host-offline" });
	});

	it("reports unauthorized on 401/403", () => {
		expect(
			classifyTerminalFailure({ status: 401, region: null }, true),
		).toMatchObject({ category: "unauthorized" });
		expect(
			classifyTerminalFailure({ status: 403, region: null }, true),
		).toMatchObject({ category: "unauthorized" });
	});

	it("reports stream-blocked when the host is present (200) but the WS still drops", () => {
		const result = classifyTerminalFailure(
			{ status: 200, region: "iad" },
			true,
		);
		expect(result.category).toBe("stream-blocked");
		// The region is surfaced so cross-region routing is obvious.
		expect(result.message).toContain("iad");
	});

	it("treats a 502/504 gateway status as a temporary relay failure, not host-offline", () => {
		for (const status of [502, 504]) {
			const result = classifyTerminalFailure({ status, region: null }, true);
			expect(result.category).toBe("stream-blocked");
			expect(result.message).toContain("temporary");
		}
	});

	it("falls back to unknown for unexpected statuses", () => {
		expect(
			classifyTerminalFailure({ status: 500, region: null }, true),
		).toMatchObject({ category: "unknown" });
	});
});
