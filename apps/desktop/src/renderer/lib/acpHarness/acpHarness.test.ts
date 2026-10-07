import { describe, expect, it } from "bun:test";
import { acpHarnessForPreset, presetForAcpHarness } from "./acpHarness";

describe("acpHarnessForPreset", () => {
	it("maps a preset to its harness", () => {
		expect(acpHarnessForPreset("claude")).toBe("claude-acp");
		expect(acpHarnessForPreset("codex")).toBe("codex-acp");
		expect(acpHarnessForPreset("opencode")).toBe("opencode-acp");
	});

	it("refuses a config id, which is a different identifier space", () => {
		expect(
			acpHarnessForPreset("3f1d9c2a-7b55-4e41-9a3e-6f0b2c8d1e77"),
		).toBeUndefined();
	});

	it("has no harness for an agent that cannot run as a chat", () => {
		expect(acpHarnessForPreset("amp")).toBeUndefined();
		expect(acpHarnessForPreset(null)).toBeUndefined();
		expect(acpHarnessForPreset(undefined)).toBeUndefined();
	});
});

describe("presetForAcpHarness", () => {
	it("maps a harness back to its preset", () => {
		expect(presetForAcpHarness("claude-acp")).toBe("claude");
		expect(presetForAcpHarness("claude-code")).toBeUndefined();
	});
});
