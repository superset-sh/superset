import { useWorkspacesStore } from "renderer/stores/workspaces";
import { CenterView } from "./CenterView";
import { NewWorkspaceView } from "./NewWorkspaceView";
import { Sidebar } from "./Sidebar";

export function TabView() {
	const { workspaces, activeWorkspaceId } = useWorkspacesStore();
	const activeWorkspace = workspaces.find(
		(workspace) => workspace.id === activeWorkspaceId,
	);

	if (activeWorkspace?.isNew) {
		return (
			<div className="flex flex-1">
				<NewWorkspaceView />
			</div>
		);
	}

	return (
		<div className="flex flex-1">
			<Sidebar />
			<CenterView />
		</div>
	);
}
