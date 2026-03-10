/**
 * 공용 TipTap 에디터 모듈
 *
 * 사용:
 * import { TipTapEditor } from "@superbuilder/feature-ui/editor/tiptap-editor";
 * import { TipTapViewer } from "@superbuilder/feature-ui/editor/tiptap-viewer";
 * import { EditorToolbar } from "@superbuilder/feature-ui/editor/editor-toolbar";
 */
export { TipTapEditor } from "./tiptap-editor";
export { TipTapViewer } from "./tiptap-viewer";
export { EditorToolbar } from "./editor-toolbar";
export { createEditorExtensions, createViewerExtensions } from "./editor-extensions";
export type { TipTapContent, ToolbarVariant, EditorExtensionOptions } from "./types";
