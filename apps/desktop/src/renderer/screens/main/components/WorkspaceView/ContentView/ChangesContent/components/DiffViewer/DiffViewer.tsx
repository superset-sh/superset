import { DiffEditor, type DiffOnMount } from "@monaco-editor/react";
import type * as Monaco from "monaco-editor";
import { useCallback, useRef } from "react";
import { SUPERSET_THEME } from "renderer/contexts/MonacoProvider";
import type { DiffViewMode, FileContents } from "shared/changes-types";
import {
	registerCopyPathLineAction,
	registerSaveCommand,
} from "./editor-actions";

interface DiffViewerProps {
	contents: FileContents;
	viewMode: DiffViewMode;
	filePath: string;
	editable?: boolean;
	onSave?: (content: string) => void;
}

export function DiffViewer({
	contents,
	viewMode,
	filePath,
	editable = false,
	onSave,
}: DiffViewerProps) {
	const modifiedEditorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(
		null,
	);

	const handleSave = useCallback(() => {
		if (!editable || !onSave || !modifiedEditorRef.current) return;
		onSave(modifiedEditorRef.current.getValue());
	}, [editable, onSave]);

	const handleMount: DiffOnMount = useCallback(
		(editor) => {
			const originalEditor = editor.getOriginalEditor();
			const modifiedEditor = editor.getModifiedEditor();
			modifiedEditorRef.current = modifiedEditor;

			registerCopyPathLineAction(originalEditor, filePath);
			registerCopyPathLineAction(modifiedEditor, filePath);

			if (editable) {
				registerSaveCommand(modifiedEditor, handleSave);
			}
		},
		[editable, handleSave, filePath],
	);

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
						Loading editor...
					</div>
				}
				options={{
					renderSideBySide: viewMode === "side-by-side",
					readOnly: !editable,
					originalEditable: false,
					minimap: { enabled: false },
					scrollBeyondLastLine: false,
					renderOverviewRuler: false,
					wordWrap: "on",
					diffWordWrap: "on",
					fontSize: 13,
					lineHeight: 20,
					fontFamily:
						"ui-monospace, SFMono-Regular, SF Mono, Menlo, Consolas, Liberation Mono, monospace",
					padding: { top: 8, bottom: 8 },
					scrollbar: {
						verticalScrollbarSize: 8,
						horizontalScrollbarSize: 8,
					},
				}}
			/>
		</div>
	);
}
