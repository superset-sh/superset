import { describe, expect, test } from "bun:test";
import { DEFAULT_TELEMETRY_ENABLED } from "./constants";

describe("telemetry defaults", () => {
	test("DEFAULT_TELEMETRY_ENABLED is false (no telemetry by default)", () => {
		expect(DEFAULT_TELEMETRY_ENABLED).toBe(false);
	});
});
