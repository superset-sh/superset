import { useLingui } from "@lingui/react/macro";
import { useState } from "react";
import { ImagePreviewOverlay } from "renderer/routes/_authenticated/components/ImagePreviewOverlay";

export function PreviewableImage({
	src,
	filename,
	onError,
	onDownload,
}: {
	src: string;
	filename: string;
	onError: () => void;
	onDownload: () => Promise<void>;
}) {
	const { t } = useLingui();
	const [isPreviewOpen, setIsPreviewOpen] = useState(false);
	return (
		<>
			<button
				type="button"
				aria-label={t({ message: `Preview ${filename}` })}
				className="block size-40 cursor-zoom-in overflow-hidden rounded-2xl"
				onClick={() => setIsPreviewOpen(true)}
			>
				<img
					alt={filename}
					className="size-full object-cover"
					draggable={false}
					onError={onError}
					src={src}
				/>
			</button>
			<ImagePreviewOverlay
				src={src}
				filename={filename}
				open={isPreviewOpen}
				onClose={() => setIsPreviewOpen(false)}
				onDownload={onDownload}
			/>
		</>
	);
}
