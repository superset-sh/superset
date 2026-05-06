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

export type FileViewLabel = string | ((filePath: string) => string);

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
	onChangeView: (viewId: string) => void;
	onForceView: (viewId: string) => void;
}

export function resolveViewLabel(view: FileView, filePath: string): string {
	return typeof view.label === "function" ? view.label(filePath) : view.label;
}
