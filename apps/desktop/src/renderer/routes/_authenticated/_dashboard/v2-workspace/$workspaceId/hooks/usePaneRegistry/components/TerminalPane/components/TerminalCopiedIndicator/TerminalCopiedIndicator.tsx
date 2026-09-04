import { Trans } from "@lingui/react/macro";
import { cn } from "@superset/ui/utils";
import { LuCheck } from "react-icons/lu";
import { useCopiedIndicator } from "../../hooks/useCopyOnSelect";

interface TerminalCopiedIndicatorProps {
	terminalInstanceId: string;
}

/**
 * Copy-on-select has no other feedback: the selection is copied without the
 * user pressing anything, so a brief pill is the only sign it happened.
 */
export function TerminalCopiedIndicator({
	terminalInstanceId,
}: TerminalCopiedIndicatorProps) {
	const isVisible = useCopiedIndicator(terminalInstanceId);

	return (
		<div
			className={cn(
				"pointer-events-none absolute right-3 bottom-3 z-10 flex items-center gap-1.5",
				"rounded-full border border-border bg-background/90 px-2 py-1",
				"text-muted-foreground text-xs shadow-sm backdrop-blur-sm",
				"transition-all duration-150",
				isVisible ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0",
			)}
		>
			<LuCheck className="size-3" />
			<Trans>Copied</Trans>
		</div>
	);
}
