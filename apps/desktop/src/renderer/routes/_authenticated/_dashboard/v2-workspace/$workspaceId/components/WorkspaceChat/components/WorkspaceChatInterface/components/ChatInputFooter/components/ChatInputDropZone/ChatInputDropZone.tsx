import { usePromptInputController } from "@superset/ui/ai-elements/prompt-input";
import type React from "react";
import { useCallback } from "react";
import { type DragType, useDocumentDrag } from "../../hooks/useDocumentDrag";

interface ChatInputDropZoneProps {
	className?: string;
	children: (dragType: DragType) => React.ReactNode;
}

export function ChatInputDropZone({
	className,
	children,
}: ChatInputDropZoneProps) {
	const dragType = useDocumentDrag();
	const { textInput } = usePromptInputController();

	const handlePathDragOver = useCallback((event: React.DragEvent) => {
		if (
			!event.dataTransfer.types.includes("Files") &&
			event.dataTransfer.types.includes("text/plain")
		) {
			event.preventDefault();
			event.dataTransfer.dropEffect = "copy";
		}
	}, []);

	const handlePathDrop = useCallback(
		(event: React.DragEvent) => {
			if (event.dataTransfer.types.includes("Files")) return;
			const path = event.dataTransfer.getData("text/plain");
			if (!path) return;
			event.preventDefault();
			event.stopPropagation();
			const current = textInput.value;
			const needsSpace = current.length > 0 && !current.endsWith(" ");
			textInput.setInput(`${current}${needsSpace ? " " : ""}${path} `);

			const textarea = document.querySelector<HTMLTextAreaElement>(
				"[data-slot=input-group-control]",
			);
			textarea?.focus();
		},
		[textInput],
	);

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: drop target for file path drags
		<div
			className={className}
			onDragOver={handlePathDragOver}
			onDrop={handlePathDrop}
		>
			{children(dragType)}
		</div>
	);
}
