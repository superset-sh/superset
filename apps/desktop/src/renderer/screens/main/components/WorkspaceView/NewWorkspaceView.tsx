import { useWorkspacesStore } from "renderer/stores/workspaces";
import { useAddTab } from "renderer/stores";

export function NewWorkspaceView() {
	const activeWorkspaceId = useWorkspacesStore(
		(state) => state.activeWorkspaceId,
	);
	const addWorkspace = useWorkspacesStore((state) => state.addWorkspace);
	const markWorkspaceAsUsed = useWorkspacesStore(
		(state) => state.markWorkspaceAsUsed,
	);
	const addTab = useAddTab();

	return (
		<div className="flex-1 h-full flex items-center justify-center">
			<div className="text-center max-w-2xl px-6">
				<h1 className="text-4xl font-bold text-foreground mb-4">
					New Workspace
				</h1>
				<p className="text-lg text-muted-foreground mb-8">
					Start by selecting an action or creating something new
				</p>
				<div className="grid grid-cols-2 gap-4 max-w-md mx-auto">
					<button
						type="button"
						className="p-6 border border-border rounded-lg hover:bg-accent hover:border-accent-foreground transition-colors text-left"
					>
						<div className="text-2xl mb-2">📁</div>
						<div className="font-medium text-foreground">Open Project</div>
						<div className="text-sm text-muted-foreground">
							Browse your files
						</div>
					</button>
					<button
						type="button"
						className="p-6 border border-border rounded-lg hover:bg-accent hover:border-accent-foreground transition-colors text-left"
					>
						<div className="text-2xl mb-2">⚡</div>
						<div className="font-medium text-foreground">Quick Actions</div>
						<div className="text-sm text-muted-foreground">Common tasks</div>
					</button>
					<button
						type="button"
						onClick={() => {
							if (!activeWorkspaceId) {
								addWorkspace();
								setTimeout(() => {
									const newWorkspaceId =
										useWorkspacesStore.getState().activeWorkspaceId;
									if (newWorkspaceId) {
										addTab(newWorkspaceId);
										markWorkspaceAsUsed(newWorkspaceId);
									}
								}, 0);
							} else {
								addTab(activeWorkspaceId);
								markWorkspaceAsUsed(activeWorkspaceId);
							}
						}}
						className="p-6 border border-border rounded-lg hover:bg-accent hover:border-accent-foreground transition-colors text-left"
					>
						<div className="text-2xl mb-2">🔍</div>
						<div className="font-medium text-foreground">Create Tab & Start</div>
						<div className="text-sm text-muted-foreground">Test persistence</div>
					</button>
					<button
						type="button"
						className="p-6 border border-border rounded-lg hover:bg-accent hover:border-accent-foreground transition-colors text-left"
					>
						<div className="text-2xl mb-2">⚙️</div>
						<div className="font-medium text-foreground">Settings</div>
						<div className="text-sm text-muted-foreground">Configure app</div>
					</button>
				</div>
			</div>
		</div>
	);
}
