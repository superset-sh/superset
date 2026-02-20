import Editor, { type OnMount } from "@monaco-editor/react";
import type * as Monaco from "monaco-editor";
import { useParams } from "@tanstack/react-router";
import { type MutableRefObject, useCallback, useEffect, useRef } from "react";
import { LuLoader } from "react-icons/lu";
import { usePRComments } from "renderer/screens/main/hooks";
import { MarkdownRenderer } from "renderer/components/MarkdownRenderer";
import {
	registerSaveAction,
	SUPERSET_THEME,
	useMonacoEditorOptions,
	useMonacoReady,
} from "renderer/providers/MonacoProvider";
import type { Tab } from "renderer/stores/tabs/types";
import type { DiffViewMode } from "shared/changes-types";
import { detectLanguage } from "shared/detect-language";
import { isImageFile } from "shared/file-types";
import type { FileViewerMode } from "shared/tabs-types";
import { DiffViewer } from "../../../../../../ChangesContent/components/DiffViewer";
import { LightDiffViewer } from "../../../../../../ChangesContent/components/LightDiffViewer";
import { registerCopyPathLineAction } from "../../../../../components/EditorContextMenu";
import { FileEditorContextMenu } from "../FileEditorContextMenu";

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

interface ImageData {
	ok: true;
	dataUrl: string;
	byteLength: number;
}

interface ImageError {
	ok: false;
	reason:
		| "too-large"
		| "not-image"
		| "outside-worktree"
		| "symlink-escape"
		| "not-found";
}

type ImageResult = ImageData | ImageError | undefined;

interface DiffData {
	original: string;
	modified: string;
	language: string;
}

interface FileViewerContentProps {
	viewMode: FileViewerMode;
	filePath: string;
	isLoadingRaw: boolean;
	isLoadingImage?: boolean;
	isLoadingDiff: boolean;
	rawFileData: RawFileResult;
	imageData?: ImageResult;
	diffData: DiffData | undefined;
	isDiffEditable: boolean;
	editorRef: MutableRefObject<Monaco.editor.IStandaloneCodeEditor | null>;
	originalContentRef: MutableRefObject<string>;
	draftContentRef: MutableRefObject<string | null>;
	initialLine?: number;
	initialColumn?: number;
	diffViewMode: DiffViewMode;
	hideUnchangedRegions: boolean;
	onSaveRaw: () => Promise<void>;
	onSaveDiff?: (content: string) => Promise<void>;
	onEditorChange: (value: string | undefined) => void;
	onDiffChange?: (content: string) => void;
	setIsDirty: (dirty: boolean) => void;
	// Context menu props
	onSplitHorizontal: () => void;
	onSplitVertical: () => void;
	onClosePane: () => void;
	currentTabId: string;
	availableTabs: Tab[];
	onMoveToTab: (tabId: string) => void;
	onMoveToNewTab: () => void;
}

export function FileViewerContent({
	viewMode,
	filePath,
	isLoadingRaw,
	isLoadingImage,
	isLoadingDiff,
	rawFileData,
	imageData,
	diffData,
	isDiffEditable,
	editorRef,
	originalContentRef,
	draftContentRef,
	initialLine,
	initialColumn,
	diffViewMode,
	hideUnchangedRegions,
	onSaveRaw,
	onSaveDiff,
	onEditorChange,
	onDiffChange,
	setIsDirty,
	// Context menu props
	onSplitHorizontal,
	onSplitVertical,
	onClosePane,
	currentTabId,
	availableTabs,
	onMoveToTab,
	onMoveToNewTab,
}: FileViewerContentProps) {
	const { workspaceId } = useParams({ strict: false });
	const { commentsByFile } = usePRComments({ workspaceId });
	const commentThreads = filePath ? commentsByFile.get(filePath) : undefined;

	const isImage = isImageFile(filePath);
	const isMonacoReady = useMonacoReady();
	const monacoEditorOptions = useMonacoEditorOptions();
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
			registerCopyPathLineAction(editor, filePath);
		},
		[
			onSaveRaw,
			editorRef,
			originalContentRef,
			draftContentRef,
			setIsDirty,
			filePath,
		],
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
		if (isDiffEditable) {
			return (
				<DiffViewer
					key={filePath}
					contents={{
						original: diffData.original,
						modified: diffData.modified,
						language: diffData.language,
					}}
					viewMode={diffViewMode}
					hideUnchangedRegions={hideUnchangedRegions}
					filePath={filePath}
					editable
					onSave={onSaveDiff}
					onChange={onDiffChange}
					contextMenuProps={{
						onSplitHorizontal,
						onSplitVertical,
						onClosePane,
						currentTabId,
						availableTabs,
						onMoveToTab,
						onMoveToNewTab,
					}}
				/>
			);
		}
		return (
			<LightDiffViewer
				key={filePath}
				contents={diffData}
				viewMode={diffViewMode}
				hideUnchangedRegions={hideUnchangedRegions}
				filePath={filePath}
				commentThreads={commentThreads}
			/>
		);
	}

	// Handle image files in rendered mode
	if (viewMode === "rendered" && isImage) {
		if (isLoadingImage) {
			return (
				<div className="flex items-center justify-center h-full text-muted-foreground">
					<LuLoader className="w-4 h-4 animate-spin mr-2" />
					<span>Loading image...</span>
				</div>
			);
		}

		if (!imageData?.ok) {
			const errorMessage =
				imageData?.reason === "too-large"
					? "Image is too large to preview (max 10MB)"
					: imageData?.reason === "outside-worktree"
						? "File is outside worktree"
						: imageData?.reason === "symlink-escape"
							? "File is a symlink pointing outside worktree"
							: imageData?.reason === "not-image"
								? "Not a supported image format"
								: "Image not found";
			return (
				<div className="flex items-center justify-center h-full text-muted-foreground">
					{errorMessage}
				</div>
			);
		}

		return (
			<div className="flex items-center justify-center h-full overflow-auto p-4 bg-[#0d0d0d]">
				<img
					src={imageData.dataUrl}
					alt={filePath.split("/").pop() || "Image"}
					className="max-w-full max-h-full object-contain"
					style={{ imageRendering: "auto" }}
				/>
			</div>
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
		<FileEditorContextMenu
			editorRef={editorRef}
			filePath={filePath}
			onSplitHorizontal={onSplitHorizontal}
			onSplitVertical={onSplitVertical}
			onClosePane={onClosePane}
			currentTabId={currentTabId}
			availableTabs={availableTabs}
			onMoveToTab={onMoveToTab}
			onMoveToNewTab={onMoveToNewTab}
		>
			<div className="w-full h-full">
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
					options={{
						...monacoEditorOptions,
						contextmenu: false, // Disable Monaco's native context menu to use our custom one
					}}
				/>
			</div>
		</FileEditorContextMenu>
	);
}
