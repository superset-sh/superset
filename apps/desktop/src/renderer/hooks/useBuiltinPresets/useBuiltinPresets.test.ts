import { describe, expect, it } from "bun:test";
import {
	BUILTIN_CLI_PRESET,
	BUILTIN_CLI_PRESET_ID,
	getBuiltinPresetEntries,
} from "./useBuiltinPresets";

describe("getBuiltinPresetEntries", () => {
	it("returns the CLI preset as visible when not hidden", () => {
		const entries = getBuiltinPresetEntries([]);
		expect(entries).toHaveLength(1);
		expect(entries[0].preset.id).toBe(BUILTIN_CLI_PRESET_ID);
		expect(entries[0].isVisible).toBe(true);
	});

	it("keeps hidden presets in the list but marks them not visible", () => {
		const entries = getBuiltinPresetEntries([BUILTIN_CLI_PRESET_ID]);
		expect(entries).toHaveLength(1);
		expect(entries[0].isVisible).toBe(false);
	});

	it("ignores unrelated hidden ids", () => {
		const entries = getBuiltinPresetEntries(["some-other-id"]);
		expect(entries[0].isVisible).toBe(true);
	});
});

describe("BUILTIN_CLI_PRESET", () => {
	it("is a plain command preset with no agent link", () => {
		// No agentId: resolvePresetLaunchCommands must fall back to `commands`,
		// and preset-icon resolution must not bind it to a host agent config.
		expect(BUILTIN_CLI_PRESET.agentId).toBeUndefined();
		expect(BUILTIN_CLI_PRESET.commands).toEqual(["superset --help"]);
		expect(BUILTIN_CLI_PRESET.executionMode).toBe("new-tab");
	});

	it("uses a slug id outside the UUID namespace of user rows", () => {
		expect(BUILTIN_CLI_PRESET.id).toBe("superset-cli");
	});
});
