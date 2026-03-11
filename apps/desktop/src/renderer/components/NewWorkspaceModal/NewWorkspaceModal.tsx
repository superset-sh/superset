import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import { toast } from "@superset/ui/sonner";
import { useNavigate } from "@tanstack/react-router";
import { useOpenProject } from "renderer/react-query/projects";
import {
	useCloseNewWorkspaceModal,
	useNewWorkspaceModalOpen,
	usePreSelectedProjectId,
} from "renderer/stores/new-workspace-modal";
import { NewWorkspaceModalContent } from "./components/NewWorkspaceModalContent";
import { NewWorkspaceModalDraftProvider } from "./NewWorkspaceModalDraftContext";

export function NewWorkspaceModal() {
	const isOpen = useNewWorkspaceModalOpen();
	const closeModal = useCloseNewWorkspaceModal();
	const navigate = useNavigate();
	const { openNew } = useOpenProject();
	const preSelectedProjectId = usePreSelectedProjectId();

	const handleImportRepo = async () => {
		closeModal();
		try {
			await openNew();
		} catch (error) {
			toast.error("Failed to open project", {
				description:
					error instanceof Error ? error.message : "An unknown error occurred",
			});
		}
	};

	const handleNewProject = () => {
		closeModal();
		navigate({ to: "/new-project" });
	};

	return (
		<NewWorkspaceModalDraftProvider onClose={closeModal}>
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
					<NewWorkspaceModalContent
						isOpen={isOpen}
						preSelectedProjectId={preSelectedProjectId}
						onImportRepo={handleImportRepo}
						onNewProject={handleNewProject}
					/>
				</DialogContent>
			</Dialog>
		</NewWorkspaceModalDraftProvider>
	);
}
