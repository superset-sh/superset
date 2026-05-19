import { describe, expect, it } from "bun:test";
import { DEFAULT_TERMINAL_PRESET_AGENT_TYPES } from "./builtin-terminal-agents";

describe("DEFAULT_TERMINAL_PRESET_AGENT_TYPES", () => {
	it("includes opencode as a default terminal preset", () => {
		expect(DEFAULT_TERMINAL_PRESET_AGENT_TYPES).toContain("opencode");
	});
});
