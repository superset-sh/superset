import { COMPANY } from "@superset/shared/constants";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { LuChevronRight, LuCircleHelp, LuRadioTower } from "react-icons/lu";
import { usePortsStore } from "renderer/stores";
import { STROKE_WIDTH } from "../constants";
import { WorkspacePortGroup } from "./components/WorkspacePortGroup";
import { usePortsData } from "./hooks/usePortsData";

const PORTS_DOCS_URL = `${COMPANY.DOCS_URL}/ports`;

export function PortsList() {
	const isCollapsed = usePortsStore((s) => s.isListCollapsed);
	const toggleCollapsed = usePortsStore((s) => s.toggleListCollapsed);

	const { workspacePortGroups, totalPortCount } = usePortsData();

	if (totalPortCount === 0) {
		return null;
	}

	const handleOpenPortsDocs = (e: React.MouseEvent) => {
		e.stopPropagation();
		window.open(PORTS_DOCS_URL, "_blank");
	};

	return (
		<div className="pt-3 border-t border-border">
			<div className="group text-[11px] uppercase tracking-wider text-muted-foreground/70 px-3 pb-2 font-medium flex items-center gap-1.5 w-full hover:text-muted-foreground transition-colors">
				<button
					type="button"
					aria-expanded={!isCollapsed}
					onClick={toggleCollapsed}
					className="flex items-center gap-1.5 focus-visible:text-muted-foreground focus-visible:outline-none"
				>
					<LuChevronRight
						className={`size-3 transition-transform ${isCollapsed ? "" : "rotate-90"}`}
						strokeWidth={STROKE_WIDTH}
					/>
					<LuRadioTower className="size-3" strokeWidth={STROKE_WIDTH} />
					Ports
				</button>

				<Tooltip delayDuration={300}>
					<TooltipTrigger asChild>
						<button
							type="button"
							onClick={handleOpenPortsDocs}
							className="ml-auto p-0.5 rounded hover:bg-muted/50 opacity-0 group-hover:opacity-100 transition-opacity"
						>
							<LuCircleHelp className="size-3" strokeWidth={STROKE_WIDTH} />
						</button>
					</TooltipTrigger>
					<TooltipContent side="top" sideOffset={4}>
						<p className="text-xs">Learn about static port configuration</p>
					</TooltipContent>
				</Tooltip>
				<span className="text-[10px] font-normal">{totalPortCount}</span>
			</div>
			{!isCollapsed && (
				<div className="space-y-2 max-h-72 overflow-y-auto pb-1 hide-scrollbar">
					{workspacePortGroups.map((group) => (
						<WorkspacePortGroup key={group.workspaceId} group={group} />
					))}
				</div>
			)}
		</div>
	);
}
