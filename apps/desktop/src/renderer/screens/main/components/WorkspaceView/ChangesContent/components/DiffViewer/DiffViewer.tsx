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

const REVERT_GLYPH_CLASS = "diff-revert-glyph";

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
	const glyphDecorationsRef = useRef<string[]>([]);
	const mouseDownListenerRef = useRef<Monaco.IDisposable | null>(null);
	const lineChangesMapRef = useRef<Map<number, Monaco.editor.ILineChange>>(
		new Map(),
	);

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

	const updateGlyphDecorations = useCallback(
		(
			editor: Monaco.editor.IStandaloneDiffEditor,
			modifiedEditor: Monaco.editor.IStandaloneCodeEditor,
		) => {
			const lineChanges = editor.getLineChanges();
			if (!lineChanges) return;

			lineChangesMapRef.current.clear();

			const decorations: Monaco.editor.IModelDeltaDecoration[] = [];

			for (const change of lineChanges) {
				const startLine =
					change.modifiedStartLineNumber > 0
						? change.modifiedStartLineNumber
						: change.modifiedEndLineNumber;

				if (startLine > 0) {
					lineChangesMapRef.current.set(startLine, change);
					decorations.push({
						range: {
							startLineNumber: startLine,
							startColumn: 1,
							endLineNumber: startLine,
							endColumn: 1,
						},
						options: {
							glyphMarginClassName: REVERT_GLYPH_CLASS,
							glyphMarginHoverMessage: { value: "Revert this change" },
						},
					});
				}
			}

			glyphDecorationsRef.current = modifiedEditor.deltaDecorations(
				glyphDecorationsRef.current,
				decorations,
			);
		},
		[],
	);

	const handleGlyphClick = useCallback(
		(
			e: Monaco.editor.IEditorMouseEvent,
			diffEditor: Monaco.editor.IStandaloneDiffEditor,
		) => {
			if (e.target.type !== 2) return; // 2 = GUTTER_GLYPH_MARGIN

			const lineNumber = e.target.position?.lineNumber;
			if (!lineNumber) return;

			const lineChange = lineChangesMapRef.current.get(lineNumber);
			if (!lineChange) return;

			// Use Monaco's internal revert method if available
			const editorAny = diffEditor as unknown as {
				revert?: (diff: unknown) => void;
			};
			if (typeof editorAny.revert === "function") {
				// Try to find the LineRangeMapping for this change
				const diffState = (
					diffEditor as unknown as {
						_diffModel?: {
							get?: () => {
								diff?: {
									get?: () => {
										mappings?: Array<{ lineRangeMapping: unknown }>;
									};
								};
							};
						};
					}
				)._diffModel
					?.get?.()
					?.diff?.get?.();
				if (diffState?.mappings) {
					const mapping = diffState.mappings.find((m) => {
						const modified = (
							m.lineRangeMapping as { modified?: { startLineNumber?: number } }
						).modified;
						return (
							modified?.startLineNumber ===
								lineChange.modifiedStartLineNumber ||
							(lineChange.modifiedStartLineNumber === 0 &&
								modified?.startLineNumber ===
									lineChange.modifiedEndLineNumber + 1)
						);
					});
					if (mapping) {
						editorAny.revert(mapping.lineRangeMapping);
						return;
					}
				}
			}

			// Fallback: replicate Monaco's revert behavior using executeEdits with undo stops
			const originalModel = diffEditor.getOriginalEditor().getModel();
			const modifiedEditor = diffEditor.getModifiedEditor();
			const modifiedModel = modifiedEditor.getModel();
			if (!originalModel || !modifiedModel) return;

			// Get the original content for this change
			let originalContent = "";
			if (
				lineChange.originalStartLineNumber > 0 &&
				lineChange.originalEndLineNumber >= lineChange.originalStartLineNumber
			) {
				originalContent = originalModel.getValueInRange({
					startLineNumber: lineChange.originalStartLineNumber,
					startColumn: 1,
					endLineNumber: lineChange.originalEndLineNumber,
					endColumn: originalModel.getLineMaxColumn(
						lineChange.originalEndLineNumber,
					),
				});
			}

			// Determine the range to replace in the modified model
			const modifiedStartLine = lineChange.modifiedStartLineNumber;
			const modifiedEndLine = lineChange.modifiedEndLineNumber;

			let replaceRange: Monaco.IRange;
			if (modifiedStartLine === 0 || modifiedEndLine < modifiedStartLine) {
				// This is a pure deletion in modified (content was added in original)
				// Insert after the previous line
				const insertLine = modifiedEndLine > 0 ? modifiedEndLine : 1;
				const insertColumn = modifiedModel.getLineMaxColumn(insertLine);
				replaceRange = {
					startLineNumber: insertLine,
					startColumn: insertColumn,
					endLineNumber: insertLine,
					endColumn: insertColumn,
				};
				// Prepend newline since we're inserting
				originalContent = `\n${originalContent}`;
			} else {
				// Replace the modified range with original content
				replaceRange = {
					startLineNumber: modifiedStartLine,
					startColumn: 1,
					endLineNumber: modifiedEndLine,
					endColumn: modifiedModel.getLineMaxColumn(modifiedEndLine),
				};
			}

			// Apply the edit using Monaco's pattern: pushUndoStop, executeEdits, pushUndoStop
			modifiedEditor.pushUndoStop();
			modifiedEditor.executeEdits("diffEditor", [
				{ range: replaceRange, text: originalContent },
			]);
			modifiedEditor.pushUndoStop();
		},
		[],
	);

	const handleMount: DiffOnMount = useCallback(
		(editor) => {
			diffEditorRef.current = editor;
			const originalEditor = editor.getOriginalEditor();
			const modifiedEditor = editor.getModifiedEditor();
			modifiedEditorRef.current = modifiedEditor;

			registerCopyPathLineAction(originalEditor, filePath);
			registerCopyPathLineAction(modifiedEditor, filePath);

			// Set up glyph margin click handler for revert
			mouseDownListenerRef.current?.dispose();
			mouseDownListenerRef.current = modifiedEditor.onMouseDown((e) => {
				handleGlyphClick(e, editor);
			});

			diffUpdateListenerRef.current?.dispose();
			diffUpdateListenerRef.current = editor.onDidUpdateDiff(() => {
				if (!hasScrolledToFirstDiffRef.current) {
					scrollToFirstDiff(editor, modifiedEditor);
					hasScrolledToFirstDiffRef.current = true;
				}
				// Update glyph decorations when diff changes
				updateGlyphDecorations(editor, modifiedEditor);
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
		[filePath, fitContent, handleGlyphClick, updateGlyphDecorations],
	);

	useEffect(() => {
		return () => {
			diffUpdateListenerRef.current?.dispose();
			diffUpdateListenerRef.current = null;
			mouseDownListenerRef.current?.dispose();
			mouseDownListenerRef.current = null;
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

	const editorHeight = fitContent && contentHeight ? contentHeight : "100%";

	const diffEditor = (
		<DiffEditor
			key={`${filePath}-${viewMode}-${hideUnchangedRegions}`}
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
				renderSideBySide: viewMode === "side-by-side",
				useInlineViewWhenSpaceIsLimited: false,
				readOnly: !editable,
				originalEditable: false,
				renderOverviewRuler: !fitContent,
				glyphMargin: true,
				diffWordWrap: "on",
				contextmenu: !contextMenuProps, // Disable Monaco's context menu if we have custom props
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

	// If no context menu props, return plain editor
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
