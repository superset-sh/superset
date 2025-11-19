import { useWorkspacesStore } from "renderer/stores/workspaces";
import { ContentView } from "./ContentView";
import { NewWorkspaceView } from "./NewWorkspaceView";
import { Sidebar } from "./Sidebar";

export function WorkspaceView() {
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
			<ContentView />
		</div>
	);
}
