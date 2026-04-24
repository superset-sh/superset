/**
 * Renders pending image attachments above the composer editor.
 * Thumbnails with a remove button. Non-image attachments aren't
 * expected from the paste flow yet (Phase 5.2 will bring
 * drag-and-drop files) but we degrade gracefully.
 */

import { X } from "lucide-react";
import type { PendingAttachment } from "./attachments";

export interface AttachmentRowProps {
	attachments: PendingAttachment[];
	onRemove: (id: string) => void;
}

function humanSize(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function AttachmentRow({ attachments, onRemove }: AttachmentRowProps) {
	if (attachments.length === 0) return null;
	return (
		<div className="border-border mb-2 flex flex-wrap gap-2 border-b pb-2">
			{attachments.map((att) => {
				const isImage = att.mediaType.startsWith("image/");
				const src = `data:${att.mediaType};base64,${att.data}`;
				return (
					<div
						key={att.id}
						className="border-border bg-muted/20 group relative flex items-center gap-2 rounded-md border p-1 pr-2"
					>
						{isImage ? (
							<img
								src={src}
								alt={att.filename ?? "pasted image"}
								className="size-12 rounded object-cover"
							/>
						) : (
							<div className="size-12 rounded bg-background text-muted-foreground flex items-center justify-center text-[10px] font-mono">
								{att.mediaType.split("/")[1] ?? "file"}
							</div>
						)}
						<div className="min-w-0 text-[11px]">
							<div className="truncate">
								{att.filename ?? "Pasted image"}
							</div>
							<div className="text-muted-foreground">
								{humanSize(att.sizeBytes)}
							</div>
						</div>
						<button
							type="button"
							onClick={() => onRemove(att.id)}
							className="bg-background text-muted-foreground hover:text-foreground hover:bg-muted absolute -right-1.5 -top-1.5 size-5 rounded-full border shadow-sm opacity-0 transition-opacity group-hover:opacity-100"
							aria-label={`Remove ${att.filename ?? "attachment"}`}
						>
							<X className="size-3" />
						</button>
					</div>
				);
			})}
		</div>
	);
}
