import { useLingui } from "@lingui/react/macro";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { AlignCenter } from "lucide-react";
import { useSettings } from "renderer/stores/settings";

export function TerminalReadingWidthToggle() {
	const { t } = useLingui();
	const enabled = useSettings((state) => state.terminalReadingWidth);
	const update = useSettings((state) => state.update);
	const label = t({ message: "Reading width" });

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<button
					type="button"
					onMouseDown={(event) => event.preventDefault()}
					onClick={() => update("terminalReadingWidth", !enabled)}
					aria-label={label}
					aria-pressed={enabled}
					className={cn(
						"hidden rounded p-1 transition-colors @min-[200px]/pane-header:block",
						enabled
							? "bg-secondary text-foreground"
							: "text-muted-foreground/60 hover:text-muted-foreground",
					)}
				>
					<AlignCenter className="size-3.5" />
				</button>
			</TooltipTrigger>
			<TooltipContent side="bottom">{label}</TooltipContent>
		</Tooltip>
	);
}
