import { LuChevronRight, LuLayers } from "react-icons/lu";
import { useOpenWorkspacesList } from "renderer/stores/app-state";
import { NewWorkspaceButton } from "./NewWorkspaceButton";

export function WorkspaceSidebarHeader() {
	const openWorkspacesList = useOpenWorkspacesList();

	return (
		<div className="flex flex-col border-b border-border px-2 pt-2 pb-2">
			<button
				type="button"
				onClick={openWorkspacesList}
				className="flex items-center gap-2 px-2 py-1.5 w-full text-muted-foreground hover:text-foreground hover:bg-accent/50 rounded-md transition-colors group"
			>
				<div className="flex items-center justify-center size-5">
					<LuLayers className="size-4" />
				</div>
				<span className="text-sm font-medium flex-1 text-left">
					Workspaces
				</span>
				<LuChevronRight className="size-4 opacity-0 group-hover:opacity-100 transition-opacity" />
			</button>
			<NewWorkspaceButton />
		</div>
	);
}
