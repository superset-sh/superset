import type { LinkAction, Surface } from "./types";

const FILE_LABELS: Record<LinkAction, string> = {
	pane: "Open in tab",
	newTab: "Open in new tab",
	external: "Open in editor",
};

const URL_LABELS: Record<LinkAction, string> = {
	pane: "Open in browser",
	newTab: "Open in new browser tab",
	external: "Open in system browser",
};

export function actionLabel(action: LinkAction, surface: Surface): string {
	return surface === "file" ? FILE_LABELS[action] : URL_LABELS[action];
}

export function actionLabelOrNone(
	action: LinkAction | null,
	surface: Surface,
): string {
	return action === null ? "Do nothing" : actionLabel(action, surface);
}

/** Short verb form used inside the per-row hint tooltip. */
const SHORT_FILE_LABELS: Record<LinkAction, string> = {
	pane: "open",
	newTab: "new tab",
	external: "editor",
};

const SHORT_URL_LABELS: Record<LinkAction, string> = {
	pane: "browser",
	newTab: "new tab",
	external: "system browser",
};

export function shortActionLabel(action: LinkAction, surface: Surface): string {
	return surface === "file"
		? SHORT_FILE_LABELS[action]
		: SHORT_URL_LABELS[action];
}
