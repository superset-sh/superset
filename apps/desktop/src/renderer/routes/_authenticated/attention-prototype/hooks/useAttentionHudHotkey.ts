import { usePrototypeStore } from "../store/usePrototypeStore";
import { useLayoutAwareHotkey } from "./useLayoutAwareHotkey";

/**
 * PROTOTYPE-LOCAL ⌘J binding for the attention HUD.
 *
 * ⌘J is already bound to FOCUS_CHAT_INPUT in the global hotkey registry
 * (hotkeys/registry.ts). To keep this prototype self-contained and avoid
 * touching shared config, we bind ⌘J locally, scoped to the prototype route.
 * A real implementation would resolve the collision in the registry instead.
 */
export function useAttentionHudHotkey() {
	const toggleHud = usePrototypeStore((s) => s.toggleHud);
	useLayoutAwareHotkey("meta+j", toggleHud);
}
