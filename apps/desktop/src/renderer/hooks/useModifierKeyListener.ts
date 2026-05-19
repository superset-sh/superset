import { useEffect } from "react";
import { useModifierKeyStateStore } from "renderer/stores/modifier-key-state";
import { useWorkspaceShortcutModifiers } from "./useWorkspaceShortcutModifiers";

export function useModifierKeyListener(enabled: boolean) {
	const { allModifierKeys, comboToIndices } = useWorkspaceShortcutModifiers();
	const { pressKey, releaseKey, clearAll } = useModifierKeyStateStore();

	useEffect(() => {
		if (!enabled) {
			clearAll();
			return;
		}

		function updateIsModifierHeld() {
			const held = useModifierKeyStateStore.getState().heldKeys;
			for (const combo of comboToIndices.keys()) {
				const comboKeys = combo.split("+");
				if (comboKeys.length > 0 && comboKeys.every((k) => held.has(k))) {
					useModifierKeyStateStore.setState({ isModifierHeld: true });
					return;
				}
			}
			useModifierKeyStateStore.setState({ isModifierHeld: false });
		}

		function handleKeyDown(e: KeyboardEvent) {
			if (allModifierKeys.has(e.key)) {
				pressKey(e.key);
				updateIsModifierHeld();
			}
		}
		function handleKeyUp(e: KeyboardEvent) {
			if (allModifierKeys.has(e.key)) {
				releaseKey(e.key);
				updateIsModifierHeld();
			}
		}
		function handleBlur() {
			clearAll();
		}

		window.addEventListener("keydown", handleKeyDown);
		window.addEventListener("keyup", handleKeyUp);
		window.addEventListener("blur", handleBlur);

		return () => {
			window.removeEventListener("keydown", handleKeyDown);
			window.removeEventListener("keyup", handleKeyUp);
			window.removeEventListener("blur", handleBlur);
			clearAll();
		};
	}, [
		enabled,
		allModifierKeys,
		comboToIndices,
		pressKey,
		releaseKey,
		clearAll,
	]);
}
