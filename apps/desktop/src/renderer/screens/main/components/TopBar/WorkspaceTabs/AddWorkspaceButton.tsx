import { Button } from "@superset/ui/button";
import { useWorkspacesStore } from "renderer/stores/workspaces";

export function AddWorkspaceButton() {
	const { addWorkspace } = useWorkspacesStore();

	return (
		<Button
			variant="ghost"
			size="icon"
			onClick={addWorkspace}
			aria-label="Add new workspace"
			className=""
		>
			<span className="text-lg">+</span>
		</Button>
	);
}
