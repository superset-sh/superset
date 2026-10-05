import { describe, expect, it } from "bun:test";
import { valid } from "semver";
import { ACP_HARNESSES, UNGATED_VERSION } from "./acpCatalogue";

const entries = Object.entries(ACP_HARNESSES);

describe("ACP_HARNESSES", () => {
	it("serves every harness the product maps to", () => {
		const ids = entries.map(([id]) => id);
		expect(ids).toContain("claude-acp");
		expect(ids).toContain("codex-acp");
		expect(ids).toContain("pi-acp");
	});

	it.each(entries)("%s names a binary and a usable floor", (_id, entry) => {
		expect(entry.binary).not.toBe("");
		expect(valid(entry.minVersion)).not.toBeNull();
	});

	it.each(entries)("%s tells a gated reader how to upgrade", (_id, entry) => {
		if (entry.minVersion === UNGATED_VERSION) return;
		expect(entry.upgrade).toBeTypeOf("string");
		expect(entry.upgrade).not.toBe("");
	});

	it.each(entries)("%s can reach the CLI it translates for", (_id, entry) => {
		if (entry.adapter === undefined) return;
		expect(entry.executableEnv).not.toBe("");
	});
});
