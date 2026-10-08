import { describe, expect, test } from "bun:test";
import {
	acpHarnessForPreset,
	presetForAcpHarness,
	presetForAnyHarness,
} from "./harness";

describe("acpHarnessForPreset", () => {
	test("maps the agents that run as chats", () => {
		expect(acpHarnessForPreset("claude")).toBe("claude-acp");
		expect(acpHarnessForPreset("codex")).toBe("codex-acp");
		expect(acpHarnessForPreset("opencode")).toBe("opencode-acp");
		expect(acpHarnessForPreset("pi")).toBe("pi-acp");
	});

	test("anything else is not a chat", () => {
		expect(
			acpHarnessForPreset("3f1d9c2a-7b55-4e41-9a3e-6f0b2c8d1e77"),
		).toBeUndefined();
		expect(acpHarnessForPreset("amp")).toBeUndefined();
		expect(acpHarnessForPreset(null)).toBeUndefined();
		expect(acpHarnessForPreset(undefined)).toBeUndefined();
	});
});

describe("presetForAcpHarness", () => {
	test("reverses the ACP map only", () => {
		expect(presetForAcpHarness("claude-acp")).toBe("claude");
		expect(presetForAcpHarness("claude-code")).toBeUndefined();
	});
});

describe("presetForAnyHarness", () => {
	test("also names the agent behind a pre-ACP harness", () => {
		expect(presetForAnyHarness("claude-acp")).toBe("claude");
		expect(presetForAnyHarness("claude-code")).toBe("claude");
		expect(presetForAnyHarness("codex")).toBe("codex");
		expect(presetForAnyHarness("unknown")).toBeUndefined();
	});
});
