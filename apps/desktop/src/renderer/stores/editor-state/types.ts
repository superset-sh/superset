import type { AddFileViewerPaneOptions } from "renderer/stores/tabs/types";
import type { ChangeCategory } from "shared/changes-types";
import type { FileViewerMode } from "shared/tabs-types";

export type EditorDocumentStatus = "loading" | "ready" | "saving" | "conflict";

export type EditorDialogState = "none" | "unsaved" | "conflict";

export interface EditorDocumentState {
	documentKey: string;
	workspaceId: string;
	filePath: string;
	status: EditorDocumentStatus;
	dirty: boolean;
	baselineRevision: string | null;
	hasExternalDiskChange: boolean;
	conflict: { diskContent: string | null } | null;
	contentVersion: number;
	isEditable: boolean;
	sessionPaneIds: string[];
}

export type EditorPendingIntent =
	| { type: "close-pane" }
	| { type: "close-tab"; tabId: string }
	| { type: "change-view-mode"; nextMode: FileViewerMode }
	| {
			type: "replace-preview";
			workspaceId: string;
			options: AddFileViewerPaneOptions;
	  }
	| { type: "quit-app" };

export interface EditorSessionMeta {
	paneId: string;
	documentKey: string;
	generation: number;
	pendingIntent: EditorPendingIntent | null;
	autoPinnedBecauseDirty: boolean;
	dialog: EditorDialogState;
}

export interface PendingTabCloseState {
	workspaceId: string;
	tabId: string;
	paneIds: string[];
	documentKeys: string[];
	isSaving: boolean;
}

export type EditorSaveResult =
	| { status: "saved" }
	| {
			status: "conflict";
			currentContent: string | null;
	  };

export interface FileViewerDocumentIdentity {
	workspaceId: string;
	filePath: string;
	diffCategory?: ChangeCategory;
	commitHash?: string;
	oldPath?: string;
}

export function resolveEditorDocumentScope(
	diffCategory?: ChangeCategory,
): "working" | "against-base" | "committed" | "staged" {
	if (!diffCategory || diffCategory === "unstaged") {
		return "working";
	}

	return diffCategory;
}

export function isEditableFileViewerDocument({
	filePath,
	diffCategory,
}: Pick<FileViewerDocumentIdentity, "filePath" | "diffCategory">): boolean {
	if (
		filePath.startsWith("https://") ||
		filePath.startsWith("http://") ||
		filePath.length === 0
	) {
		return false;
	}

	return resolveEditorDocumentScope(diffCategory) === "working";
}

function encodeDocumentKeyPart(value: string | null | undefined): string {
	return encodeURIComponent(value ?? "");
}

export function buildEditorDocumentKey({
	workspaceId,
	filePath,
	diffCategory,
	commitHash,
	oldPath,
}: FileViewerDocumentIdentity): string {
	const scope = resolveEditorDocumentScope(diffCategory);

	if (scope === "working") {
		return [
			encodeDocumentKeyPart(workspaceId),
			encodeDocumentKeyPart(scope),
			encodeDocumentKeyPart(filePath),
		].join("::");
	}

	return [
		encodeDocumentKeyPart(workspaceId),
		encodeDocumentKeyPart(scope),
		encodeDocumentKeyPart(commitHash),
		encodeDocumentKeyPart(oldPath),
		encodeDocumentKeyPart(filePath),
	].join("::");
}
