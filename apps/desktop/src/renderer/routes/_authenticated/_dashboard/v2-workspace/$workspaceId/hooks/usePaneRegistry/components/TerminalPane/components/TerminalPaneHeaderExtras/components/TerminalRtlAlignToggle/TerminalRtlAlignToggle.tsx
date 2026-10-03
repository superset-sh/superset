import { useLingui } from "@lingui/react/macro";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { AlignRight } from "lucide-react";
import { useSyncExternalStore } from "react";
import {
	getTerminalAlignRight,
	onTerminalBidiChange,
	setTerminalAlignRight,
} from "renderer/lib/terminal/terminal-bidi";

/**
 * Toggles right-alignment of RTL rows (Hebrew, Arabic) across every open
 * terminal. Rows that start in a left-to-right script are never moved.
 */
export function TerminalRtlAlignToggle() {
	const { t } = useLingui();
	const isOn = useSyncExternalStore(
		onTerminalBidiChange,
		getTerminalAlignRight,
	);
	const label = t({ message: "Align Hebrew and Arabic lines right" });

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<button
					type="button"
					onClick={() => setTerminalAlignRight(!isOn)}
					aria-label={label}
					aria-pressed={isOn}
					className={cn(
						"hidden rounded p-1 transition-colors @min-[200px]/pane-header:block",
						isOn
							? "bg-secondary text-foreground"
							: "text-muted-foreground/60 hover:text-muted-foreground",
					)}
				>
					<AlignRight className="size-3.5" />
				</button>
			</TooltipTrigger>
			<TooltipContent side="bottom">{label}</TooltipContent>
		</Tooltip>
	);
}
