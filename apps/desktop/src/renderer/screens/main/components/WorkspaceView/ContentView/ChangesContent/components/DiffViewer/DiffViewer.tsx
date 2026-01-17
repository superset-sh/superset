import { DiffEditor, type DiffOnMount } from "@monaco-editor/react";
import type * as Monaco from "monaco-editor";
import { useCallback, useEffect, useRef, useState } from "react";
import { LuLoader } from "react-icons/lu";
import {
	MONACO_EDITOR_OPTIONS,
	registerSaveAction,
	SUPERSET_THEME,
	useMonacoReady,
} from "renderer/providers/MonacoProvider";
import type { Tab } from "renderer/stores/tabs/types";
import type { DiffViewMode, FileContents } from "shared/changes-types";
import {
	EditorContextMenu,
	type PaneActions,
	registerCopyPathLineAction,
	useEditorActions,
} from "../../../components/EditorContextMenu";

function scrollToFirstDiff(
	editor: Monaco.editor.IStandaloneDiffEditor,
	modifiedEditor: Monaco.editor.IStandaloneCodeEditor,
) {
	const lineChanges = editor.getLineChanges();
	if (!lineChanges || lineChanges.length === 0) return;

	const firstChange = lineChanges[0];
	const targetLine =
		firstChange.modifiedStartLineNumber > 0
			? firstChange.modifiedStartLineNumber
			: firstChange.originalStartLineNumber;

	if (targetLine > 0) {
		modifiedEditor.revealLineInCenter(targetLine);
	}
}

export interface DiffViewerContextMenuProps {
	onSplitHorizontal: () => void;
	onSplitVertical: () => void;
	onClosePane: () => void;
	currentTabId: string;
	availableTabs: Tab[];
	onMoveToTab: (tabId: string) => void;
	onMoveToNewTab: () => void;
}

interface DiffViewerProps {
	contents: FileContents;
	viewMode: DiffViewMode;
	filePath: string;
	editable?: boolean;
	onSave?: (content: string) => void;
	onChange?: (content: string) => void;
	// Optional context menu props - when provided, wraps editor with context menu
	contextMenuProps?: DiffViewerContextMenuProps;
}

