import { cn } from "@superset/ui/utils";

const SIDEBAR_HEADER_TAB_ACTIVE_CLASS_NAME = "text-foreground bg-border/30";
const SIDEBAR_HEADER_TAB_INACTIVE_CLASS_NAME =
	"text-muted-foreground/70 hover:text-muted-foreground hover:bg-tertiary/20";

export function getSidebarHeaderTabButtonClassName({
	isActive,
	compact = false,
}: {
	isActive: boolean;
	compact?: boolean;
}) {
	return cn(
		"h-full shrink-0 transition-all",
		compact
			? "flex w-10 items-center justify-center"
			: "flex items-center gap-2 px-3 text-sm",
		isActive
			? SIDEBAR_HEADER_TAB_ACTIVE_CLASS_NAME
			: SIDEBAR_HEADER_TAB_INACTIVE_CLASS_NAME,
	);
}

export const sidebarHeaderTabTriggerClassName = cn(
	"flex h-full flex-none shrink-0 items-center gap-2 rounded-none border-0 bg-transparent px-3 text-sm font-normal shadow-none transition-all outline-none",
	"data-[state=active]:bg-border/30 data-[state=active]:text-foreground data-[state=active]:shadow-none",
	"data-[state=inactive]:text-muted-foreground/70 data-[state=inactive]:hover:bg-tertiary/20 data-[state=inactive]:hover:text-muted-foreground",
);
