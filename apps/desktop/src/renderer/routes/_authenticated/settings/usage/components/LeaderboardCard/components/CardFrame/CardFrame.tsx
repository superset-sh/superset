import { useLingui } from "@lingui/react/macro";
import { cn } from "@superset/ui/utils";
import { ChevronDownIcon, ChevronRightIcon, TrophyIcon } from "lucide-react";
import type { ReactNode } from "react";

interface CardFrameProps {
	title: ReactNode;
	actions?: ReactNode;
	collapsed: boolean;
	onToggleCollapsed: () => void;
	children: ReactNode;
}

// One flat surface: a single border, a header line that survives collapse,
// and the body underneath. The trophy doubles as the fold toggle and turns
// into a chevron while the card is hovered, sidebar-folder style.
export function CardFrame({
	title,
	actions,
	collapsed,
	onToggleCollapsed,
	children,
}: CardFrameProps) {
	const { t } = useLingui();
	const Chevron = collapsed ? ChevronRightIcon : ChevronDownIcon;

	return (
		<section
			className={cn(
				"group rounded-md border border-border px-4",
				collapsed ? "py-2" : "py-3",
			)}
		>
			<div className="flex items-center gap-3">
				<button
					type="button"
					className="flex flex-1 min-w-0 items-center gap-3 text-left"
					aria-expanded={!collapsed}
					aria-label={
						collapsed
							? t({
									message: "Expand",
								})
							: t({
									message: "Collapse",
								})
					}
					onClick={onToggleCollapsed}
				>
					<span className="relative size-4 shrink-0 text-muted-foreground">
						<TrophyIcon className="absolute inset-0 size-4 group-hover:opacity-0" />
						<Chevron className="absolute inset-0 size-4 opacity-0 group-hover:opacity-100" />
					</span>
					<span className="flex-1 min-w-0 truncate text-sm font-medium text-foreground">
						{title}
					</span>
				</button>
				{actions}
			</div>
			{!collapsed && children}
		</section>
	);
}
