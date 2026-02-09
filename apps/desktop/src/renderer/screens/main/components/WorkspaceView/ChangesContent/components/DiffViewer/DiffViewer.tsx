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
} from "../../../ContentView/components/EditorContextMenu";
import { getLineNumbersMinChars } from "./utils";

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
	hideUnchangedRegions?: boolean;
	filePath: string;
	editable?: boolean;
	onSave?: (content: string) => void;
	onChange?: (content: string) => void;
	contextMenuProps?: DiffViewerContextMenuProps;
	captureScroll?: boolean;
	fitContent?: boolean;
}

export function DiffViewer({
	contents,
	viewMode,
	hideUnchangedRegions = false,
	filePath,
	editable = false,
	onSave,
	onChange,
	contextMenuProps,
	captureScroll = true,
	fitContent = false,
}: DiffViewerProps) {
	const isMonacoReady = useMonacoReady();
	const diffEditorRef = useRef<Monaco.editor.IStandaloneDiffEditor | null>(
		null,
	);
	const modifiedEditorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(
		null,
	);
	const [isEditorMounted, setIsEditorMounted] = useState(false);
	const [isFocused, setIsFocused] = useState(false);
	const [contentHeight, setContentHeight] = useState<number | null>(null);
	const hasScrolledToFirstDiffRef = useRef(false);
	const containerRef = useRef<HTMLDivElement>(null);

	const contentSizeListenersRef = useRef<Monaco.IDisposable[]>([]);

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
				if (!hasScrolledToFirstDiffRef.current) {
					scrollToFirstDiff(editor, modifiedEditor);
					hasScrolledToFirstDiffRef.current = true;
				}
			});

			if (fitContent) {
				contentSizeListenersRef.current.forEach((d) => {
					d.dispose();
				});
				contentSizeListenersRef.current = [];

				const updateHeight = () => {
					const modHeight = modifiedEditor.getContentHeight();
					const origHeight = originalEditor.getContentHeight();
					setContentHeight(Math.max(modHeight, origHeight));
				};

				contentSizeListenersRef.current.push(
					modifiedEditor.onDidContentSizeChange(updateHeight),
					originalEditor.onDidContentSizeChange(updateHeight),
				);

				requestAnimationFrame(updateHeight);
			}

			setIsEditorMounted(true);
		},
		[filePath, fitContent],
	);

	useEffect(() => {
		return () => {
			diffUpdateListenerRef.current?.dispose();
			diffUpdateListenerRef.current = null;
			contentSizeListenersRef.current.forEach((d) => {
				d.dispose();
			});
			contentSizeListenersRef.current = [];
		};
	}, []);

	useEffect(() => {
		if (captureScroll) return;
		if (!isEditorMounted || !diffEditorRef.current) return;

		const originalEditor = diffEditorRef.current.getOriginalEditor();
		const modifiedEditor = diffEditorRef.current.getModifiedEditor();

		const scrollOptions = {
			scrollbar: { handleMouseWheel: isFocused },
		};

		originalEditor.updateOptions(scrollOptions);
		modifiedEditor.updateOptions(scrollOptions);
	}, [captureScroll, isEditorMounted, isFocused]);

	const handleFocus = useCallback(() => {
		if (!captureScroll) {
			setIsFocused(true);
		}
	}, [captureScroll]);

	const handleBlur = useCallback(
		(e: React.FocusEvent) => {
			if (!captureScroll && containerRef.current) {
				if (!containerRef.current.contains(e.relatedTarget as Node)) {
					setIsFocused(false);
				}
			}
		},
		[captureScroll],
	);

	useEffect(() => {
		if (!isEditorMounted || !modifiedEditorRef.current) return;

		modifiedEditorRef.current.updateOptions({ readOnly: !editable });

		if (editable) {
			registerSaveAction(modifiedEditorRef.current, handleSave);
		}
	}, [isEditorMounted, editable, handleSave]);

	useEffect(() => {
		if (!isEditorMounted || !modifiedEditorRef.current || !onChange) return;

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

	const getEditor = useCallback(() => {
		return (
			modifiedEditorRef.current || diffEditorRef.current?.getOriginalEditor()
		);
	}, []);

	const editorActions = useEditorActions({
		getEditor,
		filePath,
		editable: false,
	});

	useEffect(() => {
		if (!diffEditorRef.current) return;
		diffEditorRef.current.updateOptions({
			renderSideBySide: viewMode === "side-by-side",
			hideUnchangedRegions: { enabled: hideUnchangedRegions },
		});
	}, [viewMode, hideUnchangedRegions]);

	if (!isMonacoReady) {
		return (
			<div className="flex items-center justify-center h-full text-muted-foreground">
				<LuLoader className="w-4 h-4 animate-spin mr-2" />
				<span>Loading editor...</span>
			</div>
		);
	}

	const editorHeight = fitContent && contentHeight ? contentHeight : "100%";

	const diffEditor = (
		<DiffEditor
			key={filePath}
			height={editorHeight}
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
				lineNumbersMinChars: getLineNumbersMinChars(
					contents.original,
					contents.modified,
				),
				renderSideBySide: viewMode === "side-by-side",
				useInlineViewWhenSpaceIsLimited: false,
				readOnly: !editable,
				originalEditable: false,
				renderOverviewRuler: !fitContent,
				glyphMargin: false,
				diffWordWrap: "on",
				contextmenu: !contextMenuProps,
				renderIndicators: false,
				hideUnchangedRegions: {
					enabled: hideUnchangedRegions,
				},
				scrollbar: {
					handleMouseWheel: captureScroll,
					vertical: fitContent ? "hidden" : "auto",
					horizontal: fitContent ? "hidden" : "auto",
				},
				scrollBeyondLastLine: !fitContent,
			}}
		/>
	);

	if (!contextMenuProps) {
		return (
			// biome-ignore lint/a11y/noStaticElementInteractions: focus/blur tracking for scroll behavior
			<div
				ref={containerRef}
				className="h-full w-full"
				onFocus={handleFocus}
				onBlur={handleBlur}
			>
				{diffEditor}
			</div>
		);
	}

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
			{/* biome-ignore lint/a11y/noStaticElementInteractions: focus/blur tracking for scroll behavior */}
			<div
				ref={containerRef}
				className="h-full w-full"
				onFocus={handleFocus}
				onBlur={handleBlur}
			>
				{diffEditor}
			</div>
		</EditorContextMenu>
	);
}
