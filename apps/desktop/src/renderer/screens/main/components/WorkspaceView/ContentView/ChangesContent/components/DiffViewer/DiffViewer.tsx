import { DiffEditor, type DiffOnMount } from "@monaco-editor/react";
import type * as Monaco from "monaco-editor";
import { useCallback, useEffect, useRef, useState } from "react";
import { LuLoader } from "react-icons/lu";
import {
	MONACO_EDITOR_OPTIONS,
	registerSaveAction,
	SUPERSET_THEME,
	useMonacoReady,
} from "renderer/contexts/MonacoProvider";
import type { DiffViewMode, FileContents } from "shared/changes-types";
import { registerCopyPathLineAction } from "./editor-actions";

interface DiffViewerProps {
	contents: FileContents;
	viewMode: DiffViewMode;
	filePath: string;
	editable?: boolean;
	onSave?: (content: string) => void;
	onChange?: (content: string) => void;
}

export function DiffViewer({
	contents,
	viewMode,
	filePath,
	editable = false,
	onSave,
	onChange,
}: DiffViewerProps) {
	const isMonacoReady = useMonacoReady();
	const modifiedEditorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(
		null,
	);
	// Track when editor is mounted to trigger effects at the right time
	const [isEditorMounted, setIsEditorMounted] = useState(false);

	const handleSave = useCallback(() => {
		if (!editable || !onSave || !modifiedEditorRef.current) return;
		onSave(modifiedEditorRef.current.getValue());
	}, [editable, onSave]);

	// Store disposable for content change listener cleanup
	const changeListenerRef = useRef<Monaco.IDisposable | null>(null);

	const handleMount: DiffOnMount = useCallback(
		(editor) => {
			const originalEditor = editor.getOriginalEditor();
			const modifiedEditor = editor.getModifiedEditor();
			modifiedEditorRef.current = modifiedEditor;

			registerCopyPathLineAction(originalEditor, filePath);
			registerCopyPathLineAction(modifiedEditor, filePath);

			setIsEditorMounted(true);
		},
		[filePath],
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

	if (!isMonacoReady) {
		return (
			<div className="flex items-center justify-center h-full text-muted-foreground">
				<LuLoader className="w-4 h-4 animate-spin mr-2" />
				<span>Loading editor...</span>
			</div>
		);
	}

	return (
		<div className="h-full w-full">
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
					renderOverviewRuler: false,
					diffWordWrap: "on",
				}}
			/>
		</div>
	);
}