export function DiffViewer({
	contents,
	viewMode,
	filePath,
	editable = false,
	onSave,
	onChange,
	contextMenuProps,
}: DiffViewerProps) {
	const isMonacoReady = useMonacoReady();
	const diffEditorRef = useRef<Monaco.editor.IStandaloneDiffEditor | null>(
		null,
	);
	const modifiedEditorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(
		null,
	);
	const [isEditorMounted, setIsEditorMounted] = useState(false);
	const hasScrolledToFirstDiffRef = useRef(false);

	useEffect(() => {
		if (!isMonacoReady) return;
		if (!isEditorMounted) return;

		requestAnimationFrame(() => {
			const modifiedEditor = modifiedEditorRef.current;
			if (modifiedEditor) {
				modifiedEditor.layout();
			}
		});
	}, [isMonacoReady, isEditorMounted]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: Reset on file change only
	useEffect(() => {
		hasScrolledToFirstDiffRef.current = false;
	}, [filePath]);

	const handleSave = useCallback(() => {
		if (!editable || !onSave || !modifiedEditorRef.current) return;
		onSave(modifiedEditorRef.current.getValue());
	}, [editable, onSave]);

	const changeListenerRef = useRef<Monaco.IDisposable | null>(null);
	const diffUpdateListenerRef = useRef<Monaco.IDisposable | null>(null);

	const handleMount: DiffOnMount = useCallback(
		(editor) => {
			diffEditorRef.current = editor;
			const originalEditor = editor.getOriginalEditor();
			const modifiedEditor = editor.getModifiedEditor();
			modifiedEditorRef.current = modifiedEditor;

			registerCopyPathLineAction(originalEditor, filePath);
			registerCopyPathLineAction(modifiedEditor, filePath);

			diffUpdateListenerRef.current?.dispose();
			diffUpdateListenerRef.current = editor.onDidUpdateDiff(() => {
				if (hasScrolledToFirstDiffRef.current) return;
				scrollToFirstDiff(editor, modifiedEditor);
				hasScrolledToFirstDiffRef.current = true;
			});

			setIsEditorMounted(true);
		},
		[filePath],
	);

	// Cleanup diff update listener on unmount
	useEffect(() => {
		return () => {
			diffUpdateListenerRef.current?.dispose();
			diffUpdateListenerRef.current = null;
		};
	}, []);

	// Update readOnly and register save action when editable changes or editor mounts
	// Using addAction with an ID allows replacing the action on subsequent calls
	useEffect(() => {
		if (!isEditorMounted || !modifiedEditorRef.current) return;

		modifiedEditorRef.current.updateOptions({ readOnly: !editable });

		if (editable) {
			registerSaveAction(modifiedEditorRef.current, handleSave);
		}
	}, [isEditorMounted, editable, handleSave]);

	// Set up content change listener for dirty tracking
	useEffect(() => {
		if (!isEditorMounted || !modifiedEditorRef.current || !onChange) return;

		// Clean up previous listener
		changeListenerRef.current?.dispose();

		changeListenerRef.current =
			modifiedEditorRef.current.onDidChangeModelContent(() => {
				if (modifiedEditorRef.current) {
					onChange(modifiedEditorRef.current.getValue());
				}
			});

		return () => {
			changeListenerRef.current?.dispose();
			changeListenerRef.current = null;
		};
	}, [isEditorMounted, onChange]);

	// Get the active editor (modified or original)
	const getEditor = useCallback(() => {
		return (
			modifiedEditorRef.current || diffEditorRef.current?.getOriginalEditor()
		);
	}, []);

	// Use shared editor actions hook - diff viewer is read-only (no cut/paste)
	const editorActions = useEditorActions({
		getEditor,
		filePath,
		editable: false,
	});

	if (!isMonacoReady) {
		return (
			<div className="flex items-center justify-center h-full text-muted-foreground">
				<LuLoader className="w-4 h-4 animate-spin mr-2" />
				<span>Loading editor...</span>
			</div>
		);
	}

	const diffEditor = (
		<DiffEditor
			height="100%"
			original={contents.original}
			modified={contents.modified}
			language={contents.language}
			theme={SUPERSET_THEME}
			onMount={handleMount}
			loading={
				<div className="flex items-center justify-center h-full text-muted-foreground">
					<LuLoader className="w-4 h-4 animate-spin mr-2" />
					<span>Loading editor...</span>
				</div>
			}
			options={{
				...MONACO_EDITOR_OPTIONS,
				renderSideBySide: viewMode === "side-by-side",
				readOnly: !editable,
				originalEditable: false,
				renderOverviewRuler: true,
				diffWordWrap: "on",
				contextmenu: !contextMenuProps, // Disable Monaco's context menu if we have custom props
			}}
		/>
	);

	// If no context menu props, return plain editor
	if (!contextMenuProps) {
		return <div className="h-full w-full">{diffEditor}</div>;
	}

	// Wrap with custom context menu
	const paneActions: PaneActions = {
		onSplitHorizontal: contextMenuProps.onSplitHorizontal,
		onSplitVertical: contextMenuProps.onSplitVertical,
		onClosePane: contextMenuProps.onClosePane,
		currentTabId: contextMenuProps.currentTabId,
		availableTabs: contextMenuProps.availableTabs,
		onMoveToTab: contextMenuProps.onMoveToTab,
		onMoveToNewTab: contextMenuProps.onMoveToNewTab,
	};

	return (
		<EditorContextMenu editorActions={editorActions} paneActions={paneActions}>
			<div className="h-full w-full">{diffEditor}</div>
		</EditorContextMenu>
	);
}
