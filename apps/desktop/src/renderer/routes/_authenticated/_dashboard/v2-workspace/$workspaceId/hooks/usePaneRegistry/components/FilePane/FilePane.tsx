import type { RendererContext } from "@superset/panes";
import { useCallback } from "react";
import { useFileDocument } from "renderer/hooks/host-service/useFileDocument";
import { isImageFile, isMarkdownFile } from "shared/file-types";
import type { FilePaneData, PaneViewerData } from "../../../../types";
import { CodeRenderer } from "./renderers/CodeRenderer";
import { ImageRenderer } from "./renderers/ImageRenderer";
import { MarkdownRenderer } from "./renderers/MarkdownRenderer";

interface FilePaneProps {
	context: RendererContext<PaneViewerData>;
	workspaceId: string;
}

export function FilePane({ context, workspaceId }: FilePaneProps) {
	const data = context.pane.data as FilePaneData;
	const { filePath } = data;

	const document = useFileDocument({
		workspaceId,
		absolutePath: filePath,
		mode: isImageFile(filePath) ? "bytes" : "auto",
		maxBytes: isImageFile(filePath) ? 10 * 1024 * 1024 : 2 * 1024 * 1024,
		hasLocalChanges: data.hasChanges,
		autoReloadWhenClean: true,
	});

	const handleDirtyChange = useCallback(
		(dirty: boolean) => {
			if (dirty !== data.hasChanges) {
				context.actions.updateData({
					...data,
					hasChanges: dirty,
				} as PaneViewerData);
			}
		},
		[context.actions, data],
	);

	const handleSave = useCallback(
		async (content: string) => {
			const result = await document.save({ content });
			if (result.status === "saved") {
				handleDirtyChange(false);
			}
			return result;
		},
		[document, handleDirtyChange],
	);

	if (document.state.kind === "loading") {
		return null;
	}

	if (document.state.kind === "not-found") {
		return (
			<div className="flex w-full h-full items-center justify-center text-sm text-muted-foreground">
				File not found
			</div>
		);
	}

	if (document.state.kind === "too-large") {
		return (
			<div className="flex w-full h-full items-center justify-center text-sm text-muted-foreground">
				File is too large to display
			</div>
		);
	}

	if (document.state.kind === "binary" || document.state.kind === "bytes") {
		if (isImageFile(filePath) && document.state.kind === "bytes") {
			return (
				<ImageRenderer content={document.state.content} filePath={filePath} />
			);
		}
		return (
			<div className="flex w-full h-full items-center justify-center text-sm text-muted-foreground">
				Binary file — cannot display
			</div>
		);
	}

	if (isMarkdownFile(filePath)) {
		return (
			<MarkdownRenderer
				content={document.state.content}
				hasExternalChange={document.hasExternalChange}
				onDirtyChange={handleDirtyChange}
				onReload={document.reload}
				onSave={handleSave}
			/>
		);
	}

	return (
		<CodeRenderer
			content={document.state.content}
			filePath={filePath}
			hasExternalChange={document.hasExternalChange}
			onDirtyChange={handleDirtyChange}
			onReload={document.reload}
			onSave={handleSave}
		/>
	);
}
