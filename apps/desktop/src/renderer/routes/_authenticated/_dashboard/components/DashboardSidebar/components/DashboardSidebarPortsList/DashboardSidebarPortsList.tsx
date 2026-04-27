import { LuChevronRight, LuRadioTower } from "react-icons/lu";
import { STROKE_WIDTH } from "renderer/screens/main/components/WorkspaceSidebar/constants";
import { usePortsStore } from "renderer/stores";
import { DashboardSidebarPortGroup } from "./components/DashboardSidebarPortGroup";
import { useDashboardSidebarPortsData } from "./hooks/useDashboardSidebarPortsData";

export function DashboardSidebarPortsList() {
	const isCollapsed = usePortsStore((state) => state.isListCollapsed);
	const toggleCollapsed = usePortsStore((state) => state.toggleListCollapsed);
	const { totalPortCount, workspacePortGroups } =
		useDashboardSidebarPortsData();

	if (totalPortCount === 0) {
		return null;
	}

	return (
		<div className="border-t border-border pt-3">
			<div className="group flex w-full items-center gap-1.5 px-3 pb-2 font-medium text-[11px] text-muted-foreground/70 uppercase tracking-wider transition-colors hover:text-muted-foreground">
				<button
					type="button"
					aria-expanded={!isCollapsed}
					onClick={toggleCollapsed}
					className="flex items-center gap-1.5 focus-visible:text-muted-foreground focus-visible:outline-none"
				>
					<span className="relative size-3">
						<LuRadioTower
							className="absolute inset-0 size-3 transition-opacity group-hover:opacity-0"
							strokeWidth={STROKE_WIDTH}
						/>
						<LuChevronRight
							className={`absolute inset-0 size-3 opacity-0 transition-[opacity,transform] group-hover:opacity-100 ${isCollapsed ? "" : "rotate-90"}`}
							strokeWidth={STROKE_WIDTH}
						/>
					</span>
					Ports
				</button>

				<span className="ml-auto text-[10px] font-normal">
					{totalPortCount}
				</span>
			</div>
			{!isCollapsed && (
				<div className="max-h-72 space-y-2 overflow-y-auto pb-1 hide-scrollbar">
					{workspacePortGroups.map((group) => (
						<DashboardSidebarPortGroup key={group.workspaceId} group={group} />
					))}
				</div>
			)}
		</div>
	);
}
