import { trpc } from "renderer/lib/trpc";
import { ContentView } from "./ContentView";
import { NewWorkspaceView } from "./NewWorkspaceView";
import { Sidebar } from "./Sidebar";

export function WorkspaceView() {
	const { data: activeWorkspace } = trpc.workspaces.getActive.useQuery();

	// If no workspace or workspace has no path, show new workspace view
	const isNew = !activeWorkspace || activeWorkspace.path === null;

	if (isNew) {
		return (
			<div className="flex flex-1 bg-sidebar">
				<NewWorkspaceView />
			</div>
		);
	}

	return (
		<div className="flex flex-1 bg-sidebar">
			<Sidebar />
			<div className="flex-1 m-3 bg-background rounded p-2">
				<ContentView />
			</div>
		</div>
	);
}
