import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import type { FileUIPart } from "ai";
import { Loader2, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { AttachmentTile } from "renderer/routes/_authenticated/components/AttachmentTile";
import { ImagePreviewOverlay } from "renderer/routes/_authenticated/components/ImagePreviewOverlay";
import { useSaveImageToDownloads } from "renderer/routes/_authenticated/hooks/useSaveImageToDownloads";
import { useUploadStateFor } from "../../../DashboardNewWorkspaceForm/PromptGroup/hooks/useUploadAttachments";

interface AttachmentCardProps {
	file: FileUIPart & { id: string };
	hostUrl: string | null;
	onRemove: (id: string) => void;
	/** File/folder cards only: reveal the source in Finder. Null hides the affordance. */
	onOpenFile?: (() => void) | null;
}

/**
 * Composer attachment preview for the new-workspace screen: images render as
 * square thumbnails (click to preview full-size), other files as icon cards
 * using the file-tree extension icons (click to reveal in Finder when the
 * source path is known). Upload status comes from the same store as the
 * modal's pill.
 */
export function AttachmentCard({
	file,
	hostUrl,
	onRemove,
	onOpenFile,
}: AttachmentCardProps) {
	const [isPreviewOpen, setIsPreviewOpen] = useState(false);
	const saveImageToDownloads = useSaveImageToDownloads();
	const state = useUploadStateFor(file.id, hostUrl);
	const isPending = !state || state.kind === "pending";
	const isError = state?.kind === "error";
	const errorMessage = state?.kind === "error" ? state.message : null;
	const isImage = file.mediaType?.startsWith("image/") ?? false;
	const filename = file.filename ?? "attachment";

	const statusOverlay = (isPending || isError) && (
		<div
			className={cn(
				"pointer-events-none absolute inset-0 flex items-center justify-center rounded-[inherit]",
				isError ? "bg-destructive/40" : "bg-background/50",
			)}
		>
			{isError ? (
				<TriangleAlert className="size-4 text-destructive" />
			) : (
				<Loader2 className="size-4 animate-spin text-muted-foreground" />
			)}
		</div>
	);

	const body = (
		<div className="shrink-0">
			<AttachmentTile
				filename={filename}
				imageUrl={isImage ? (file.url ?? null) : null}
				overlay={statusOverlay}
				onOpen={isImage ? () => setIsPreviewOpen(true) : (onOpenFile ?? null)}
				onRemove={() => onRemove(file.id)}
			/>
			{isImage && (
				<ImagePreviewOverlay
					src={file.url ?? ""}
					filename={filename}
					open={isPreviewOpen}
					onClose={() => setIsPreviewOpen(false)}
					onDownload={() => saveImageToDownloads(file.url ?? "", filename)}
				/>
			)}
		</div>
	);

	if (isError && errorMessage) {
		return (
			<Tooltip>
				<TooltipTrigger asChild>{body}</TooltipTrigger>
				<TooltipContent>{errorMessage}</TooltipContent>
			</Tooltip>
		);
	}

	return body;
}
