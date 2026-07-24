import { LuX } from "react-icons/lu";
import { useDashboardSidebarPortKill } from "renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/components/DashboardSidebarPortsList/hooks/useDashboardSidebarPortKill";
import type { DashboardSidebarPort } from "renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/components/DashboardSidebarPortsList/hooks/useDashboardSidebarPortsData";
import { usePortOpenActions } from "renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/hooks/usePortOpenActions";
import { STROKE_WIDTH } from "renderer/screens/main/components/WorkspaceSidebar/constants";

interface DashboardSidebarPortHoverRowProps {
	port: DashboardSidebarPort;
}

export function DashboardSidebarPortHoverRow({
	port,
}: DashboardSidebarPortHoverRowProps) {
	const { isPending, killPort } = useDashboardSidebarPortKill();
	const { openPrimary } = usePortOpenActions(port);

	return (
		<div className="group/row flex items-center gap-1.5 rounded-sm px-2 py-1 hover:bg-muted">
			<button
				type="button"
				onClick={openPrimary}
				disabled={isPending}
				className="flex min-w-0 flex-1 items-center gap-1.5 text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
			>
				<span className="size-1.5 shrink-0 rounded-full bg-green-500" />
				{port.label && (
					<span className="min-w-0 truncate text-xs">{port.label}</span>
				)}
				<span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
					localhost:{port.port}
				</span>
			</button>
			{/* Always in layout, shown via visibility so the row never changes
			    size on hover. */}
			<button
				type="button"
				onClick={() => {
					if (isPending) return;
					void killPort(port);
				}}
				disabled={isPending}
				aria-label={`Close port ${port.port}`}
				className="invisible flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring group-focus-within/row:visible group-hover/row:visible"
			>
				<LuX className="size-3" strokeWidth={STROKE_WIDTH} />
			</button>
		</div>
	);
}
