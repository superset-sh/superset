import { LuLayers, LuPlus } from "react-icons/lu";
import { trpc } from "renderer/lib/trpc";
import { useOpenNewWorkspaceModal } from "renderer/stores/new-workspace-modal";

export function WorkspaceSidebarHeader() {
	const openModal = useOpenNewWorkspaceModal();
	const { data: activeWorkspace } = trpc.workspaces.getActive.useQuery();

	const handleNewWorkspace = () => {
		const projectId = activeWorkspace?.projectId;
		openModal(projectId);
	};

	return (
		<div className="flex flex-col border-b border-border px-2 pb-2">
			<div className="flex items-center gap-2 px-2 py-1.5">
				<LuLayers className="w-4 h-4 text-muted-foreground" />
				<span className="text-sm font-medium text-muted-foreground">
					Workspaces
				</span>
			</div>
			<button
				type="button"
				onClick={handleNewWorkspace}
				className="flex items-center gap-2 px-2 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent/50 rounded-md transition-colors"
			>
				<div className="flex items-center justify-center size-5 rounded bg-accent">
					<LuPlus className="size-3" />
				</div>
				<span>New Workspace</span>
			</button>
		</div>
	);
}
