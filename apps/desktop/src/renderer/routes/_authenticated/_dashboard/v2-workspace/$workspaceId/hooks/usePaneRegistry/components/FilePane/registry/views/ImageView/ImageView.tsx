import { useEffect, useRef, useState } from "react";
import { getBaseName } from "renderer/lib/pathBasename";
import { getImageMimeType } from "shared/file-types";
import type { ViewProps } from "../../types";

const MIN_SCALE = 0.25;
const MAX_SCALE = 16;
const DEFAULT_TRANSFORM = { scale: 1, x: 0, y: 0 };

interface Transform {
	scale: number;
	x: number;
	y: number;
}

function zoomAtPoint(
	prev: Transform,
	nextScale: number,
	pointX: number,
	pointY: number,
): Transform {
	const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, nextScale));
	const ratio = scale / prev.scale;
	return {
		scale,
		x: pointX - (pointX - prev.x) * ratio,
		y: pointY - (pointY - prev.y) * ratio,
	};
}

export function ImageView({ document, filePath }: ViewProps) {
	const [objectUrl, setObjectUrl] = useState<string | null>(null);
	const [transform, setTransform] = useState<Transform>(DEFAULT_TRANSFORM);
	const containerRef = useRef<HTMLDivElement>(null);
	const dragRef = useRef<{
		pointerId: number;
		startX: number;
		startY: number;
		originX: number;
		originY: number;
	} | null>(null);
	const [isDragging, setIsDragging] = useState(false);

	useEffect(() => {
		setTransform(DEFAULT_TRANSFORM);
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
	}, [document.content, filePath]);

	// Native non-passive listener: React's onWheel can't preventDefault,
	// and trackpad pinch arrives as a wheel event with ctrlKey set.
	useEffect(() => {
		const container = containerRef.current;
		if (!container) {
			return;
		}
		const handleWheel = (event: WheelEvent) => {
			event.preventDefault();
			if (event.ctrlKey || event.metaKey) {
				const rect = container.getBoundingClientRect();
				const pointX = event.clientX - rect.left - rect.width / 2;
				const pointY = event.clientY - rect.top - rect.height / 2;
				setTransform((prev) =>
					zoomAtPoint(
						prev,
						prev.scale * Math.exp(-event.deltaY * 0.01),
						pointX,
						pointY,
					),
				);
			} else {
				setTransform((prev) => ({
					...prev,
					x: prev.x - event.deltaX,
					y: prev.y - event.deltaY,
				}));
			}
		};
		container.addEventListener("wheel", handleWheel, { passive: false });
		return () => container.removeEventListener("wheel", handleWheel);
	}, []);

	const isTransformed =
		transform.scale !== 1 || transform.x !== 0 || transform.y !== 0;

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: pointer-driven pan/zoom surface
		<div
			ref={containerRef}
			className={`relative flex h-full touch-none items-center justify-center overflow-hidden bg-background p-4 ${
				isDragging ? "cursor-grabbing" : "cursor-grab"
			}`}
			onPointerDown={(event) => {
				if (event.button !== 0) {
					return;
				}
				event.currentTarget.setPointerCapture(event.pointerId);
				dragRef.current = {
					pointerId: event.pointerId,
					startX: event.clientX,
					startY: event.clientY,
					originX: transform.x,
					originY: transform.y,
				};
				setIsDragging(true);
			}}
			onPointerMove={(event) => {
				const drag = dragRef.current;
				if (!drag || drag.pointerId !== event.pointerId) {
					return;
				}
				setTransform((prev) => ({
					...prev,
					x: drag.originX + event.clientX - drag.startX,
					y: drag.originY + event.clientY - drag.startY,
				}));
			}}
			onPointerUp={() => {
				dragRef.current = null;
				setIsDragging(false);
			}}
			onPointerCancel={() => {
				dragRef.current = null;
				setIsDragging(false);
			}}
			onDoubleClick={() => setTransform(DEFAULT_TRANSFORM)}
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
					onClick={() => setTransform(DEFAULT_TRANSFORM)}
					title="Reset zoom"
				>
					{Math.round(transform.scale * 100)}%
				</button>
			)}
		</div>
	);
}
