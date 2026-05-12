import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { normalizeInitialCommand } from "./normalizeInitialCommand";

// Mirrors `createSessionInputSchema.shape.initialCommand` in
// packages/host-service/src/trpc/router/terminal/terminal.ts. The renderer
// must never send a value that this schema would reject — that's what
// repro #4420 was: an empty preset command surfaced as "Failed to run
// preset" because the host-service rejected `initialCommand: ""`.
const initialCommandSchema = z.string().trim().min(1).optional();

describe("normalizeInitialCommand", () => {
	test("passes through a real command unchanged", () => {
		expect(normalizeInitialCommand("claude")).toBe("claude");
		expect(normalizeInitialCommand("  bun dev  ")).toBe("  bun dev  ");
	});

	test("returns undefined when undefined is passed", () => {
		expect(normalizeInitialCommand(undefined)).toBeUndefined();
	});

	// Repro for issue #4420: new presets default to `commands: [""]`,
	// so executing a freshly-created (or deliberately blank) preset reaches
	// the launcher with `command === ""`. Without normalization the renderer
	// forwards that to `terminal.createSession`, which rejects it with a Zod
	// "Too small: expected string to have >=1 characters" error — surfaced
	// as a "Failed to run preset" toast.
	test("returns undefined for an empty string command", () => {
		expect(normalizeInitialCommand("")).toBeUndefined();
	});

	test("returns undefined for whitespace-only commands", () => {
		expect(normalizeInitialCommand("   ")).toBeUndefined();
		expect(normalizeInitialCommand("\t\n")).toBeUndefined();
	});

	test("normalized output always satisfies the server schema", () => {
		for (const input of [undefined, "", "  ", "\t", "claude", "  bun dev  "]) {
			const normalized = normalizeInitialCommand(input);
			const result = initialCommandSchema.safeParse(normalized);
			expect(result.success).toBe(true);
		}
	});

	test("raw empty string would be rejected by the server schema", () => {
		// Sanity check: this is the exact shape of the failure from the
		// linked issue. If this ever starts passing, the schema relaxed
		// and the normalization above is no longer load-bearing.
		const result = initialCommandSchema.safeParse("");
		expect(result.success).toBe(false);
	});
});
