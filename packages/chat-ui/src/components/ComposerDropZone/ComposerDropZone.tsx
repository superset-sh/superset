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
import { isDropHandled, markDropHandled } from "../../utils/handledDrops";

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
	const [isDraggingFiles, setIsDraggingFiles] = useState(false);
	const dragEndTimerRef = useRef<number | null>(null);

	const clearDragEndTimer = () => {
		if (dragEndTimerRef.current !== null)
			window.clearTimeout(dragEndTimerRef.current);
		dragEndTimerRef.current = null;
	};

	useEffect(
		() => () => {
			if (dragEndTimerRef.current !== null)
				window.clearTimeout(dragEndTimerRef.current);
		},
		[],
	);

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
					if (!event.dataTransfer.types.includes("Files")) return;
					event.preventDefault();
					setIsDraggingFiles(true);
					clearDragEndTimer();
					dragEndTimerRef.current = window.setTimeout(
						() => setIsDraggingFiles(false),
						200,
					);
				}}
				onDrop={(event) => {
					clearDragEndTimer();
					setIsDraggingFiles(false);
					if (isDropHandled(event.nativeEvent)) return;
					const sink = sinkRef.current;
					if (!sink || event.dataTransfer.files.length === 0) return;
					event.preventDefault();
					markDropHandled(event.nativeEvent);
					sink(event.dataTransfer.files);
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
