import { cn } from "@superset/ui/utils";

const SIDEBAR_HEADER_TAB_ACTIVE_CLASS_NAME = "text-foreground bg-border/30";
const SIDEBAR_HEADER_TAB_INACTIVE_CLASS_NAME =
	"text-muted-foreground/70 hover:text-muted-foreground hover:bg-tertiary/20";
// Inverted scheme: the shaded block marks the inactive tabs while the active
// tab blends into the panel below it. Every state keeps a 1px border on all
// sides (transparent where hidden) so tabs don't shift when switching.
const SIDEBAR_HEADER_TAB_ACTIVE_INVERTED_CLASS_NAME =
	"text-foreground border border-border border-b-transparent";
const SIDEBAR_HEADER_TAB_INACTIVE_INVERTED_CLASS_NAME =
	"bg-border/30 text-muted-foreground/70 hover:text-muted-foreground hover:bg-border/20 border border-transparent border-b-border";

export function getSidebarHeaderTabButtonClassName({
	isActive,
	compact = false,
	inverted = false,
}: {
	isActive: boolean;
	compact?: boolean;
	inverted?: boolean;
}) {
	const activeClassName = inverted
		? SIDEBAR_HEADER_TAB_ACTIVE_INVERTED_CLASS_NAME
		: SIDEBAR_HEADER_TAB_ACTIVE_CLASS_NAME;
	const inactiveClassName = inverted
		? SIDEBAR_HEADER_TAB_INACTIVE_INVERTED_CLASS_NAME
		: SIDEBAR_HEADER_TAB_INACTIVE_CLASS_NAME;
	return cn(
		"h-full shrink-0 transition-all",
		compact
			? "flex w-10 items-center justify-center"
			: "flex items-center gap-1.5 px-3 text-xs",
		isActive ? activeClassName : inactiveClassName,
	);
}

export const sidebarHeaderTabTriggerClassName = cn(
	"flex h-full flex-none shrink-0 items-center gap-1.5 rounded-none border-0 bg-transparent px-3 text-xs font-normal shadow-none transition-all outline-none",
	"data-[state=active]:bg-border/30 data-[state=active]:text-foreground data-[state=active]:shadow-none",
	"data-[state=inactive]:text-muted-foreground/70 data-[state=inactive]:hover:bg-tertiary/20 data-[state=inactive]:hover:text-muted-foreground",
);
