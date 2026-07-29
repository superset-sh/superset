import { toast } from "@superset/ui/sonner";
import { AnimatePresence, motion } from "framer-motion";
import { DownloadIcon, XIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { electronTrpc } from "renderer/lib/electron-trpc";

interface ImagePreviewOverlayProps {
	src: string;
	filename: string;
	open: boolean;
	onClose: () => void;
}

const CORNER_BUTTON_CLASS =
	"flex size-10 cursor-pointer items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 active:bg-white/25 disabled:opacity-50";

async function toBase64(blob: Blob): Promise<string> {
	const dataUrl = await new Promise<string>((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(reader.result as string);
		reader.onerror = () => reject(reader.error);
		reader.readAsDataURL(blob);
	});
	return dataUrl.slice(dataUrl.indexOf(",") + 1);
}

/**
 * Full-screen image preview: dark scrim, centered image, floating download and
 * close buttons in the top-right corner. Closes on Escape or scrim click.
 * Download writes the image into the user's Downloads folder via the main
 * process — anchor-download on a blob URL is at the mercy of Electron's
 * default will-download behavior.
 */
export function ImagePreviewOverlay({
	src,
	filename,
	open,
	onClose,
}: ImagePreviewOverlayProps) {
	const saveToDownloads = electronTrpc.external.saveToDownloads.useMutation();
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
		try {
			const blob = await (await fetch(src)).blob();
			const dataBase64 = await toBase64(blob);
			await saveToDownloads.mutateAsync({ filename, dataBase64 });
			toast.success("Saved to Downloads");
		} catch {
			toast.error("Download failed");
		} finally {
			setIsSaving(false);
		}
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
							aria-label="Download image"
							disabled={isSaving}
							onClick={() => void handleDownload()}
							className={CORNER_BUTTON_CLASS}
						>
							<DownloadIcon className="size-4" />
						</button>
						<button
							type="button"
							aria-label="Close preview"
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
