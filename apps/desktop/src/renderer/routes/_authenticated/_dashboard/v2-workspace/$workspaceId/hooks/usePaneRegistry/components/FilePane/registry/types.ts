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
	isActive: boolean;
	onChangeView: (viewId: string) => void;
	onForceView: (viewId: string) => void;
	/** New-terminal-session launcher, forwarded from usePaneRegistry through
	 *  FilePane. Optional and additive so non-code renderers (ImageView,
	 *  MarkdownPreviewView, …) ignore it and stay source-compatible; only
	 *  CodeView consumes it (for "Send selection to agent" → new session). */
	onCreateNewAgentSession?: (input: {
		configId: string;
		placement: "split-pane" | "new-tab";
		prompt: string;
	}) => Promise<{ terminalId: string } | null>;
}

export function resolveViewLabel(view: FileView, filePath: string): string {
	return typeof view.label === "function" ? view.label(filePath) : view.label;
}
