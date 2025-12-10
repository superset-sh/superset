import { DiffEditor, loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import type { DiffViewMode, FileContents } from "shared/changes-types";

// Configure Monaco environment for Electron
// This sets up the web workers properly
self.MonacoEnvironment = {
	getWorker(_: unknown, _label: string) {
		return new editorWorker();
	},
};

// Configure Monaco to use the locally installed monaco-editor package
loader.config({ monaco });

interface DiffViewerProps {
	contents: FileContents;
	viewMode: DiffViewMode;
}

export function DiffViewer({ contents, viewMode }: DiffViewerProps) {
	return (
		<div className="h-full w-full">
			<DiffEditor
				height="100%"
				original={contents.original}
				modified={contents.modified}
				language={contents.language}
				theme="vs-dark"
				loading={
					<div className="flex items-center justify-center h-full text-muted-foreground">
						Loading editor...
					</div>
				}
				options={{
					renderSideBySide: viewMode === "side-by-side",
					readOnly: true,
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
