import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import {
	useCloseNewWorkspaceModal,
	useNewWorkspaceModalOpen,
	usePreSelectedProjectId,
} from "renderer/stores/new-workspace-modal";
import { DashboardNewWorkspaceForm } from "./components/DashboardNewWorkspaceForm";
import { DashboardNewWorkspaceDraftProvider } from "./DashboardNewWorkspaceDraftContext";

export function DashboardNewWorkspaceModal() {
	const isOpen = useNewWorkspaceModalOpen();
	const closeModal = useCloseNewWorkspaceModal();
	const preSelectedProjectId = usePreSelectedProjectId();

	return (
		<DashboardNewWorkspaceDraftProvider onClose={closeModal}>
			<Dialog open={isOpen} onOpenChange={(open) => !open && closeModal()}>
				<DialogHeader className="sr-only">
					<DialogTitle>New Workspace</DialogTitle>
					<DialogDescription>
						Create a new workspace from a PR, branch, issue, or prompt.
					</DialogDescription>
				</DialogHeader>
				<DialogContent
					showCloseButton={false}
					className="bg-popover text-popover-foreground sm:max-w-[560px] max-h-[min(70vh,600px)] !top-[calc(50%-min(35vh,300px))] !-translate-y-0 flex flex-col overflow-hidden p-0"
				>
					<DashboardNewWorkspaceForm
						isOpen={isOpen}
						preSelectedProjectId={preSelectedProjectId}
					/>
				</DialogContent>
			</Dialog>
		</DashboardNewWorkspaceDraftProvider>
	);
}
