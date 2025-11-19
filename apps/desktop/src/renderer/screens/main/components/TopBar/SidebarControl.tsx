import { Button } from "@superset/ui/button";
import { HiMiniBars3, HiMiniBars3BottomLeft } from "react-icons/hi2";
import { useSidebarStore } from "renderer/stores";

export function SidebarControl() {
	const { isSidebarOpen, toggleSidebar } = useSidebarStore();

	return (
		<Button
			variant="ghost"
			size="icon"
			onClick={toggleSidebar}
			aria-label="Toggle sidebar"
			className="no-drag"
		>
			{isSidebarOpen ? (
				<HiMiniBars3BottomLeft className="size-4" />
			) : (
				<HiMiniBars3 className="size-4" />
			)}
		</Button>
	);
}
