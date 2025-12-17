import { DiffEditor, type DiffOnMount } from "@monaco-editor/react";
import { useCallback, useRef } from "react";
import { monaco, SUPERSET_THEME } from "renderer/contexts/MonacoProvider";
import type { DiffViewMode, FileContents } from "shared/changes-types";

interface DiffViewerProps {
	contents: FileContents;
	viewMode: DiffViewMode;
	editable?: boolean;
	onSave?: (content: string) => void;
}

export function DiffViewer({
	contents,
	viewMode,
	editable = false,
	onSave,
}: DiffViewerProps) {
	const modifiedEditorRef = useRef<ReturnType<
		NonNullable<Parameters<DiffOnMount>[0]["getModifiedEditor"]>
	> | null>(null);

	const handleSave = useCallback(() => {
		if (!editable || !onSave || !modifiedEditorRef.current) return;
		const content = modifiedEditorRef.current.getValue();
		onSave(content);
	}, [editable, onSave]);

	const handleMount: DiffOnMount = useCallback(
		(editor) => {
			modifiedEditorRef.current = editor.getModifiedEditor();

			if (editable && modifiedEditorRef.current) {
				modifiedEditorRef.current.addCommand(
					monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS,
					handleSave,
				);
			}
		},
		[editable, handleSave],
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
