import Editor, { type OnMount } from "@monaco-editor/react";
import type * as Monaco from "monaco-editor";
import { type MutableRefObject, useCallback, useEffect, useRef } from "react";
import { LuLoader } from "react-icons/lu";
import { MarkdownRenderer } from "renderer/components/MarkdownRenderer";
import {
	MONACO_EDITOR_OPTIONS,
	registerSaveAction,
	SUPERSET_THEME,
	useMonacoReady,
} from "renderer/contexts/MonacoProvider";
import { detectLanguage } from "shared/detect-language";
import type { FileViewerMode } from "shared/tabs-types";
import { DiffViewer } from "../../../../../ChangesContent/components/DiffViewer";

interface RawFileData {
	ok: true;
	content: string;
}

interface RawFileError {
	ok: false;
	reason:
		| "too-large"
		| "binary"
		| "outside-worktree"
		| "symlink-escape"
		| "not-found";
}

type RawFileResult = RawFileData | RawFileError | undefined;

interface DiffData {
	original: string;
	modified: string;
	language: string;
}

interface FileViewerContentProps {
	viewMode: FileViewerMode;
	filePath: string;
	isLoadingRaw: boolean;
	isLoadingDiff: boolean;
	rawFileData: RawFileResult;
	diffData: DiffData | undefined;
	isDiffEditable: boolean;
	editorRef: MutableRefObject<Monaco.editor.IStandaloneCodeEditor | null>;
	originalContentRef: MutableRefObject<string>;
	draftContentRef: MutableRefObject<string | null>;
	initialLine?: number;
	initialColumn?: number;
	onSaveRaw: () => Promise<void>;
	onSaveDiff?: (content: string) => Promise<void>;
	onEditorChange: (value: string | undefined) => void;
	onDiffChange?: (content: string) => void;
	setIsDirty: (dirty: boolean) => void;
}

export function FileViewerContent({
	viewMode,
	filePath,
	isLoadingRaw,
	isLoadingDiff,
	rawFileData,
	diffData,
	isDiffEditable,
	editorRef,
	originalContentRef,
	draftContentRef,
	initialLine,
	initialColumn,
	onSaveRaw,
	onSaveDiff,
	onEditorChange,
	onDiffChange,
	setIsDirty,
}: FileViewerContentProps) {
	const isMonacoReady = useMonacoReady();
	const hasAppliedInitialLocationRef = useRef(false);

	// biome-ignore lint/correctness/useExhaustiveDependencies: Reset on file change only
	useEffect(() => {
		hasAppliedInitialLocationRef.current = false;
	}, [filePath]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: Only reset when coordinates change
	useEffect(() => {
		hasAppliedInitialLocationRef.current = false;
	}, [initialLine, initialColumn]);

	const handleEditorMount: OnMount = useCallback(
		(editor) => {
			editorRef.current = editor;
			if (!draftContentRef.current) {
				originalContentRef.current = editor.getValue();
			}
			setIsDirty(editor.getValue() !== originalContentRef.current);
			registerSaveAction(editor, onSaveRaw);
		},
		[onSaveRaw, editorRef, originalContentRef, draftContentRef, setIsDirty],
	);

	useEffect(() => {
		if (
			viewMode !== "raw" ||
			!editorRef.current ||
			!initialLine ||
			hasAppliedInitialLocationRef.current ||
			isLoadingRaw ||
			!rawFileData?.ok
		) {
			return;
		}

		const editor = editorRef.current;
		const model = editor.getModel();
		if (!model) return;

		const lineCount = model.getLineCount();
		const safeLine = Math.max(1, Math.min(initialLine, lineCount));
		const maxColumn = model.getLineMaxColumn(safeLine);
		const safeColumn = Math.max(1, Math.min(initialColumn ?? 1, maxColumn));

		const position = { lineNumber: safeLine, column: safeColumn };
		editor.setPosition(position);
		editor.revealPositionInCenter(position);
		editor.focus();

		hasAppliedInitialLocationRef.current = true;
	}, [
		viewMode,
		initialLine,
		initialColumn,
		isLoadingRaw,
		rawFileData,
		editorRef,
	]);

	if (viewMode === "diff") {
		if (isLoadingDiff) {
			return (
				<div className="flex items-center justify-center h-full text-muted-foreground">
					Loading diff...
				</div>
			);
		}
		if (!diffData) {
			return (
				<div className="flex items-center justify-center h-full text-muted-foreground">
					No diff available
				</div>
			);
		}
		return (
			<DiffViewer
				key={filePath}
				contents={{
					original: diffData.original,
					modified: diffData.modified,
					language: diffData.language,
				}}
				viewMode="inline"
				filePath={filePath}
				editable={isDiffEditable}
				onSave={isDiffEditable ? onSaveDiff : undefined}
				onChange={isDiffEditable ? onDiffChange : undefined}
			/>
		);
	}

	if (isLoadingRaw) {
		return (
			<div className="flex items-center justify-center h-full text-muted-foreground">
				Loading...
			</div>
		);
	}

	if (!rawFileData?.ok) {
		const errorMessage =
			rawFileData?.reason === "too-large"
				? "File is too large to preview"
				: rawFileData?.reason === "binary"
					? "Binary file preview not supported"
					: rawFileData?.reason === "outside-worktree"
						? "File is outside worktree"
						: rawFileData?.reason === "symlink-escape"
							? "File is a symlink pointing outside worktree"
							: "File not found";
		return (
			<div className="flex items-center justify-center h-full text-muted-foreground">
				{errorMessage}
			</div>
		);
	}

	if (viewMode === "rendered") {
		return (
			<div className="p-4 overflow-auto h-full">
				<MarkdownRenderer content={rawFileData.content} />
			</div>
		);
	}

	if (!isMonacoReady) {
		return (
			<div className="flex items-center justify-center h-full text-muted-foreground">
				<LuLoader className="w-4 h-4 animate-spin mr-2" />
				<span>Loading editor...</span>
			</div>
		);
	}

	return (
		<Editor
			key={filePath}
			height="100%"
			language={detectLanguage(filePath)}
			value={draftContentRef.current ?? rawFileData.content}
			theme={SUPERSET_THEME}
			onMount={handleEditorMount}
			onChange={onEditorChange}
			loading={
				<div className="flex items-center justify-center h-full text-muted-foreground">
					<LuLoader className="w-4 h-4 animate-spin mr-2" />
					<span>Loading editor...</span>
				</div>
			}
			options={MONACO_EDITOR_OPTIONS}
		/>
	);
}
