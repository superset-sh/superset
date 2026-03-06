import { FileIcon, FileTextIcon } from "lucide-react";

interface AttachmentChipProps {
	data: string;
	mediaType: string;
	filename?: string;
	onClick?: () => void;
}

export function AttachmentChip({
	data,
	mediaType,
	filename,
	onClick,
}: AttachmentChipProps) {
	const isImage = mediaType.startsWith("image/");
	const label = filename || (isImage ? "Image" : "Attachment");

	const className =
		"flex h-8 items-center gap-1.5 rounded-md border border-foreground/20 bg-background/50 px-1.5 text-sm font-medium transition-colors hover:bg-background";

	const content = (
		<>
			<div className="flex size-5 shrink-0 items-center justify-center overflow-hidden rounded bg-background">
				{isImage && data ? (
					<img src={data} alt={label} className="size-5 object-cover" />
				) : mediaType === "application/pdf" ? (
					<FileIcon className="size-3 text-muted-foreground" />
				) : (
					<FileTextIcon className="size-3 text-muted-foreground" />
				)}
			</div>
			<span className="max-w-[200px] truncate">{label}</span>
		</>
	);

	if (onClick) {
		return (
			<button type="button" className={className} onClick={onClick}>
				{content}
			</button>
		);
	}

	return <div className={className}>{content}</div>;
}
