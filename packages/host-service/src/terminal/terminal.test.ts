import { describe, expect, test } from "bun:test";
import { toSafeWebSocketCloseReason } from "./terminal";

describe("toSafeWebSocketCloseReason", () => {
	test("preserves short close reasons", () => {
		expect(toSafeWebSocketCloseReason("Internal terminal attach error")).toBe(
			"Internal terminal attach error",
		);
	});

	test("truncates long UTF-8 close reasons to the WebSocket byte limit", () => {
		const reason = `Terminal session "${"session-".repeat(40)}🔥" not found; create it before connecting.`;
		const safeReason = toSafeWebSocketCloseReason(reason);

		expect(Buffer.byteLength(safeReason, "utf8")).toBeLessThanOrEqual(123);
		expect(safeReason.endsWith("...")).toBe(true);
	});
});
