/**
 * FollowupDock — shows messages the user typed while the agent was
 * busy. Items drain automatically to the agent once the session goes
 * idle (see useFollowupDrain). Users can pause/resume the drain,
 * send-now, edit, or remove individual items.
 */

import { Button } from "@superset/ui/button";
import { Pause, Play, Send, Trash2 } from "lucide-react";
import { useState } from "react";
import type { FollowupQueueItem } from "../../../../store/followupStore";
import { DockFrame } from "./DockFrame";

export interface FollowupDockProps {
	items: FollowupQueueItem[];
	paused: boolean;
	onSendNow: (id: string) => void;
	onRemove: (id: string) => void;
	onEdit: (id: string, prompt: string) => void;
	onTogglePause: () => void;
}

export function FollowupDock({
	items,
	paused,
	onSendNow,
	onRemove,
	onEdit,
	onTogglePause,
}: FollowupDockProps) {
	if (items.length === 0) return null;
	return (
		<DockFrame
			tone="muted"
			label={
				paused
					? `Queued (paused) — ${items.length}`
					: `Queued for next idle — ${items.length}`
			}
		>
			<ul className="space-y-1">
				{items.map((item) => (
					<QueueRow
						key={item.id}
						item={item}
						onSendNow={() => onSendNow(item.id)}
						onRemove={() => onRemove(item.id)}
						onEdit={(next) => onEdit(item.id, next)}
					/>
				))}
			</ul>
			<div className="flex items-center gap-2">
				<Button size="sm" variant="ghost" onClick={onTogglePause}>
					{paused ? (
						<>
							<Play className="mr-1 size-3" /> Resume drain
						</>
					) : (
						<>
							<Pause className="mr-1 size-3" /> Pause drain
						</>
					)}
				</Button>
			</div>
		</DockFrame>
	);
}

function QueueRow({
	item,
	onSendNow,
	onRemove,
	onEdit,
}: {
	item: FollowupQueueItem;
	onSendNow: () => void;
	onRemove: () => void;
	onEdit: (next: string) => void;
}) {
	const [editing, setEditing] = useState(false);
	const [draft, setDraft] = useState(item.prompt);

	return (
		<li className="flex items-start gap-2 text-xs">
			{editing ? (
				<form
					className="flex flex-1 items-start gap-1"
					onSubmit={(e) => {
						e.preventDefault();
						if (draft.trim()) {
							onEdit(draft.trim());
							setEditing(false);
						}
					}}
				>
					<input
						autoFocus
						value={draft}
						onChange={(e) => setDraft(e.target.value)}
						onBlur={() => setEditing(false)}
						onKeyDown={(e) => {
							if (e.key === "Escape") {
								setDraft(item.prompt);
								setEditing(false);
							}
						}}
						className="border-border bg-background flex-1 rounded border px-2 py-1 text-xs"
					/>
				</form>
			) : (
				<button
					type="button"
					onClick={() => setEditing(true)}
					className="hover:bg-muted/60 flex-1 rounded px-1 py-0.5 text-left"
					title="Click to edit"
				>
					{item.prompt.length > 160
						? `${item.prompt.slice(0, 160)}…`
						: item.prompt}
				</button>
			)}
			<button
				type="button"
				onClick={onSendNow}
				className="text-muted-foreground hover:text-foreground shrink-0 rounded p-1"
				title="Send now"
			>
				<Send className="size-3" />
			</button>
			<button
				type="button"
				onClick={onRemove}
				className="text-muted-foreground hover:text-destructive shrink-0 rounded p-1"
				title="Remove"
			>
				<Trash2 className="size-3" />
			</button>
		</li>
	);
}
