import { useMemo } from "react";
import {
	getBinding,
	type HotkeyId,
	useHotkeyOverridesStore,
} from "renderer/hotkeys";

const WORKSPACE_HOTKEY_IDS: HotkeyId[] = [
	"JUMP_TO_WORKSPACE_1",
	"JUMP_TO_WORKSPACE_2",
	"JUMP_TO_WORKSPACE_3",
	"JUMP_TO_WORKSPACE_4",
	"JUMP_TO_WORKSPACE_5",
	"JUMP_TO_WORKSPACE_6",
	"JUMP_TO_WORKSPACE_7",
	"JUMP_TO_WORKSPACE_8",
	"JUMP_TO_WORKSPACE_9",
];

const MODIFIER_KEY_MAP: Record<string, string> = {
	meta: "Meta",
	ctrl: "Control",
	shift: "Shift",
	alt: "Alt",
};

export interface WorkspaceShortcutInfo {
	index: number;
	triggerKey: string;
	modifierKeys: string[];
}

export function parseBinding(binding: string): {
	modifierKeys: string[];
	triggerKey: string;
} {
	const parts = binding.split("+");
	const triggerKey = parts[parts.length - 1];
	const modifierKeys = parts.slice(0, -1).map((m) => MODIFIER_KEY_MAP[m] ?? m);
	return { modifierKeys, triggerKey };
}

export function useWorkspaceShortcutModifiers() {
	const overrides = useHotkeyOverridesStore((s) => s.overrides);

	return useMemo(() => {
		// `overrides` isn't read directly here but `getBinding` reads the
		// override store imperatively.  Referencing the value forces the
		// memo to recompute when the user changes hotkey bindings.
		void overrides;

		const allModifierKeys = new Set<string>();
		const shortcuts: WorkspaceShortcutInfo[] = [];
		const comboToIndices = new Map<string, number[]>();

		for (let i = 0; i < WORKSPACE_HOTKEY_IDS.length; i++) {
			const binding = getBinding(WORKSPACE_HOTKEY_IDS[i]);
			if (!binding) continue;
			const { modifierKeys, triggerKey } = parseBinding(binding);
			for (const key of modifierKeys) allModifierKeys.add(key);
			shortcuts.push({ index: i, triggerKey, modifierKeys });
			const comboKey = [...modifierKeys].sort().join("+");
			const existing = comboToIndices.get(comboKey) ?? [];
			existing.push(i);
			comboToIndices.set(comboKey, existing);
		}

		return { allModifierKeys, shortcuts, comboToIndices };
	}, [overrides]);
}
