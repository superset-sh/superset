import { useLingui } from "@lingui/react/macro";
import { toast } from "@superset/ui/sonner";
import { cn } from "@superset/ui/utils";
import { type NodeViewProps, NodeViewWrapper } from "@tiptap/react";
import { useEffect, useRef, useState } from "react";
import { LuCopy, LuDownload, LuMaximize2, LuTrash2 } from "react-icons/lu";
import { ImagePreviewOverlay } from "renderer/routes/_authenticated/components/ImagePreviewOverlay";
import { useSaveImageToDownloads } from "renderer/routes/_authenticated/hooks/useSaveImageToDownloads";
import { ImageToolbarButton } from "./components/ImageToolbarButton";
import { getLinearProxyUrl, isLinearImageUrl } from "./utils/linearImage";

/** An image in a document: a toolbar on hover, and a right-edge handle to resize it while editing. */
export function ImageView({
	node,
	editor,
	selected,
	updateAttributes,
	deleteNode,
}: NodeViewProps) {
	const { t } = useLingui();
	const saveImageToDownloads = useSaveImageToDownloads();
	const imageRef = useRef<HTMLImageElement>(null);
	const toolbarRef = useRef<HTMLDivElement>(null);
	const detachResize = useRef<(() => void) | null>(null);
	const [isPreviewOpen, setPreviewOpen] = useState(false);
	const [dragWidth, setDragWidth] = useState<number | null>(null);
	const [failedSrc, setFailedSrc] = useState<string | null>(null);
	const src = String(node.attrs.src ?? "");
	const alt = String(node.attrs.alt ?? "");
	const displaySrc = isLinearImageUrl(src) ? getLinearProxyUrl(src) : src;
	const width = dragWidth ?? (Number(node.attrs.width) || null);
	const isEditable = editor.isEditable;
	const hasLoaded = failedSrc !== displaySrc;
	const filename = alt || "image";

	useEffect(() => () => detachResize.current?.(), []);

	const startResize = (event: React.PointerEvent) => {
		const image = imageRef.current;
		if (!image) return;
		event.preventDefault();
		const startX = event.clientX;
		const startWidth = image.getBoundingClientRect().width;
		const maxWidth = editor.view.dom.clientWidth;
		const minWidth = (toolbarRef.current?.offsetWidth ?? 0) + 16;
		let next = startWidth;
		const move = (moveEvent: PointerEvent) => {
			const delta = moveEvent.clientX - startX;
			next = Math.round(
				Math.min(maxWidth, Math.max(minWidth, startWidth + delta)),
			);
			setDragWidth(next);
		};
		const detach = () => {
			window.removeEventListener("pointermove", move);
			window.removeEventListener("pointerup", up);
			window.removeEventListener("pointercancel", up);
			detachResize.current = null;
		};
		const up = () => {
			detach();
			updateAttributes({ width: next, height: null });
			setDragWidth(null);
		};
		detachResize.current?.();
		detachResize.current = detach;
		window.addEventListener("pointermove", move);
		window.addEventListener("pointerup", up);
		window.addEventListener("pointercancel", up);
	};

	const copyImage = async () => {
		try {
			const blob = await (await fetch(displaySrc)).blob();
			await navigator.clipboard.write([
				new ClipboardItem({ [blob.type]: blob }),
			]);
			toast.success(t({ message: "Image copied" }));
		} catch {
			toast.error(t({ message: "Couldn't copy the image" }));
		}
	};

	return (
		<NodeViewWrapper className="my-3" data-drag-handle>
			<div
				className={cn(
					"group/image relative inline-block max-w-full",
					selected && isEditable && "rounded-md ring-2 ring-primary/60",
				)}
			>
				<img
					ref={imageRef}
					src={displaySrc}
					alt={alt}
					crossOrigin={isLinearImageUrl(src) ? "use-credentials" : undefined}
					draggable={false}
					onError={() => setFailedSrc(displaySrc)}
					style={width ? { width } : undefined}
					className="block h-auto max-w-full rounded-md"
				/>
				{hasLoaded && (
					<div
						ref={toolbarRef}
						contentEditable={false}
						className="absolute top-2 right-2 flex items-center gap-0.5 rounded-lg border border-border bg-popover/95 p-0.5 opacity-0 shadow-sm transition-opacity group-hover/image:opacity-100 focus-within:opacity-100"
					>
						<ImageToolbarButton
							label={t({ message: "View full size" })}
							onClick={() => setPreviewOpen(true)}
						>
							<LuMaximize2 className="size-3.5" />
						</ImageToolbarButton>
						<ImageToolbarButton
							label={t({ message: "Download" })}
							onClick={() => void saveImageToDownloads(displaySrc, filename)}
						>
							<LuDownload className="size-3.5" />
						</ImageToolbarButton>
						<ImageToolbarButton
							label={t({ message: "Copy image" })}
							onClick={() => void copyImage()}
						>
							<LuCopy className="size-3.5" />
						</ImageToolbarButton>
						{isEditable && (
							<>
								<span className="mx-0.5 h-4 w-px bg-border" />
								<ImageToolbarButton
									label={t({ message: "Delete image" })}
									onClick={deleteNode}
								>
									<LuTrash2 className="size-3.5" />
								</ImageToolbarButton>
							</>
						)}
					</div>
				)}
				{isEditable && hasLoaded && (
					<span
						contentEditable={false}
						onPointerDown={startResize}
						className="absolute top-1/2 h-10 w-1.5 -translate-y-1/2 cursor-ew-resize rounded-full bg-foreground/60 opacity-0 transition-opacity group-hover/image:opacity-100 right-1.5"
					/>
				)}
			</div>
			<ImagePreviewOverlay
				src={displaySrc}
				filename={filename}
				open={isPreviewOpen}
				onClose={() => setPreviewOpen(false)}
				onDownload={() => saveImageToDownloads(displaySrc, filename)}
			/>
		</NodeViewWrapper>
	);
}
