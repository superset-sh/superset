import { useLingui } from "@lingui/react/macro";
import { AnimatePresence, motion } from "framer-motion";
import { DownloadIcon, XIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

interface ImagePreviewOverlayProps {
	src: string;
	filename: string;
	open: boolean;
	onClose: () => void;
	onDownload: () => Promise<void>;
}

const CORNER_BUTTON_CLASS =
	"flex size-10 cursor-pointer items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 active:bg-white/25 disabled:opacity-50";

/**
 * Full-screen image preview: dark scrim, centered image, floating download and
 * close buttons in the top-right corner. Closes on Escape or scrim click.
 */
export function ImagePreviewOverlay({
	src,
	filename,
	open,
	onClose,
	onDownload,
}: ImagePreviewOverlayProps) {
	const { t } = useLingui();
	const [isSaving, setIsSaving] = useState(false);

	useEffect(() => {
		if (!open) return;
		const handler = (e: KeyboardEvent) => {
			if (e.key !== "Escape") return;
			e.stopPropagation();
			onClose();
		};
		window.addEventListener("keydown", handler, true);
		return () => window.removeEventListener("keydown", handler, true);
	}, [open, onClose]);

	const handleDownload = async () => {
		setIsSaving(true);
		await onDownload();
		setIsSaving(false);
	};

	return createPortal(
		<AnimatePresence>
			{open && (
				<motion.div
					key="image-preview"
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					exit={{ opacity: 0 }}
					transition={{ duration: 0.15, ease: "easeOut" }}
					className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85"
					onClick={(e) => {
						if (e.target === e.currentTarget) onClose();
					}}
				>
					<img
						src={src}
						alt={filename}
						className="max-h-[85vh] max-w-[90vw] rounded-lg object-contain"
					/>
					<div className="absolute top-4 right-4 flex items-center gap-2">
						<button
							type="button"
							aria-label={t({
								message: "Download image",
							})}
							disabled={isSaving}
							onClick={() => void handleDownload()}
							className={CORNER_BUTTON_CLASS}
						>
							<DownloadIcon className="size-4" />
						</button>
						<button
							type="button"
							aria-label={t({
								message: "Close preview",
							})}
							onClick={onClose}
							className={CORNER_BUTTON_CLASS}
						>
							<XIcon className="size-4" />
						</button>
					</div>
				</motion.div>
			)}
		</AnimatePresence>,
		document.body,
	);
}
