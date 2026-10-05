import type { UserMessage } from "@superset/chat/protocol";
import { Queue } from "@superset/ui/ai-elements/queue";
import { QueuedPromptRow } from "./components/QueuedPromptRow";
import { QueuePausedBar } from "./components/QueuePausedBar";

export function QueuedPrompts({
	prompts,
	paused,
	actionable,
	onClear,
	onEdit,
	onRemove,
	onResume,
	onSteer,
}: {
	prompts: UserMessage[];
	paused: boolean;
	actionable: boolean;
	onClear: () => void;
	onEdit: (prompt: UserMessage) => void;
	onRemove: (id: string) => void;
	onResume: () => void;
	onSteer: (id: string) => void;
}) {
	if (prompts.length === 0) return null;

	return (
		<Queue className="mx-4 max-h-56 gap-0 overflow-y-auto rounded-t-2xl rounded-b-none border-border/60 border-b-0 bg-muted/40 px-0 py-1 shadow-none">
			{paused && (
				<QueuePausedBar
					actionable={actionable}
					onClear={onClear}
					onResume={onResume}
				/>
			)}
			<ul>
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
