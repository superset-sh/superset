import { Button } from "@superset/ui/button";
import { PanelLeft, PanelRight } from "lucide-react";
import { useAppStore } from "renderer/stores";

export function SidebarControl() {
	const { isSidebarOpen, toggleSidebar } = useAppStore();

	return (
		<Button
			variant="ghost"
			size="icon"
			onClick={toggleSidebar}
			aria-label="Toggle sidebar"
			className="no-drag"
		>
			{isSidebarOpen ? (
				<PanelLeft className="size-4" />
			) : (
				<PanelRight className="size-4" />
			)}
		</Button>
	);
}
