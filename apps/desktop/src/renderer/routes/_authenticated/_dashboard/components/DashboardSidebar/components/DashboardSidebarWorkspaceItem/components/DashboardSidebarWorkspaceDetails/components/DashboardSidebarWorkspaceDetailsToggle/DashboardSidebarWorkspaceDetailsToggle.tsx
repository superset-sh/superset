import { cn } from "@superset/ui/utils";
import { LuChevronRight } from "react-icons/lu";
import { STROKE_WIDTH } from "renderer/screens/main/components/WorkspaceSidebar/constants";

interface DashboardSidebarWorkspaceDetailsToggleProps {
	isExpanded: boolean;
	summary: string;
	isInSection?: boolean;
	onToggle: () => void;
}

export function DashboardSidebarWorkspaceDetailsToggle({
	isExpanded,
	summary,
	isInSection = false,
	onToggle,
}: DashboardSidebarWorkspaceDetailsToggleProps) {
	return (
		<button
			type="button"
			aria-expanded={isExpanded}
			onClick={(event) => {
				event.stopPropagation();
				onToggle();
			}}
			className={cn(
				"group/details flex w-full items-center gap-1 py-0.5 text-[11px] text-muted-foreground/70 transition-colors hover:text-muted-foreground",
				isInSection ? "pl-7" : "pl-5",
			)}
		>
			<LuChevronRight
				className={cn(
					"size-3 shrink-0 transition-transform",
					isExpanded && "rotate-90",
				)}
				strokeWidth={STROKE_WIDTH}
			/>
			<span className="truncate">{summary}</span>
		</button>
	);
}
