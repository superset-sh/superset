import { useMemo } from "react";
import { useUserPreferences } from "renderer/hooks/useUserPreferences";
import type { TerminalPresetRow } from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal";
import type { KNOWN_BUILTIN_PRESET_IDS } from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal/schema";

// Membership in KNOWN_BUILTIN_PRESET_IDS is compile-checked: the preference
// heal prunes hidden ids against that list, so an id missing from it would
// have its hidden state silently dropped.
export const BUILTIN_CLI_PRESET_ID =
	"superset-cli" satisfies (typeof KNOWN_BUILTIN_PRESET_IDS)[number];

// Synthetic app-shipped preset merged into the preset bar at read time — never
// inserted into the terminalPresets collection, so it can't trip the
// first-run seeding guard or the agent→preset dedupe, and it stays updatable
// across releases. Slug-shaped id: user preset rows use UUIDs, so the
// namespaces can't collide.
export const BUILTIN_CLI_PRESET: TerminalPresetRow = {
	id: BUILTIN_CLI_PRESET_ID,
	name: "Superset CLI",
	description:
		"Script workspaces, agents, and automations from any terminal — agents in Superset terminals can use it too.",
	cwd: "",
	commands: ["superset --help"],
	projectIds: null,
	executionMode: "new-tab",
	tabOrder: Number.MAX_SAFE_INTEGER,
	createdAt: new Date(0),
};

interface BuiltinPresetEntry {
	preset: TerminalPresetRow;
	isVisible: boolean;
}

export function getBuiltinPresetEntries(
	hiddenBuiltinPresetIds: readonly string[],
): BuiltinPresetEntry[] {
	return [
		{
			preset: BUILTIN_CLI_PRESET,
			isVisible: !hiddenBuiltinPresetIds.includes(BUILTIN_CLI_PRESET_ID),
		},
	];
}

/**
 * Built-in presets to render alongside user presets. Hidden entries are still
 * returned (isVisible: false) so manage surfaces can offer un-hiding; bar
 * surfaces should filter on isVisible.
 */
export function useBuiltinPresets(): BuiltinPresetEntry[] {
	const { preferences } = useUserPreferences();
	return useMemo(
		() => getBuiltinPresetEntries(preferences.hiddenBuiltinPresetIds),
		[preferences.hiddenBuiltinPresetIds],
	);
}
