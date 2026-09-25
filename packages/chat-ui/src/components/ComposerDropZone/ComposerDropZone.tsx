"use client";

import { msg } from "@lingui/core/macro";
import { i18n } from "@superset/i18n";
import { cn } from "@superset/ui/utils";
import {
	createContext,
	type ReactNode,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";

type DropZoneContextValue = {
	register(sink: (files: FileList) => void): () => void;
};

const ComposerDropZoneContext = createContext<DropZoneContextValue | null>(
	null,
);

export function useComposerDropZone(): DropZoneContextValue | null {
	return useContext(ComposerDropZoneContext);
}

export type ComposerDropZoneProps = {
	children: ReactNode;
	label?: string;
	className?: string;
};

/**
 * Layout-level file drop target: mount around the whole content area (like the
 * new-workspace screen) and any composer rendered inside registers itself as
 * the drop sink automatically.
 */
export function ComposerDropZone({
	children,
	label = i18n._(
		msg({
			message: "Drop files to attach",
		}),
	),
	className,
}: ComposerDropZoneProps) {
	const sinkRef = useRef<((files: FileList) => void) | null>(null);
	// dragover + timeout reset instead of an enter/leave counter, so
	// Esc-cancelled drags and drops outside the window can't wedge the overlay.
	const [isDraggingFiles, setIsDraggingFiles] = useState(false);

	useEffect(() => {
		let timer: number | null = null;
		const onDragOver = (event: DragEvent) => {
			if (!Array.from(event.dataTransfer?.types ?? []).includes("Files"))
				return;
			setIsDraggingFiles(true);
			if (timer !== null) window.clearTimeout(timer);
			timer = window.setTimeout(() => setIsDraggingFiles(false), 200);
		};
		const onDrop = () => {
			if (timer !== null) window.clearTimeout(timer);
			timer = null;
			setIsDraggingFiles(false);
		};
		document.addEventListener("dragover", onDragOver);
		document.addEventListener("drop", onDrop);
		return () => {
			document.removeEventListener("dragover", onDragOver);
			document.removeEventListener("drop", onDrop);
			if (timer !== null) window.clearTimeout(timer);
		};
	}, []);

	const contextValue = useMemo<DropZoneContextValue>(
		() => ({
			register(sink) {
				sinkRef.current = sink;
				return () => {
					if (sinkRef.current === sink) sinkRef.current = null;
				};
			},
		}),
		[],
	);

	return (
		<ComposerDropZoneContext.Provider value={contextValue}>
			{/* biome-ignore lint/a11y/noStaticElementInteractions: drag-and-drop target; keyboard users attach via the composer's file picker */}
			<div
				className={cn("relative", className)}
				onDragOver={(event) => {
					if (event.dataTransfer.types.includes("Files"))
						event.preventDefault();
				}}
				onDrop={(event) => {
					// The composer's editor may have consumed this already;
					// preventDefault marks it and the event still bubbles here.
					if (event.defaultPrevented) return;
					if (event.dataTransfer.files.length === 0) return;
					event.preventDefault();
					sinkRef.current?.(event.dataTransfer.files);
				}}
			>
				{children}
				<div
					aria-hidden={!isDraggingFiles}
					className={cn(
						"pointer-events-none absolute inset-0 z-40 flex items-center justify-center bg-primary/10 transition-opacity duration-150 motion-reduce:transition-none",
						isDraggingFiles ? "opacity-100" : "opacity-0",
					)}
				>
					<span
						className={cn(
							"inline-flex items-center rounded-md border border-border/50 bg-secondary px-3 py-1 text-sm text-foreground shadow transition-transform duration-150 motion-reduce:transition-none",
							isDraggingFiles ? "scale-100" : "scale-95",
						)}
					>
						{label}
					</span>
				</div>
			</div>
		</ComposerDropZoneContext.Provider>
	);
}
