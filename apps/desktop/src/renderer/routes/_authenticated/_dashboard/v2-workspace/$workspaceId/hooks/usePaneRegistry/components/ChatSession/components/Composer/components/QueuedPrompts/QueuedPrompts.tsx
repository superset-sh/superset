import { userMessageText } from "@superset/chat/core";
import type { UserMessage } from "@superset/chat/protocol";
import { Queue } from "@superset/ui/ai-elements/queue";
import type { KeyboardEvent, RefObject } from "react";
import { parseAttachmentTags } from "../../../../utils/attachmentTags";
import { QueuedPromptRow } from "./components/QueuedPromptRow";
import { QueuePausedBar } from "./components/QueuePausedBar";

export function QueuedPrompts({
	prompts,
	paused,
	actionable,
	listRef,
	onClear,
	onEdit,
	onExit,
	onRemove,
	onResume,
	onSteer,
}: {
	prompts: UserMessage[];
	paused: boolean;
	actionable: boolean;
	listRef: RefObject<HTMLUListElement | null>;
	onClear: () => void;
	onEdit: (prompt: UserMessage) => void;
	onExit: () => void;
	onRemove: (id: string) => void;
	onResume: () => void;
	onSteer: (id: string) => void;
}) {
	if (prompts.length === 0) return null;

	const onKeyDown = (event: KeyboardEvent<HTMLUListElement>) => {
		if (!actionable || event.metaKey || event.ctrlKey || event.altKey) return;
		const rows = [
			...event.currentTarget.querySelectorAll<HTMLElement>("[data-queue-row]"),
		];
		const index =
			event.target instanceof HTMLElement ? rows.indexOf(event.target) : -1;
		const prompt = prompts[index];
		if (!prompt) return;
		const hasAttachments =
			prompt.content.some((content) => content.type === "attachment") ||
			parseAttachmentTags(userMessageText(prompt)).attachments.length > 0;
		switch (event.key) {
			case "ArrowUp":
				rows[Math.max(0, index - 1)]?.focus();
				break;
			case "ArrowDown":
				if (index + 1 < rows.length) rows[index + 1]?.focus();
				else onExit();
				break;
			case "Enter":
				onSteer(prompt.id);
				onExit();
				break;
			case "Backspace":
			case "Delete": {
				const neighbor = rows[index + 1] ?? rows[index - 1];
				onRemove(prompt.id);
				if (neighbor) neighbor.focus();
				else onExit();
				break;
			}
			case "e":
				if (hasAttachments) return;
				onEdit(prompt);
				break;
			case "Escape":
				onExit();
				break;
			default:
				return;
		}
		event.preventDefault();
		event.stopPropagation();
	};

	return (
		<Queue className="mx-4 max-h-56 gap-0 overflow-y-auto rounded-t-2xl rounded-b-none border-border/60 border-b-0 bg-muted/40 px-0 py-1 shadow-none">
			{paused && (
				<QueuePausedBar
					actionable={actionable}
					onClear={onClear}
					onResume={onResume}
				/>
			)}
			<ul onKeyDown={onKeyDown} ref={listRef}>
				{prompts.map((prompt) => (
					<QueuedPromptRow
						actionable={actionable}
						key={prompt.id}
						onEdit={onEdit}
						onRemove={onRemove}
						onSteer={onSteer}
						prompt={prompt}
					/>
				))}
			</ul>
		</Queue>
	);
}
