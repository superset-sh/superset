import { describe, expect, test } from "bun:test";
import { table } from "./output";

const UUID = "8f3ed762-b3fe-4520-ab71-0bb47aaaaaaa"; // 36 chars

describe("table id truncation (issue #5153)", () => {
	test("does not truncate the id column even when maxColWidth is small", () => {
		// Reproduces `superset workspaces list`, which renders with maxColWidth=30.
		// A UUID is 36 chars, so it was being truncated to "…" and became unusable
		// in follow-up commands like `superset terminals create --workspace <id>`.
		const out = table(
			[{ name: "main", branch: "main", id: UUID }],
			["name", "branch", "id"],
			["NAME", "BRANCH", "ID"],
			30,
		);

		expect(out).toContain(UUID);
		expect(out).not.toContain("…");
	});

	test("still truncates non-id columns over maxColWidth", () => {
		const longName = "a".repeat(50);
		const out = table(
			[{ name: longName, id: UUID }],
			["name", "id"],
			["NAME", "ID"],
			30,
		);

		expect(out).not.toContain(longName);
		expect(out).toContain("…");
		expect(out).toContain(UUID);
	});
});
