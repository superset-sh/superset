import { useCallback, useEffect, useRef, useState } from "react";

export type DragType = "files" | "path" | null;

export function useDocumentDrag() {
	const [dragType, setDragType] = useState<DragType>(null);
	const counter = useRef(0);

	const onEnter = useCallback((event: DragEvent) => {
		const types = event.dataTransfer?.types;
		if (types?.includes("Files")) {
			counter.current++;
			setDragType("files");
		} else if (types?.includes("text/plain")) {
			counter.current++;
			setDragType("path");
		}
	}, []);

	const onLeave = useCallback(() => {
		counter.current--;
		if (counter.current === 0) setDragType(null);
	}, []);

	const onDrop = useCallback(() => {
		counter.current = 0;
		setDragType(null);
	}, []);

	useEffect(() => {
		document.addEventListener("dragenter", onEnter);
		document.addEventListener("dragleave", onLeave);
		document.addEventListener("drop", onDrop);
		return () => {
			document.removeEventListener("dragenter", onEnter);
			document.removeEventListener("dragleave", onLeave);
			document.removeEventListener("drop", onDrop);
		};
	}, [onEnter, onLeave, onDrop]);

	return dragType;
}
