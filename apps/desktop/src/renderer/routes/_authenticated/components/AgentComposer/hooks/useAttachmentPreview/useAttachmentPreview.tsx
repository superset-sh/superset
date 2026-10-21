import type { PromptInputAttachment } from "@superset/chat-ui/PromptInput";
import { type ReactNode, useCallback, useState } from "react";
import { ImagePreviewOverlay } from "renderer/routes/_authenticated/components/ImagePreviewOverlay";
import { useCopyImageToClipboard } from "renderer/routes/_authenticated/hooks/useCopyImageToClipboard";
import { useSaveImageToDownloads } from "renderer/routes/_authenticated/hooks/useSaveImageToDownloads";

type PreviewImage = { id: string; src: string; filename: string };
type Preview = { images: PreviewImage[]; index: number };

function previewImage(attachment: PromptInputAttachment): PreviewImage | null {
	if (!attachment.previewUrl || !attachment.file.type.startsWith("image/"))
		return null;
	return {
		id: attachment.id,
		src: attachment.previewUrl,
		filename: attachment.file.name || "image",
	};
}

/** Previews the composer's pending images, stepping through them in pill order. */
export function useAttachmentPreview(): {
	onAttachmentClick: (
		attachment: PromptInputAttachment,
		attachments: readonly PromptInputAttachment[],
	) => void;
	overlay: ReactNode;
} {
	const saveImageToDownloads = useSaveImageToDownloads();
	const copyImage = useCopyImageToClipboard();
	const [preview, setPreview] = useState<Preview | null>(null);
	const [open, setOpen] = useState(false);
	const onAttachmentClick = useCallback(
		(
			attachment: PromptInputAttachment,
			attachments: readonly PromptInputAttachment[],
		) => {
			const images = attachments.flatMap((candidate) => {
				const image = previewImage(candidate);
				return image ? [image] : [];
			});
			const index = images.findIndex((image) => image.id === attachment.id);
			if (index === -1) return;
			setPreview({ images, index });
			setOpen(true);
		},
		[],
	);
	const step = (delta: number) =>
		setPreview((current) => {
			if (!current) return current;
			const total = current.images.length;
			return { ...current, index: (current.index + delta + total) % total };
		});
	const image = preview?.images[preview.index];
	const overlay =
		preview && image ? (
			<ImagePreviewOverlay
				filename={image.filename}
				onClose={() => setOpen(false)}
				onCopy={() => copyImage(image.src)}
				onDownload={() => saveImageToDownloads(image.src, image.filename)}
				onNext={() => step(1)}
				onPrevious={() => step(-1)}
				open={open}
				position={{ index: preview.index, total: preview.images.length }}
				src={image.src}
			/>
		) : null;
	return { onAttachmentClick, overlay };
}
