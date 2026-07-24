import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import type { FileUIPart } from "ai";
import { Loader2, TriangleAlert, XIcon } from "lucide-react";
import { useState } from "react";
import { getFileIcon } from "renderer/lib/fileIcons";
import { useUploadStateFor } from "../../../DashboardNewWorkspaceForm/PromptGroup/hooks/useUploadAttachments";
import { ImagePreviewOverlay } from "./components/ImagePreviewOverlay";

interface AttachmentCardProps {
	file: FileUIPart & { id: string };
	hostUrl: string | null;
	onRemove: (id: string) => void;
	/** File/folder cards only: reveal the source in Finder. Null hides the affordance. */
	onOpenFile?: (() => void) | null;
}

function RemoveButton({ onClick }: { onClick: () => void }) {
	return (
		<button
			type="button"
			aria-label="Remove attachment"
			className="absolute top-1 right-1 z-10 flex size-5 cursor-pointer items-center justify-center rounded-full bg-background/80 text-muted-foreground shadow-sm transition-colors hover:text-foreground"
			onClick={onClick}
		>
			<XIcon className="size-3" />
		</button>
	);
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
	const state = useUploadStateFor(file.id, hostUrl);
	const isPending = !state || state.kind === "pending";
	const isError = state?.kind === "error";
	const errorMessage = state?.kind === "error" ? state.message : null;
	const isImage = file.mediaType?.startsWith("image/") ?? false;
	const filename = file.filename ?? "attachment";
	const dotIndex = filename.lastIndexOf(".");
	const extension =
		dotIndex > 0 ? filename.slice(dotIndex + 1).toUpperCase() : "";

	const statusOverlay = (isPending || isError) && (
		<div
			className={cn(
				"pointer-events-none absolute inset-0 flex items-center justify-center rounded-[inherit]",
				isError ? "bg-destructive/40" : "bg-background/50",
			)}
		>
			{isError ? (
				<TriangleAlert className="size-4 text-destructive-foreground" />
			) : (
				<Loader2 className="size-4 animate-spin text-muted-foreground" />
			)}
		</div>
	);

	const body = isImage ? (
		<div className="group relative shrink-0">
			<button
				type="button"
				aria-label={`Preview ${filename}`}
				className="relative block size-16 cursor-pointer overflow-hidden rounded-xl border-[0.5px] border-border bg-foreground/[0.04]"
				onClick={() => setIsPreviewOpen(true)}
			>
				<img src={file.url} alt={filename} className="size-full object-cover" />
				{statusOverlay}
			</button>
			<RemoveButton onClick={() => onRemove(file.id)} />
			<ImagePreviewOverlay
				src={file.url ?? ""}
				filename={filename}
				open={isPreviewOpen}
				onClose={() => setIsPreviewOpen(false)}
			/>
		</div>
	) : (
		<div className="group relative shrink-0">
			<button
				type="button"
				disabled={!onOpenFile}
				onClick={() => onOpenFile?.()}
				className={cn(
					"relative flex h-16 w-[200px] items-center gap-2.5 rounded-xl border-[0.5px] border-border bg-foreground/[0.03] px-2.5 text-left",
					onOpenFile &&
						"cursor-pointer transition-colors hover:bg-foreground/[0.06]",
				)}
			>
				<div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-foreground/[0.06]">
					<img
						src={getFileIcon(filename, false).src}
						alt=""
						className="size-5"
					/>
				</div>
				<div className="min-w-0 flex-1 pr-3">
					<div className="truncate text-xs text-foreground">{filename}</div>
					{extension && (
						<div className="text-[10px] text-muted-foreground">{extension}</div>
					)}
				</div>
				{statusOverlay}
			</button>
			<RemoveButton onClick={() => onRemove(file.id)} />
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
