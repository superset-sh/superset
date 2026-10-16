import { describe, expect, it } from "bun:test";
import { getEnabledAgentConfigs, resolveAgentConfigs } from "./agent-settings";

/**
 * Reproduction for issue #5738 — "Custom terminal preset not selectable as
 * agent when creating a new workspace".
 *
 * The new-workspace agent picker (desktop `PromptGroup`) derives its dropdown
 * options from the *agent* system:
 *
 *   getEnabledAgentConfigs(resolveAgentConfigs({ customDefinitions, overrideEnvelope }))
 *
 * which resolves only the built-in agent catalog plus user `custom:` agents.
 * Terminal *Presets* (Terminal launcher → Presets → Configure Presets) live in
 * a separate store (`settings.terminalPresets`) that this pipeline never reads.
 *
 * A user who configures a terminal preset named "Claudex" therefore cannot
 * select it in the "What do you want to do?" dialog: the dropdown lists the
 * built-in agents (Claude, Codex, Mistral Vibe, Polygraph, …) but not their
 * preset. These tests document the expected behaviour (the preset should be
 * offered as a selectable option) and currently fail.
 *
 * Refs #5738
 */

// Mirrors the `TerminalPreset` shape from `@superset/local-db` (kept inline to
// avoid a shared → local-db dependency; only the fields used here are needed).
interface TerminalPresetLike {
	id: string;
	name: string;
	cwd: string;
	commands: string[];
}

describe("new-workspace agent picker — terminal preset bridge (issue #5738)", () => {
	// The exact pipeline the desktop picker uses to build its options.
	const selectableAgentLabels = () =>
		getEnabledAgentConfigs(
			resolveAgentConfigs({ customDefinitions: [], overrideEnvelope: null }),
		).map((config) => config.label);

	it("lists the built-in agents (sanity check for the picker's data source)", () => {
		// The dropdown from the issue's screenshot: Claude, Codex, Mistral Vibe…
		expect(selectableAgentLabels()).toContain("Claude");
	});

	it("offers a user-configured custom terminal preset as a selectable option", () => {
		// A user configures a terminal preset named "Claudex" under
		// Terminal launcher → Presets → Configure Presets. It is persisted in
		// `settings.terminalPresets`, separate from the agent catalog.
		const claudex: TerminalPresetLike = {
			id: "preset-claudex",
			name: "Claudex",
			cwd: "",
			commands: ["claudex"],
		};

		// Expected: the new-workspace picker offers the custom preset so the user
		// can launch a workspace with it (alongside Claude, Codex, …).
		// Actual: terminal presets are never merged into the agent-config
		// pipeline, so "Claudex" is absent from the dropdown.
		expect(selectableAgentLabels()).toContain(claudex.name);
	});
});
