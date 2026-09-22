import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { i18n } from "@superset/i18n";
import type { LinkAction, Surface } from "./types";

const FILE_LABELS: Record<LinkAction, MessageDescriptor> = {
	pane: msg({ message: "Open in tab" }),
	newTab: msg({ message: "Open in new tab" }),
	external: msg({ message: "Open in editor" }),
};

const URL_LABELS: Record<LinkAction, MessageDescriptor> = {
	pane: msg({ message: "Open in split pane" }),
	newTab: msg({ message: "Open in new tab" }),
	external: msg({ message: "Open in external browser" }),
};

export function actionLabel(action: LinkAction, surface: Surface): string {
	return i18n._(surface === "file" ? FILE_LABELS[action] : URL_LABELS[action]);
}

export function actionLabelOrNone(
	action: LinkAction | null,
	surface: Surface,
): string {
	return action === null
		? i18n._(msg({ message: "Do nothing" }))
		: actionLabel(action, surface);
}

/** Short verb form used inside the per-row hint tooltip. */
const SHORT_FILE_LABELS: Record<LinkAction, MessageDescriptor> = {
	pane: msg({ message: "open" }),
	newTab: msg({ message: "new tab" }),
	external: msg({ message: "editor" }),
};

const SHORT_URL_LABELS: Record<LinkAction, MessageDescriptor> = {
	pane: msg({ message: "split pane" }),
	newTab: msg({ message: "new tab" }),
	external: msg({ message: "external browser" }),
};

export function shortActionLabel(action: LinkAction, surface: Surface): string {
	return i18n._(
		surface === "file" ? SHORT_FILE_LABELS[action] : SHORT_URL_LABELS[action],
	);
}
