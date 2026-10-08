import { Trans } from "@lingui/react/macro";
import { cn } from "@superset/ui/utils";
import { GitCompareArrows } from "lucide-react";
import type { ChangesPillStats } from "../../../../utils/changesPillStats";
import { ChangesStats } from "../../../ChangesStats";

interface ChangesMenuRowProps {
	stats: ChangesPillStats | null;
	isOpen: boolean;
	onToggle: () => void;
}

export function ChangesMenuRow({
	stats,
	isOpen,
	onToggle,
}: ChangesMenuRowProps) {
	return (
		<button
			type="button"
			onClick={onToggle}
			aria-pressed={isOpen}
			className={cn(
				"flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs text-foreground outline-none transition-colors hover:bg-accent focus-visible:bg-accent",
				isOpen && "bg-accent/60",
			)}
		>
			<GitCompareArrows className="size-3.5 shrink-0 text-muted-foreground" />
			<span className="min-w-0 flex-1 truncate font-medium">
				<Trans>Changes</Trans>
			</span>
			{stats && stats.fileCount > 0 && (
				<span className="flex shrink-0 items-center gap-1">
					<ChangesStats stats={stats} />
				</span>
			)}
		</button>
	);
}
