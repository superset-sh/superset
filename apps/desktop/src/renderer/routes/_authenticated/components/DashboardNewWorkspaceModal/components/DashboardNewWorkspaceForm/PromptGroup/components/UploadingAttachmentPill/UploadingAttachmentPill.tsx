import { PromptInputAttachment } from "@superset/ui/ai-elements/prompt-input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import type { FileUIPart } from "ai";
import { Loader2, TriangleAlert } from "lucide-react";
import { useUploadStateFor } from "../../hooks/useUploadAttachments";

interface UploadingAttachmentPillProps {
	file: FileUIPart & { id: string };
	hostUrl: string | null;
}

/**
 * Wraps the prompt-input library's pill with subtle status overlays:
 * a corner spinner while pending, a red-tinted thumbnail with a warning
 * icon on error. The whole pill is the tooltip trigger when errored so
 * users can hover anywhere on the row to read the message.
 */
export function UploadingAttachmentPill({
	file,
	hostUrl,
}: UploadingAttachmentPillProps) {
	const state = useUploadStateFor(file.id, hostUrl);
	const isPending = !state || state.kind === "pending";
	const isError = state?.kind === "error";
	const errorMessage = state?.kind === "error" ? state.message : null;

	const body = (
		<div className="group relative">
			<PromptInputAttachment data={file} loading={isPending} />
			{isPending && (
				<div className="pointer-events-none absolute top-[7px] left-[7px] flex size-5 items-center justify-center rounded bg-background/70 transition-opacity group-hover:opacity-0">
					<Loader2 className="size-3 animate-spin text-muted-foreground" />
				</div>
			)}
			{isError && (
				<div className="pointer-events-none absolute top-[7px] left-[7px] flex size-5 items-center justify-center rounded bg-destructive/70 transition-opacity group-hover:opacity-0">
					<TriangleAlert className="size-3 text-destructive-foreground" />
				</div>
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
