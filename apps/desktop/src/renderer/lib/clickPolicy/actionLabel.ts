import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { i18n } from "@superset/i18n";
import type { LinkAction, Surface } from "./types";

const FILE_LABELS: Record<LinkAction, MessageDescriptor> = {
	pane: msg({ id: "clickPolicy.file.pane", message: "Open in tab" }),
	newTab: msg({ id: "clickPolicy.file.newTab", message: "Open in new tab" }),
	external: msg({ id: "clickPolicy.file.external", message: "Open in editor" }),
};

const URL_LABELS: Record<LinkAction, MessageDescriptor> = {
	pane: msg({ id: "clickPolicy.url.pane", message: "Open in in-app browser" }),
	newTab: msg({
		id: "clickPolicy.url.newTab",
		message: "Open in new browser tab",
	}),
	external: msg({
		id: "clickPolicy.url.external",
		message: "Open in default browser",
	}),
};

export function actionLabel(action: LinkAction, surface: Surface): string {
	return i18n._(surface === "file" ? FILE_LABELS[action] : URL_LABELS[action]);
}

export function actionLabelOrNone(
	action: LinkAction | null,
	surface: Surface,
): string {
	return action === null
		? i18n._({ id: "clickPolicy.action.none", message: "Do nothing" })
		: actionLabel(action, surface);
}

/** Short verb form used inside the per-row hint tooltip. */
const SHORT_FILE_LABELS: Record<LinkAction, MessageDescriptor> = {
	pane: msg({ id: "clickPolicy.short.file.pane", message: "open" }),
	newTab: msg({ id: "clickPolicy.short.file.newTab", message: "new tab" }),
	external: msg({ id: "clickPolicy.short.file.external", message: "editor" }),
};

const SHORT_URL_LABELS: Record<LinkAction, MessageDescriptor> = {
	pane: msg({ id: "clickPolicy.short.url.pane", message: "in-app browser" }),
	newTab: msg({ id: "clickPolicy.short.url.newTab", message: "new tab" }),
	external: msg({
		id: "clickPolicy.short.url.external",
		message: "default browser",
	}),
};

export function shortActionLabel(action: LinkAction, surface: Surface): string {
	return i18n._(
		surface === "file" ? SHORT_FILE_LABELS[action] : SHORT_URL_LABELS[action],
	);
}
