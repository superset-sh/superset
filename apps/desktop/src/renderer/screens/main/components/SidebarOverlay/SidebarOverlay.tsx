import { useWorkspaceContext } from "../../../../contexts";
import { Sidebar } from "../Sidebar";

interface SidebarOverlayProps {
	isVisible: boolean;
	onMouseLeave: () => void;
}

export function SidebarOverlay({
	isVisible,
	onMouseLeave,
}: SidebarOverlayProps) {
	const { workspaces } = useWorkspaceContext();
	
	if (!isVisible || !workspaces) return null;

	return (
		<aside
			className="fixed left-0 top-0 bottom-0 w-80 z-40 animate-in slide-in-from-left duration-200"
			onMouseLeave={onMouseLeave}
		>
			<div className="h-full border-r border-neutral-800 bg-neutral-950/95 backdrop-blur-sm">
				<Sidebar />
			</div>
		</aside>
	);
}

