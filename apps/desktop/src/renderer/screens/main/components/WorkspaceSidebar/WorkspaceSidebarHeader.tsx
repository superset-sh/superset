import { LuChevronRight, LuLayers } from "react-icons/lu";
import { useOpenWorkspacesList } from "renderer/stores/app-state";

export function WorkspaceSidebarHeader() {
	const openWorkspacesList = useOpenWorkspacesList();

	return (
		<button
			type="button"
			onClick={openWorkspacesList}
			className="flex items-center gap-2 px-3 py-2 border-b border-border h-10 w-full hover:bg-muted/50 transition-colors group"
		>
			<LuLayers className="w-4 h-4 text-muted-foreground" />
			<span className="text-sm font-medium text-muted-foreground flex-1 text-left">
				Workspaces
			</span>
			<LuChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
		</button>
	);
}
