import { AttachmentChip } from "../../../AttachmentChip";
import { ImageHoverPreview } from "../../../ImageHoverPreview";
import type { ChatMessage, ChatMessagePart } from "../../types";

interface UserMessageAttachmentsProps {
	message: ChatMessage;
	onOpenAttachment: (url: string, filename?: string) => void;
}

export function UserMessageAttachments({
	message,
	onOpenAttachment,
}: UserMessageAttachmentsProps) {
	return (
		<div className="flex max-w-[85%] flex-wrap justify-end gap-2">
			{message.content.map((part: ChatMessagePart, partIndex: number) => {
				const rawPart = part as {
					data?: string;
					filename?: string;
					mediaType?: string;
					mimeType?: string;
					type?: string;
				};
				if (part.type !== "image" && rawPart.type !== "file") {
					return null;
				}

				const data = rawPart.data ?? "";
				const mediaType =
					rawPart.mediaType ?? rawPart.mimeType ?? "application/octet-stream";
				if (!data) {
					return null;
				}

				if (part.type === "image" && "mimeType" in part && !rawPart.mediaType) {
					const legacySrc = `data:${part.mimeType};base64,${part.data}`;
					return (
						<ImageHoverPreview
							key={`${message.id}-${partIndex}`}
							src={legacySrc}
							mediaType={part.mimeType}
							triggerClassName="max-w-[85%]"
						>
							<img
								src={legacySrc}
								alt="Attached"
								className="max-h-48 rounded-lg object-contain"
							/>
						</ImageHoverPreview>
					);
				}

				const chip = (
					<AttachmentChip
						data={data}
						mediaType={mediaType}
						filename={rawPart.filename}
						onClick={() => onOpenAttachment(data, rawPart.filename)}
					/>
				);

				if (mediaType.startsWith("image/")) {
					return (
						<ImageHoverPreview
							key={`${message.id}-${partIndex}`}
							src={data}
							filename={rawPart.filename}
							mediaType={mediaType}
						>
							{chip}
						</ImageHoverPreview>
					);
				}

				return (
					<AttachmentChip
						key={`${message.id}-${partIndex}`}
						data={data}
						mediaType={mediaType}
						filename={rawPart.filename}
						onClick={() => onOpenAttachment(data, rawPart.filename)}
					/>
				);
			})}
		</div>
	);
}
