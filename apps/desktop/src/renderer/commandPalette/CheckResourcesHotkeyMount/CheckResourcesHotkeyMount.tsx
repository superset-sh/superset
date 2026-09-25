import { useCheckResourcesHotkey } from "../hooks/useCheckResourcesHotkey";

/**
 * CommandPaletteHost only mounts inside the _dashboard route tree, so routes
 * outside it (Settings) need their own mount for CHECK_RESOURCES — otherwise
 * the hotkey and the native "Resources" menu item go dead the moment the
 * user navigates into Settings, including on the Usage/Resources page they
 * point at.
 */
export function CheckResourcesHotkeyMount() {
	useCheckResourcesHotkey();
	return null;
}
