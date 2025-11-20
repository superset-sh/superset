import { Button } from "@superset/ui/button";
import { useCreateWorkspace } from "renderer/react-query/workspaces";

export function AddWorkspaceButton() {
	const createWorkspace = useCreateWorkspace();

	const handleAddWorkspace = () => {
		createWorkspace.mutate({
			name: "New Workspace",
		});
	};

	return (
		<Button
			variant="ghost"
			size="icon"
			onClick={handleAddWorkspace}
			aria-label="Add new workspace"
		>
			<span className="text-lg">+</span>
		</Button>
	);
}
