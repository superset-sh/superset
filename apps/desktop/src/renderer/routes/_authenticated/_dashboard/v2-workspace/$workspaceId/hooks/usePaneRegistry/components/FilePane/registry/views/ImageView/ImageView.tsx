import { useLingui } from "@lingui/react/macro";
import { useEffect, useState } from "react";
import { getBaseName } from "renderer/lib/pathBasename";
import { getImageMimeType } from "shared/file-types";
import type { ViewProps } from "../../types";
import { usePanZoom } from "./hooks/usePanZoom";

export function ImageView({ document, filePath }: ViewProps) {
	const { t } = useLingui();
	const [objectUrl, setObjectUrl] = useState<string | null>(null);
	const {
		containerRef,
		transform,
		isDragging,
		isTransformed,
		reset,
		handlers,
	} = usePanZoom();

	useEffect(() => {
		reset();
		if (document.content.kind !== "bytes") {
			setObjectUrl(null);
			return;
		}
		const mimeType = getImageMimeType(filePath) ?? "image/png";
		const url = URL.createObjectURL(
			new Blob([document.content.value as BlobPart], { type: mimeType }),
		);
		setObjectUrl(url);
		return () => URL.revokeObjectURL(url);
	}, [document.content, filePath, reset]);

	return (
		<div
			ref={containerRef}
			role="application"
			aria-label={t({
				message: `Image preview of ${getBaseName(filePath)}. Zoom with plus and minus, pan with arrow keys, press 0 to reset.`,
			})}
			// biome-ignore lint/a11y/noNoninteractiveTabindex: focus is required for the keyboard pan/zoom handlers
			tabIndex={0}
			className={`relative flex h-full touch-none items-center justify-center overflow-hidden bg-background p-4 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${
				isDragging ? "cursor-grabbing" : "cursor-grab"
			}`}
			{...handlers}
		>
			{objectUrl && (
				<div
					className="inline-block max-h-full max-w-full"
					style={{
						transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
						backgroundImage:
							"conic-gradient(color-mix(in srgb, var(--color-foreground) 10%, transparent) 25%, transparent 0 50%, color-mix(in srgb, var(--color-foreground) 10%, transparent) 0 75%, transparent 0)",
						backgroundSize: "16px 16px",
					}}
				>
					<img
						src={objectUrl}
						alt={getBaseName(filePath)}
						className="block max-h-full max-w-full select-none object-contain"
						draggable={false}
					/>
				</div>
			)}
			{isTransformed && (
				<button
					type="button"
					className="absolute right-2 bottom-2 rounded-md border border-border bg-background/80 px-2 py-0.5 font-mono text-muted-foreground text-xs backdrop-blur hover:text-foreground"
					onPointerDown={(event) => event.stopPropagation()}
					onClick={reset}
					title={t({
						message: "Reset zoom",
					})}
				>
					{Math.round(transform.scale * 100)}%
				</button>
			)}
		</div>
	);
}
