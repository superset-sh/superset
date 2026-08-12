"use client";

import {
	FileArchiveIcon,
	FileCode2Icon,
	FileJson2Icon,
	FileTextIcon,
	ImageIcon,
	Music2Icon,
} from "lucide-react";
import type { JSX } from "react";
import type { PromptInputAttachment } from "../../types";
import { RemoveButton } from "./components/RemoveButton";

export type AttachmentPillsProps = {
	attachments: PromptInputAttachment[];
	onRemove: (id: string) => void;
	onPreviewError?: (id: string) => void;
	onAttachmentClick?: (attachment: PromptInputAttachment) => void;
};

const CODE_EXTENSIONS = new Set([
	"ts",
	"tsx",
	"js",
	"jsx",
	"py",
	"rs",
	"go",
	"rb",
	"swift",
	"css",
	"html",
	"sh",
]);
const DATA_EXTENSIONS = new Set(["json", "yaml", "yml", "toml", "lock"]);
const ARCHIVE_EXTENSIONS = new Set(["zip", "tar", "gz", "tgz", "7z", "rar"]);

// Mime type first (audio, images demoted after a failed preview), then
// extension for the text-ish formats mime can't distinguish.
function fileTypeIcon(mediaType: string, extension: string): JSX.Element {
	if (mediaType.startsWith("audio/"))
		return <Music2Icon className="size-5 text-muted-foreground" />;
	if (mediaType.startsWith("image/"))
		return <ImageIcon className="size-5 text-muted-foreground" />;
	const lowered = extension.toLowerCase();
	if (CODE_EXTENSIONS.has(lowered))
		return <FileCode2Icon className="size-5 text-muted-foreground" />;
	if (DATA_EXTENSIONS.has(lowered))
		return <FileJson2Icon className="size-5 text-muted-foreground" />;
	if (ARCHIVE_EXTENSIONS.has(lowered))
		return <FileArchiveIcon className="size-5 text-muted-foreground" />;
	return <FileTextIcon className="size-5 text-muted-foreground" />;
}

export function AttachmentPills({
	attachments,
	onRemove,
	onPreviewError,
	onAttachmentClick,
}: AttachmentPillsProps) {
	if (attachments.length === 0) return null;
	return (
		<div className="flex flex-wrap gap-2 px-3 pt-3">
			{attachments.map((attachment) => {
				const filename = attachment.file.name || "attachment";
				const dotIndex = filename.lastIndexOf(".");
				const extension =
					dotIndex > 0 ? filename.slice(dotIndex + 1).toUpperCase() : "";
				if (attachment.previewUrl) {
					return (
						<div key={attachment.id} className="relative shrink-0">
							<button
								type="button"
								aria-label={filename}
								className="group/attachment relative block size-16 cursor-pointer overflow-hidden rounded-xl border-[0.5px] border-border bg-foreground/[0.04]"
								onClick={() => onAttachmentClick?.(attachment)}
							>
								{attachment.file.type.startsWith("video/") ? (
									<video
										src={attachment.previewUrl}
										muted
										className="size-full object-cover"
										onError={() => onPreviewError?.(attachment.id)}
									/>
								) : (
									<img
										src={attachment.previewUrl}
										alt={filename}
										className="size-full object-cover"
										onError={() => onPreviewError?.(attachment.id)}
									/>
								)}
								<span className="pointer-events-none absolute inset-0 bg-foreground/[0.02] opacity-0 transition-opacity duration-150 group-hover/attachment:opacity-100" />
							</button>
							<RemoveButton onClick={() => onRemove(attachment.id)} />
						</div>
					);
				}
				return (
					<div key={attachment.id} className="relative shrink-0">
						<button
							type="button"
							onClick={() => onAttachmentClick?.(attachment)}
							className="group/attachment relative flex h-16 w-[200px] cursor-pointer items-center gap-2.5 overflow-hidden rounded-xl border-[0.5px] border-border bg-foreground/[0.03] px-2.5 text-left"
						>
							<span className="pointer-events-none absolute inset-0 bg-foreground/[0.02] opacity-0 transition-opacity duration-150 group-hover/attachment:opacity-100" />
							<div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-foreground/[0.06]">
								{fileTypeIcon(attachment.file.type, extension)}
							</div>
							<div className="min-w-0 flex-1 pr-3">
								<div className="truncate text-xs text-foreground">
									{filename}
								</div>
								{extension && (
									<div className="text-[10px] text-muted-foreground">
										{extension}
									</div>
								)}
							</div>
						</button>
						<RemoveButton onClick={() => onRemove(attachment.id)} />
					</div>
				);
			})}
		</div>
	);
}
