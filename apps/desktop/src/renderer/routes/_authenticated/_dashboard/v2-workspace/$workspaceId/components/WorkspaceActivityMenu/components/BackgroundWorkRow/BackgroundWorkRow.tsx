import { Trans, useLingui } from "@lingui/react/macro";
import { formatAge } from "@superset/i18n/format";
import { Spinner } from "@superset/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { Bot, Square, SquareTerminal } from "lucide-react";
import type { BackgroundWork } from "../../utils/collectBackgroundWork";

export function BackgroundWorkRow({
	work,
	now,
	stopping,
	onOpen,
	onStop,
}: {
	work: BackgroundWork;
	now: number;
	stopping: boolean;
	onOpen: (work: BackgroundWork) => void;
	onStop: (work: BackgroundWork) => void;
}) {
	const { t } = useLingui();
	const Icon = work.kind === "subagent" ? Bot : SquareTerminal;
	const label =
		work.name ||
		(work.kind === "subagent"
			? t({ message: "Subagent" })
			: work.detachedTerminal
				? t({ message: "Terminal" })
				: t({ message: "Background task" }));
	return (
		<div
			className={cn(
				"group flex min-h-7 items-center gap-2 rounded-sm py-0.5 pr-1 pl-2 text-xs transition-colors hover:bg-accent",
				stopping && "opacity-50",
			)}
		>
			<button
				type="button"
				onClick={() => onOpen(work)}
				className="flex min-w-0 flex-1 items-center gap-2 rounded-sm text-left outline-none focus-visible:ring-1 focus-visible:ring-ring"
			>
				<Icon className="size-3.5 shrink-0 text-muted-foreground" />
				<span className="min-w-0 flex-1">
					<span className="block truncate text-foreground">{label}</span>
					{work.detail && (
						<span className="block truncate text-[11px] text-muted-foreground">
							{work.detail}
						</span>
					)}
				</span>
				<span className="shrink-0 text-[11px] text-muted-foreground/70 tabular-nums">
					{formatAge(work.startedAtMs, now)}
				</span>
			</button>
			{work.stop && (
				<Tooltip>
					<TooltipTrigger asChild>
						<button
							type="button"
							aria-label={t({ message: `Stop ${label}` })}
							disabled={stopping}
							onClick={() => onStop(work)}
							className="flex size-6 shrink-0 items-center justify-center rounded-sm text-muted-foreground outline-none transition-colors hover:bg-background hover:text-foreground focus-visible:bg-background disabled:pointer-events-none"
						>
							{stopping ? (
								<Spinner className="size-3" />
							) : (
								<Square className="size-2.5 fill-current" />
							)}
						</button>
					</TooltipTrigger>
					<TooltipContent side="top">
						<Trans>Stop</Trans>
					</TooltipContent>
				</Tooltip>
			)}
		</div>
	);
}
