import { LuPlus } from "react-icons/lu";
import { trpc } from "renderer/lib/trpc";
import { useOpenNewWorkspaceModal } from "renderer/stores/new-workspace-modal";

export function NewWorkspaceButton() {
	const openModal = useOpenNewWorkspaceModal();
	const { data: activeWorkspace, isLoading } =
		trpc.workspaces.getActive.useQuery();

	const handleClick = () => {
		// projectId may be undefined if no workspace is active or query failed
		// openModal handles undefined by opening without a pre-selected project
		const projectId = activeWorkspace?.projectId;
		openModal(projectId);
	};

	return (
		<button
			type="button"
			onClick={handleClick}
			disabled={isLoading}
			className="flex items-center gap-2 px-2 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent/50 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
		>
			<div className="flex items-center justify-center size-5 rounded bg-accent">
				<LuPlus className="size-3" />
			</div>
			<span>New Workspace</span>
		</button>
	);
}
