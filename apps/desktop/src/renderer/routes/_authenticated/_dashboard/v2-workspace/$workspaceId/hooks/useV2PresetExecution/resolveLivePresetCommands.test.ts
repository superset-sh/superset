import { describe, expect, it } from "bun:test";
import {
	type AgentForResolution,
	resolveLivePresetCommands,
} from "./resolveLivePresetCommands";

const claudeDefault: AgentForResolution = {
	presetId: "claude",
	command: "claude",
	args: ["--permission-mode", "acceptEdits"],
};

const claudeEdited: AgentForResolution = {
	presetId: "claude",
	command: "claude",
	args: ["--dangerously-skip-permissions"],
};

const ampDefault: AgentForResolution = {
	presetId: "amp",
	command: "amp",
	args: [],
};

describe("resolveLivePresetCommands", () => {
	it("returns the live command when agentId matches an installed agent", () => {
		const preset = {
			agentId: "claude",
			commands: ["claude --permission-mode acceptEdits"],
		};
		expect(resolveLivePresetCommands(preset, [claudeEdited])).toEqual([
			"claude --dangerously-skip-permissions",
		]);
	});

	it("falls back to the snapshot when the linked agent is missing", () => {
		const preset = {
			agentId: "claude",
			commands: ["claude --permission-mode acceptEdits"],
		};
		expect(resolveLivePresetCommands(preset, [ampDefault])).toEqual([
			"claude --permission-mode acceptEdits",
		]);
	});

	it("uses the live command for rows that have no agentId but match an installed agent's command token", () => {
		// Repro for #4195: a v2 preset row seeded outside the quick-add flow
		// has no `agentId`, just a `commands` snapshot starting with "claude".
		// The user has edited Claude in `Settings → Agents` to opt out of
		// `--permission-mode acceptEdits`, but the launcher silently keeps
		// using the snapshotted default. The overlay should kick in via the
		// command-token fallback so the user's edit is honoured.
		const preset = {
			commands: ["claude --permission-mode acceptEdits"],
		};
		expect(resolveLivePresetCommands(preset, [claudeEdited])).toEqual([
			"claude --dangerously-skip-permissions",
		]);
	});

	it("keeps the snapshot when no agentId is set and no installed agent matches", () => {
		const preset = { commands: ["my-custom-binary --foo"] };
		expect(resolveLivePresetCommands(preset, [claudeDefault])).toEqual([
			"my-custom-binary --foo",
		]);
	});

	it("keeps the snapshot when commands is empty", () => {
		const preset = { commands: [] };
		expect(resolveLivePresetCommands(preset, [claudeDefault])).toEqual([]);
	});

	it("ignores agents whose command is blank when inferring by token", () => {
		const preset = { commands: ["claude --permission-mode acceptEdits"] };
		const blank: AgentForResolution = {
			presetId: "claude",
			command: "  ",
			args: [],
		};
		expect(resolveLivePresetCommands(preset, [blank])).toEqual([
			"claude --permission-mode acceptEdits",
		]);
	});
});
