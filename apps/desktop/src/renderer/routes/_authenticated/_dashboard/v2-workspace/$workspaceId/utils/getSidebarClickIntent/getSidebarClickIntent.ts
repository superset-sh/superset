export type SidebarClickIntent = "openInEditor" | "openInNewTab" | "select";

export type OpenTargetClickIntent =
	| "openExternally"
	| "openInNewTab"
	| "openInCurrentTab";

export interface ModifierClickEvent {
	metaKey: boolean;
	ctrlKey: boolean;
	shiftKey: boolean;
}

export function getOpenTargetClickIntent(
	e: ModifierClickEvent,
): OpenTargetClickIntent {
	if (e.metaKey || e.ctrlKey) return "openExternally";
	if (e.shiftKey) return "openInNewTab";
	return "openInCurrentTab";
}

export function getSidebarClickIntent(
	e: ModifierClickEvent,
): SidebarClickIntent {
	const intent = getOpenTargetClickIntent(e);
	if (intent === "openExternally") return "openInEditor";
	if (intent === "openInNewTab") return "openInNewTab";
	return "select";
}
