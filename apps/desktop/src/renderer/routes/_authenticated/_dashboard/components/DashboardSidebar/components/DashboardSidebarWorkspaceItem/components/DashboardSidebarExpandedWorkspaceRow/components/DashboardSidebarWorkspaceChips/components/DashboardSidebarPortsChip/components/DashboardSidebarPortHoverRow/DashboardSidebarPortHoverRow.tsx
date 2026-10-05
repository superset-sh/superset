import { DashboardSidebarPortRow } from "renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/components/DashboardSidebarPortRow";
import { useDashboardSidebarPortKill } from "renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/hooks/useDashboardSidebarPortKill";
import type { DashboardSidebarPort } from "renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/hooks/useDashboardSidebarPortsData";
import { usePortOpenActions } from "renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/hooks/usePortOpenActions";
import { usePortForward } from "renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/providers/PortForwardsProvider";
import { PortForwardBusyActions } from "renderer/routes/_authenticated/_dashboard/components/PortForwardBusyActions";

interface DashboardSidebarPortHoverRowProps {
	port: DashboardSidebarPort;
}

export function DashboardSidebarPortHoverRow({
	port,
}: DashboardSidebarPortHoverRowProps) {
	const { isPending, killPort } = useDashboardSidebarPortKill();
	const { openPrimary } = usePortOpenActions(port);
	const forward = usePortForward(port);

	return (
		<DashboardSidebarPortRow
			port={port}
			forward={forward}
			isBusy={isPending}
			onOpen={openPrimary}
			onClose={() => {
				if (isPending) return;
				void killPort(port);
			}}
			actions={forward && <PortForwardBusyActions forward={forward} />}
		/>
	);
}
