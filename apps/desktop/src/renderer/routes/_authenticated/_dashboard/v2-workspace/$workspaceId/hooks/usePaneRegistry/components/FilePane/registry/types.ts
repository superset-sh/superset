import type { MessageDescriptor } from "@lingui/core";
import { i18n } from "@superset/i18n";
import type { ComponentType } from "react";
import type { SharedFileDocument } from "../../../../../state/fileDocumentStore";

export type FileMeta = {
	size?: number;
	isBinary?: boolean;
};

export type DocumentKind = "text" | "bytes" | "custom";

// Priorities mirror VS Code's RegisteredEditorPriority
// (editorResolverService.ts). Ranking: exclusive > default > builtin > option.
export type Priority = "builtin" | "option" | "default" | "exclusive";

export const PRIORITY_RANK: Record<Priority, number> = {
	exclusive: 5,
	default: 4,
	builtin: 3,
	option: 1,
};

export type FileViewLabel =
	| MessageDescriptor
	| ((filePath: string) => MessageDescriptor);

export interface FileView {
	id: string;
	label: FileViewLabel;
	match: (filePath: string, meta: FileMeta) => boolean;
	priority: Priority;
	documentKind: DocumentKind;
	Renderer: ComponentType<ViewProps>;
}

export interface ViewProps {
	document: SharedFileDocument;
	filePath: string;
	workspaceId: string;
	paneId: string;
	isActive: boolean;
	onChangeView: (viewId: string) => void;
	onForceView: (viewId: string) => void;
	/**
	 * MarkdownPreviewView-specific: whether it should render its own inline
	 * "front matter hidden" notice. Defaults to true; hosts with their own
	 * toolbar (e.g. the skill editor's FileEditPane) pass false and show an
	 * equivalent hint there instead, so the two don't duplicate. Other views
	 * ignore this.
	 */
	showFrontMatterNote?: boolean;
	/**
	 * Rendered inside another surface (the Changes pane's binary preview)
	 * rather than filling its own pane: views drop pane-level chrome and
	 * gestures that would fight the host's scrolling. Defaults to false.
	 */
	embedded?: boolean;
}

export function resolveViewLabel(view: FileView, filePath: string): string {
	return i18n._(
		typeof view.label === "function" ? view.label(filePath) : view.label,
	);
}
