const isMac =
	typeof navigator !== "undefined" &&
	navigator.platform.toLowerCase().includes("mac");

export const SHIFT_CLICK_LABEL = isMac ? "⇧ click" : "Shift+click";
export const MOD_CLICK_LABEL = isMac ? "⌘ click" : "Ctrl+click";

export const CLICK_HINT_TOOLTIP = `${SHIFT_CLICK_LABEL}: new tab · ${MOD_CLICK_LABEL}: editor`;
