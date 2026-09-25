import { cn } from "@superset/ui/utils";

const SIDEBAR_HEADER_TAB_ACTIVE_CLASS_NAME = "text-foreground bg-border/30";
const SIDEBAR_HEADER_TAB_INACTIVE_CLASS_NAME =
	"text-muted-foreground/70 hover:text-muted-foreground hover:bg-tertiary/20";
const SIDEBAR_HEADER_TAB_ACTIVE_INVERTED_CLASS_NAME =
	"rounded-t-md bg-background text-foreground border border-border/70 border-b-transparent";
const SIDEBAR_HEADER_TAB_INACTIVE_INVERTED_CLASS_NAME =
	"rounded-t-md text-muted-foreground/70 hover:text-muted-foreground hover:bg-muted/40 border border-transparent border-b-border";

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
