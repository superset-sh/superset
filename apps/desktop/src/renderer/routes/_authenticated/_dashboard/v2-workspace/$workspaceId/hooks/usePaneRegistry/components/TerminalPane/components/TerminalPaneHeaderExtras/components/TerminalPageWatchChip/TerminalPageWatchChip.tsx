import { Plural, useLingui } from "@lingui/react/macro";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { Eye } from "lucide-react";
import { usePageWatchers } from "renderer/hooks/host-service/usePageWatchers";

interface TerminalPageWatchChipProps {
	workspaceId: string;
	terminalId: string;
}

export function TerminalPageWatchChip({
	workspaceId,
	terminalId,
}: TerminalPageWatchChipProps) {
	const { t } = useLingui();
	const watchers = usePageWatchers(workspaceId);
	const mine = [...watchers.values()].filter(
		(watcher) => watcher.terminalId === terminalId,
	);

	if (mine.length === 0) return null;

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<span
					role="img"
					aria-label={t({
						message: "Pages this agent is watching for comments",
					})}
					className="flex h-5 items-center gap-1 rounded px-1 text-muted-foreground/70 text-xs"
				>
					<Eye className="size-3" />
					{mine.length > 1 ? <span>{mine.length}</span> : null}
				</span>
			</TooltipTrigger>
			<TooltipContent side="bottom" className="max-w-64">
				<div className="flex flex-col gap-1">
					<Plural
						value={mine.length}
						one="Watching # page for comments"
						other="Watching # pages for comments"
					/>
					<div className="flex flex-col gap-0.5 text-muted-foreground">
						{mine.map((watcher) => (
							<span key={watcher.pageId} className="truncate">
								{watcher.title}
							</span>
						))}
					</div>
				</div>
			</TooltipContent>
		</Tooltip>
	);
}
