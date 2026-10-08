import { Trans } from "@lingui/react/macro";
import { QueueItemAction } from "@superset/ui/ai-elements/queue";
import { Pause, Play, Trash2 } from "lucide-react";

export function QueuePausedBar({
	actionable,
	onClear,
	onResume,
}: {
	actionable: boolean;
	onClear: () => void;
	onResume: () => void;
}) {
	return (
		<div className="flex items-center gap-2 border-border/60 border-b py-1.5 pr-2 pl-3 text-muted-foreground text-sm">
			<Pause className="size-3.5 shrink-0" />
			<span className="min-w-0 flex-1 truncate">
				<Trans>Queue paused because you interrupted</Trans>
			</span>
			{actionable && (
				<QueueItemAction
					className="gap-1 px-1.5 py-0.5 font-normal text-xs opacity-100"
					onClick={onClear}
				>
					<Trash2 className="size-3.5" />
					<Trans>Clear all</Trans>
				</QueueItemAction>
			)}
			<QueueItemAction
				className="gap-1 px-1.5 py-0.5 font-normal text-xs opacity-100"
				onClick={onResume}
			>
				<Play className="size-3.5" />
				<Trans>Resume</Trans>
			</QueueItemAction>
		</div>
	);
}
