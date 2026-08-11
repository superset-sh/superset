import { describe, expect, test } from "bun:test";
import { requireHostTarget, resolveHostFilter } from "./resolveHostFlags";

describe("host target flags", () => {
	test("requires an explicit target for mutating commands", () => {
		expect(() =>
			requireHostTarget({ host: undefined, local: undefined }),
		).toThrow(/Target host required/);
	});

	test("accepts an explicit remote host", () => {
		expect(requireHostTarget({ host: "host-1", local: undefined })).toBe(
			"host-1",
		);
	});

	test("rejects conflicting host flags", () => {
		expect(() => resolveHostFilter({ host: "host-1", local: true })).toThrow(
			/Pass either --host or --local, not both/,
		);
	});
});
