import { Button } from "@superset/ui/button";
import { trpc } from "renderer/lib/trpc";

export function AddWorkspaceButton() {
	const utils = trpc.useUtils();
	const createWorkspace = trpc.workspaces.create.useMutation({
		onSuccess: async () => {
			// Invalidate all workspace queries
			await utils.workspaces.invalidate();
		},
	});

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
