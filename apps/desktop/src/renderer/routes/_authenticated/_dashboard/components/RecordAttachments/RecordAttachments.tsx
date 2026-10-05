import { useState } from "react";
import { AttachmentTile } from "renderer/routes/_authenticated/components/AttachmentTile";
import { ImagePreviewOverlay } from "renderer/routes/_authenticated/components/ImagePreviewOverlay";

interface RecordAttachment {
	id: string;
	name: string;
	contentType: string;
	url: string | null;
}

interface RecordAttachmentsProps {
	attachments: RecordAttachment[];
	onOpenAttachment: (attachmentId: string) => void;
	onDownloadAttachment: (attachmentId: string) => Promise<void>;
}

/** Tiles for a record's files; an image opens in the preview, anything else outside the app. */
export function RecordAttachments({
	attachments,
	onOpenAttachment,
	onDownloadAttachment,
}: RecordAttachmentsProps) {
	const [previewId, setPreviewId] = useState<string | null>(null);
	const imageUrl = (attachment: RecordAttachment) =>
		attachment.contentType.startsWith("image/") ? attachment.url : null;
	const preview = attachments.find((attachment) => attachment.id === previewId);
	const previewUrl = preview ? imageUrl(preview) : null;
	return (
		<div className="flex flex-wrap gap-2">
			{attachments.map((attachment) => (
				<AttachmentTile
					key={attachment.id}
					filename={attachment.name}
					imageUrl={imageUrl(attachment)}
					onOpen={() =>
						imageUrl(attachment)
							? setPreviewId(attachment.id)
							: onOpenAttachment(attachment.id)
					}
				/>
			))}
			<ImagePreviewOverlay
				src={previewUrl ?? ""}
				filename={preview?.name ?? ""}
				open={previewUrl !== null}
				onClose={() => setPreviewId(null)}
				onDownload={() =>
					preview ? onDownloadAttachment(preview.id) : Promise.resolve()
				}
			/>
		</div>
	);
}
