import { useCallback, useRef, useState } from "react";
import { TipTapMarkdownRenderer } from "renderer/components/MarkdownRenderer/components/TipTapMarkdownRenderer";
import { CodeEditor } from "renderer/screens/main/components/WorkspaceView/components/CodeEditor";
import { ExternalChangeBar } from "../../components/ExternalChangeBar";

export type MarkdownViewMode = "rendered" | "raw";

interface MarkdownRendererProps {
	content: string;
	hasExternalChange: boolean;
	onDirtyChange: (dirty: boolean) => void;
	onReload: () => Promise<void>;
	onSave: (content: string) => Promise<unknown>;
}

export function MarkdownRenderer({
	content,
	hasExternalChange,
	onDirtyChange,
	onReload,
	onSave,
}: MarkdownRendererProps) {
	const [viewMode, _setViewMode] = useState<MarkdownViewMode>("rendered");
	const currentContentRef = useRef(content);
	const [savedContent, setSavedContent] = useState(content);

	const handleChange = useCallback(
		(value: string) => {
			currentContentRef.current = value;
			onDirtyChange(value !== savedContent);
		},
		[onDirtyChange, savedContent],
	);

	const handleSave = useCallback(async () => {
		await onSave(currentContentRef.current);
		setSavedContent(currentContentRef.current);
	}, [onSave]);

	return (
		<div className="flex h-full flex-col">
			{hasExternalChange && <ExternalChangeBar onReload={onReload} />}
			<div className="min-h-0 flex-1">
				{viewMode === "rendered" ? (
					<div className="h-full overflow-y-auto p-4">
						<TipTapMarkdownRenderer
							value={content}
							editable
							onChange={handleChange}
							onSave={handleSave}
						/>
					</div>
				) : (
					<CodeEditor
						value={content}
						language="markdown"
						onChange={handleChange}
						onSave={handleSave}
						fillHeight
					/>
				)}
			</div>
		</div>
	);
}

// Exported for use in renderHeaderExtras
export type { MarkdownViewMode as ViewMode };

interface ViewModeToggleProps {
	viewMode: MarkdownViewMode;
	onViewModeChange: (mode: MarkdownViewMode) => void;
}

export function MarkdownViewModeToggle({
	viewMode,
	onViewModeChange,
}: ViewModeToggleProps) {
	return (
		<div className="flex items-center gap-0.5 text-xs">
			<button
				type="button"
				className={`rounded px-1.5 py-0.5 ${viewMode === "rendered" ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground"}`}
				onClick={() => onViewModeChange("rendered")}
			>
				Rendered
			</button>
			<button
				type="button"
				className={`rounded px-1.5 py-0.5 ${viewMode === "raw" ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground"}`}
				onClick={() => onViewModeChange("raw")}
			>
				Raw
			</button>
		</div>
	);
}
